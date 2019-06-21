'use strict';

var Log = require('../log');
var util = require('../util');
var RTCPC = require('./rtcpc');

var INITIAL_ICE_CONNECTION_STATE = 'new';

/**
 * @typedef {Object} PeerConnection
 * @param audioHelper
 * @param pstream
 * @param options
 * @return {PeerConnection}
 * @constructor
 */
function PeerConnection(audioHelper, pstream, getUserMedia, options) {
  if (!audioHelper || !pstream || !getUserMedia) {
    throw new Error('Audiohelper, pstream and getUserMedia are required arguments');
  }

  if (!(this instanceof PeerConnection)) {
    return new PeerConnection(audioHelper, pstream, getUserMedia, options);
  }

  function noop() {}
  this.onopen = noop;
  this.onerror = noop;
  this.onclose = noop;
  this.ondisconnect = noop;
  this.onreconnect = noop;
  this.onsignalingstatechange = noop;
  this.oniceconnectionstatechange = noop;
  this.onicegatheringstatechange = noop;
  this.onicecandidate = noop;
  this.onvolume = noop;
  this.version = null;
  this.pstream = pstream;
  this.stream = null;
  this.sinkIds = new Set(['default']);
  this.outputs = new Map();
  this.status = 'connecting';
  this.callSid = null;
  this.isMuted = false;
  this.getUserMedia = getUserMedia;

  var AudioContext = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  this._isSinkSupported = !!AudioContext && typeof HTMLAudioElement !== 'undefined' && HTMLAudioElement.prototype.setSinkId;
  // NOTE(mmalavalli): Since each Connection creates its own AudioContext,
  // after 6 instances an exception is thrown. Refer https://www.w3.org/2011/audio/track/issues/3.
  // In order to get around it, we are re-using the Device's AudioContext.
  this._audioContext = AudioContext && audioHelper._audioContext;
  this._masterAudio = null;
  this._masterAudioDeviceId = null;
  this._mediaStreamSource = null;
  this._dtmfSender = null;
  this._dtmfSenderUnsupported = false;
  this._callEvents = [];
  this._nextTimeToPublish = Date.now();
  this._onAnswerOrRinging = noop;
  this._remoteStream = null;
  this._shouldManageStream = true;
  Log.mixinLog(this, '[Twilio.PeerConnection]');
  this.log.enabled = options.debug;
  this.log.warnings = options.warnings;
  this._iceState = INITIAL_ICE_CONNECTION_STATE;
  this._isUnifiedPlan = options.isUnifiedPlan;

  this.options = options = options || {};
  this.navigator = options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  this.util = options.util || util;
  this.codecPreferences = options.codecPreferences;

  return this;
}

PeerConnection.prototype.uri = function () {
  return this._uri;
};

/**
 * Open the underlying RTCPeerConnection with a MediaStream obtained by
 *   passed constraints. The resulting MediaStream is created internally
 *   and will therefore be managed and destroyed internally.
 * @param {MediaStreamConstraints} constraints
 */
PeerConnection.prototype.openWithConstraints = function (constraints) {
  return this.getUserMedia({ audio: constraints }).then(this._setInputTracksFromStream.bind(this, false));
};

/**
 * Replace the existing input audio tracks with the audio tracks from the
 *   passed input audio stream. We re-use the existing stream because
 *   the AnalyzerNode is bound to the stream.
 * @param {MediaStream} stream
 */
PeerConnection.prototype.setInputTracksFromStream = function (stream) {
  var self = this;
  return this._setInputTracksFromStream(true, stream).then(function () {
    self._shouldManageStream = false;
  });
};

PeerConnection.prototype._createAnalyser = function (audioContext, options) {
  options = Object.assign({
    fftSize: 32,
    smoothingTimeConstant: 0.3
  }, options);

  var analyser = audioContext.createAnalyser();
  for (var field in options) {
    analyser[field] = options[field];
  }

  return analyser;
};

PeerConnection.prototype._setVolumeHandler = function (handler) {
  this.onvolume = handler;
};
PeerConnection.prototype._startPollingVolume = function () {
  if (!this._audioContext || !this.stream || !this._remoteStream) {
    return;
  }

  var audioContext = this._audioContext;

  var inputAnalyser = this._inputAnalyser = this._createAnalyser(audioContext);
  var inputBufferLength = inputAnalyser.frequencyBinCount;
  var inputDataArray = new Uint8Array(inputBufferLength);
  this._inputAnalyser2 = this._createAnalyser(audioContext, {
    minDecibels: -127,
    maxDecibels: 0,
    smoothingTimeConstant: 0
  });

  var outputAnalyser = this._outputAnalyser = this._createAnalyser(audioContext);
  var outputBufferLength = outputAnalyser.frequencyBinCount;
  var outputDataArray = new Uint8Array(outputBufferLength);
  this._outputAnalyser2 = this._createAnalyser(audioContext, {
    minDecibels: -127,
    maxDecibels: 0,
    smoothingTimeConstant: 0
  });

  this._updateInputStreamSource(this.stream);
  this._updateOutputStreamSource(this._remoteStream);

  var self = this;
  requestAnimationFrame(function emitVolume() {
    if (!self._audioContext) {
      return;
    } else if (self.status === 'closed') {
      self._inputAnalyser.disconnect();
      self._outputAnalyser.disconnect();
      self._inputAnalyser2.disconnect();
      self._outputAnalyser2.disconnect();
      return;
    }

    self._inputAnalyser.getByteFrequencyData(inputDataArray);
    var inputVolume = self.util.average(inputDataArray);

    self._inputAnalyser2.getByteFrequencyData(inputDataArray);
    var inputVolume2 = self.util.average(inputDataArray);

    self._outputAnalyser.getByteFrequencyData(outputDataArray);
    var outputVolume = self.util.average(outputDataArray);

    self._outputAnalyser2.getByteFrequencyData(outputDataArray);
    var outputVolume2 = self.util.average(outputDataArray);
    self.onvolume(inputVolume / 255, outputVolume / 255, inputVolume2, outputVolume2);

    requestAnimationFrame(emitVolume);
  });
};

PeerConnection.prototype._stopStream = function _stopStream(stream) {
  // We shouldn't stop the tracks if they were not created inside
  //   this PeerConnection.
  if (!this._shouldManageStream) {
    return;
  }

  if (typeof MediaStreamTrack.prototype.stop === 'function') {
    var audioTracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : stream.audioTracks;
    audioTracks.forEach(function (track) {
      track.stop();
    });
  }
  // NOTE(mroberts): This is just a fallback to any ancient browsers that may
  // not implement MediaStreamTrack.stop.
  else {
      stream.stop();
    }
};

/**
 * Update the stream source with the new input audio stream.
 * @param {MediaStream} stream
 * @private
 */
PeerConnection.prototype._updateInputStreamSource = function (stream) {
  if (this._inputStreamSource) {
    this._inputStreamSource.disconnect();
  }

  this._inputStreamSource = this._audioContext.createMediaStreamSource(stream);
  this._inputStreamSource.connect(this._inputAnalyser);
  this._inputStreamSource.connect(this._inputAnalyser2);
};

/**
 * Update the stream source with the new ouput audio stream.
 * @param {MediaStream} stream
 * @private
 */
PeerConnection.prototype._updateOutputStreamSource = function (stream) {
  if (this._outputStreamSource) {
    this._outputStreamSource.disconnect();
  }

  this._outputStreamSource = this._audioContext.createMediaStreamSource(stream);
  this._outputStreamSource.connect(this._outputAnalyser);
  this._outputStreamSource.connect(this._outputAnalyser2);
};

/**
 * Replace the tracks of the current stream with new tracks. We do this rather than replacing the
 *   whole stream because AnalyzerNodes are bound to a stream.
 * @param {Boolean} shouldClone - Whether the stream should be cloned if it is the first
 *   stream, or set directly. As a rule of thumb, streams that are passed in externally may have
 *   their lifecycle managed externally, and should be cloned so that we do not tear it or its tracks
 *   down when the call ends. Streams that we create internally (inside PeerConnection) should be set
 *   directly so that when the call ends it is disposed of.
 * @param {MediaStream} newStream - The new stream to copy the tracks over from.
 * @private
 */
PeerConnection.prototype._setInputTracksFromStream = function (shouldClone, newStream) {
  return this._isUnifiedPlan ? this._setInputTracksForUnifiedPlan(shouldClone, newStream) : this._setInputTracksForPlanB(shouldClone, newStream);
};

/**
 * Replace the tracks of the current stream with new tracks using the 'plan-b' method.
 * @param {Boolean} shouldClone - Whether the stream should be cloned if it is the first
 *   stream, or set directly. As a rule of thumb, streams that are passed in externally may have
 *   their lifecycle managed externally, and should be cloned so that we do not tear it or its tracks
 *   down when the call ends. Streams that we create internally (inside PeerConnection) should be set
 *   directly so that when the call ends it is disposed of.
 * @param {MediaStream} newStream - The new stream to copy the tracks over from.
 * @private
 */
PeerConnection.prototype._setInputTracksForPlanB = function (shouldClone, newStream) {
  var _this = this;

  if (!newStream) {
    return Promise.reject(new Error('Can not set input stream to null while in a call'));
  }

  if (!newStream.getAudioTracks().length) {
    return Promise.reject(new Error('Supplied input stream has no audio tracks'));
  }

  var localStream = this.stream;

  if (!localStream) {
    // We can't use MediaStream.clone() here because it stopped copying over tracks
    //   as of Chrome 61. https://bugs.chromium.org/p/chromium/issues/detail?id=770908
    this.stream = shouldClone ? cloneStream(newStream) : newStream;
  } else {
    this._stopStream(localStream);

    removeStream(this.version.pc, localStream);
    localStream.getAudioTracks().forEach(localStream.removeTrack, localStream);
    newStream.getAudioTracks().forEach(localStream.addTrack, localStream);
    addStream(this.version.pc, newStream);

    this._updateInputStreamSource(this.stream);
  }

  // Apply mute settings to new input track
  this.mute(this.isMuted);

  if (!this.version) {
    return Promise.resolve(this.stream);
  }

  return new Promise(function (resolve, reject) {
    _this.version.createOffer(_this.codecPreferences, { audio: true }, function () {
      _this.version.processAnswer(_this.codecPreferences, _this._answerSdp, function () {
        resolve(_this.stream);
      }, reject);
    }, reject);
  });
};

/**
 * Replace the tracks of the current stream with new tracks using the 'unified-plan' method.
 * @param {Boolean} shouldClone - Whether the stream should be cloned if it is the first
 *   stream, or set directly. As a rule of thumb, streams that are passed in externally may have
 *   their lifecycle managed externally, and should be cloned so that we do not tear it or its tracks
 *   down when the call ends. Streams that we create internally (inside PeerConnection) should be set
 *   directly so that when the call ends it is disposed of.
 * @param {MediaStream} newStream - The new stream to copy the tracks over from.
 * @private
 */
PeerConnection.prototype._setInputTracksForUnifiedPlan = function (shouldClone, newStream) {
  var _this2 = this;

  if (!newStream) {
    return Promise.reject(new Error('Can not set input stream to null while in a call'));
  }

  if (!newStream.getAudioTracks().length) {
    return Promise.reject(new Error('Supplied input stream has no audio tracks'));
  }

  var localStream = this.stream;
  var getStreamPromise = function getStreamPromise() {
    // Apply mute settings to new input track
    _this2.mute(_this2.isMuted);
    return Promise.resolve(_this2.stream);
  };

  if (!localStream) {
    // We can't use MediaStream.clone() here because it stopped copying over tracks
    //   as of Chrome 61. https://bugs.chromium.org/p/chromium/issues/detail?id=770908
    this.stream = shouldClone ? cloneStream(newStream) : newStream;
  } else {
    // If the call was started with gUM, and we are now replacing that track with an
    // external stream's tracks, we should stop the old managed track.
    if (this._shouldManageStream) {
      this._stopStream(localStream);
    }

    if (!this._sender) {
      this._sender = this.version.pc.getSenders()[0];
    }

    return this._sender.replaceTrack(newStream.getAudioTracks()[0]).then(function () {
      _this2._updateInputStreamSource(newStream);
      return getStreamPromise();
    });
  }

  return getStreamPromise();
};

PeerConnection.prototype._onInputDevicesChanged = function () {
  if (!this.stream) {
    return;
  }

  // If all of our active tracks are ended, then our active input was lost
  var activeInputWasLost = this.stream.getAudioTracks().every(function (track) {
    return track.readyState === 'ended';
  });

  // We only want to act if we manage the stream in PeerConnection (It was created
  // here, rather than passed in.)
  if (activeInputWasLost && this._shouldManageStream) {
    this.openWithConstraints(true);
  }
};

PeerConnection.prototype._setSinkIds = function (sinkIds) {
  if (!this._isSinkSupported) {
    return Promise.reject(new Error('Audio output selection is not supported by this browser'));
  }

  this.sinkIds = new Set(sinkIds.forEach ? sinkIds : [sinkIds]);
  return this.version ? this._updateAudioOutputs() : Promise.resolve();
};

PeerConnection.prototype._updateAudioOutputs = function updateAudioOutputs() {
  var addedOutputIds = Array.from(this.sinkIds).filter(function (id) {
    return !this.outputs.has(id);
  }, this);

  var removedOutputIds = Array.from(this.outputs.keys()).filter(function (id) {
    return !this.sinkIds.has(id);
  }, this);

  var self = this;
  var createOutputPromises = addedOutputIds.map(this._createAudioOutput, this);
  return Promise.all(createOutputPromises).then(function () {
    return Promise.all(removedOutputIds.map(self._removeAudioOutput, self));
  });
};

PeerConnection.prototype._createAudio = function createAudio(arr) {
  return new Audio(arr);
};

PeerConnection.prototype._createAudioOutput = function createAudioOutput(id) {
  var dest = this._audioContext.createMediaStreamDestination();
  this._mediaStreamSource.connect(dest);

  var audio = this._createAudio();
  setAudioSource(audio, dest.stream);

  var self = this;
  return audio.setSinkId(id).then(function () {
    return audio.play();
  }).then(function () {
    self.outputs.set(id, {
      audio: audio,
      dest: dest
    });
  });
};

PeerConnection.prototype._removeAudioOutputs = function removeAudioOutputs() {
  if (this._masterAudio && typeof this._masterAudioDeviceId !== 'undefined') {
    this._disableOutput(this, this._masterAudioDeviceId);
    this.outputs.delete(this._masterAudioDeviceId);
    this._masterAudioDeviceId = null;

    // Release the audio resources before deleting the audio
    if (!this._masterAudio.paused) {
      this._masterAudio.pause();
    }
    if (typeof this._masterAudio.srcObject !== 'undefined') {
      this._masterAudio.srcObject = null;
    } else {
      this._masterAudio.src = '';
    }
    this._masterAudio = null;
  }

  return Array.from(this.outputs.keys()).map(this._removeAudioOutput, this);
};

PeerConnection.prototype._disableOutput = function disableOutput(pc, id) {
  var output = pc.outputs.get(id);
  if (!output) {
    return;
  }

  if (output.audio) {
    output.audio.pause();
    output.audio.src = '';
  }

  if (output.dest) {
    output.dest.disconnect();
  }
};

/**
 * Disable a non-master output, and update the master output to assume its state. This
 *   is called when the device ID assigned to the master output has been removed from
 *   active devices. We can not simply remove the master audio output, so we must
 *   instead reassign it.
 * @private
 * @param {PeerConnection} pc
 * @param {string} masterId - The current device ID assigned to the master audio element.
 */
PeerConnection.prototype._reassignMasterOutput = function reassignMasterOutput(pc, masterId) {
  var masterOutput = pc.outputs.get(masterId);
  pc.outputs.delete(masterId);

  var self = this;
  var idToReplace = Array.from(pc.outputs.keys())[0] || 'default';
  return masterOutput.audio.setSinkId(idToReplace).then(function () {
    self._disableOutput(pc, idToReplace);

    pc.outputs.set(idToReplace, masterOutput);
    pc._masterAudioDeviceId = idToReplace;
  }).catch(function rollback() {
    pc.outputs.set(masterId, masterOutput);
    self.log('Could not reassign master output. Attempted to roll back.');
  });
};

PeerConnection.prototype._removeAudioOutput = function removeAudioOutput(id) {
  if (this._masterAudioDeviceId === id) {
    return this._reassignMasterOutput(this, id);
  }

  this._disableOutput(this, id);
  this.outputs.delete(id);

  return Promise.resolve();
};

/**
 * Use an AudioContext to potentially split our audio output stream to multiple
 *   audio devices. This is only available to browsers with AudioContext and
 *   HTMLAudioElement.setSinkId() available. We save the source stream in
 *   _masterAudio, and use it for one of the active audio devices. We keep
 *   track of its ID because we must replace it if we lose its initial device.
 */
PeerConnection.prototype._onAddTrack = function onAddTrack(pc, stream) {
  var audio = pc._masterAudio = this._createAudio();
  setAudioSource(audio, stream);
  audio.play();

  // Assign the initial master audio element to a random active output device
  var deviceId = Array.from(pc.outputs.keys())[0] || 'default';
  pc._masterAudioDeviceId = deviceId;
  pc.outputs.set(deviceId, {
    audio: audio
  });

  pc._mediaStreamSource = pc._audioContext.createMediaStreamSource(stream);

  pc.pcStream = stream;
  pc._updateAudioOutputs();
};

/**
 * Use a single audio element to play the audio output stream. This does not
 *   support multiple output devices, and is a fallback for when AudioContext
 *   and/or HTMLAudioElement.setSinkId() is not available to the client.
 */
PeerConnection.prototype._fallbackOnAddTrack = function fallbackOnAddTrack(pc, stream) {
  var audio = document && document.createElement('audio');
  audio.autoplay = true;

  if (!setAudioSource(audio, stream)) {
    pc.log('Error attaching stream to element.');
  }

  pc.outputs.set('default', {
    audio: audio
  });
};

PeerConnection.prototype._setNetworkPriority = function (priority) {
  if (!this.options || !this.options.dscp || !this._sender || typeof this._sender.getParameters !== 'function' || typeof this._sender.setParameters !== 'function') {
    return;
  }

  var params = this._sender.getParameters();
  if (!params.priority && !(params.encodings && params.encodings.length)) {
    return;
  }

  // This is how MDN's RTPSenderParameters defines priority
  params.priority = priority;

  // And this is how it's currently implemented in Chrome M72+
  if (params.encodings && params.encodings.length) {
    params.encodings.forEach(function (encoding) {
      encoding.priority = priority;
      encoding.networkPriority = priority;
    });
  }

  this._sender.setParameters(params);
};

PeerConnection.prototype._setupPeerConnection = function (rtcConstraints, rtcConfiguration) {
  var _this3 = this;

  var self = this;
  var version = this._getProtocol();
  version.create(this.log, rtcConstraints, rtcConfiguration);
  addStream(version.pc, this.stream);

  var eventName = 'ontrack' in version.pc ? 'ontrack' : 'onaddstream';

  version.pc[eventName] = function (event) {
    var stream = self._remoteStream = event.stream || event.streams[0];

    if (typeof version.pc.getSenders === 'function') {
      _this3._sender = version.pc.getSenders()[0];
    }

    if (self._isSinkSupported) {
      self._onAddTrack(self, stream);
    } else {
      self._fallbackOnAddTrack(self, stream);
    }

    self._startPollingVolume();
  };
  return version;
};
PeerConnection.prototype._setupChannel = function () {
  var _this4 = this;

  var pc = this.version.pc;

  // Chrome 25 supports onopen
  this.version.pc.onopen = function () {
    _this4.status = 'open';
    _this4.onopen();
  };

  // Chrome 26 doesn't support onopen so must detect state change
  this.version.pc.onstatechange = function () {
    if (_this4.version.pc && _this4.version.pc.readyState === 'stable') {
      _this4.status = 'open';
      _this4.onopen();
    }
  };

  // Chrome 27 changed onstatechange to onsignalingstatechange
  this.version.pc.onsignalingstatechange = function () {
    var state = pc.signalingState;
    _this4.log('signalingState is "' + state + '"');

    if (_this4.version.pc && _this4.version.pc.signalingState === 'stable') {
      _this4.status = 'open';
      _this4.onopen();
    }

    _this4.onsignalingstatechange(pc.signalingState);
  };

  pc.onicecandidate = function (event) {
    _this4.onicecandidate(event.candidate);
  };

  pc.onicegatheringstatechange = function () {
    _this4.onicegatheringstatechange(pc.iceGatheringState);
  };

  pc.oniceconnectionstatechange = function () {
    var state = pc.iceConnectionState;
    // Grab our previous state to help determine cause of state change
    var previousState = _this4._iceState;
    _this4._iceState = state;

    var message = void 0;
    switch (state) {
      case 'connected':
        if (previousState === 'disconnected') {
          message = 'ICE liveliness check succeeded. Connection with Twilio restored';
          _this4.log(message);
          _this4.onreconnect(message);
        }
        break;
      case 'disconnected':
        message = 'ICE liveliness check failed. May be having trouble connecting to Twilio';
        _this4.log(message);
        _this4.ondisconnect(message);
        break;
      case 'failed':
        // Takes care of checking->failed and disconnected->failed
        message = previousState === 'checking' ? 'ICE negotiation with Twilio failed.' : 'Connection with Twilio was interrupted.';

        _this4.log(message);
        _this4.onerror({
          info: {
            code: 31003,
            message: message
          }
        });
        break;
      default:
        _this4.log('iceConnectionState is "' + state + '"');
    }

    _this4.oniceconnectionstatechange(state);
  };
};
PeerConnection.prototype._initializeMediaStream = function (rtcConstraints, rtcConfiguration) {
  // if mediastream already open then do nothing
  if (this.status === 'open') {
    return false;
  }
  if (this.pstream.status === 'disconnected') {
    this.onerror({ info: {
        code: 31000,
        message: 'Cannot establish connection. Client is disconnected'
      } });
    this.close();
    return false;
  }
  this.version = this._setupPeerConnection(rtcConstraints, rtcConfiguration);
  this._setupChannel();
  return true;
};

/**
 * Restarts ICE for the current connection
 * @private
 */
PeerConnection.prototype.iceRestart = function () {
  var _this5 = this;

  return new Promise(function (resolve, reject) {
    _this5.log('Attempting to restart ICE...');
    _this5.version.createOffer(_this5.codecPreferences, { iceRestart: true }).then(function () {
      _this5._onAnswerOrRinging = function (payload) {
        if (!payload.sdp) {
          return reject();
        }

        _this5._answerSdp = payload.sdp;
        _this5.pstream.removeListener('answer', _this5._onAnswerOrRinging);

        if (_this5.status !== 'closed') {
          return _this5.version.processAnswer(_this5.codecPreferences, payload.sdp, resolve, function (err) {
            var errMsg = err.message || err;
            _this5.onerror({ info: { code: 31000, message: 'Error processing answer to re-invite: ' + errMsg } });
            reject(err);
          });
        }
        return reject();
      };
      _this5.pstream.addListener('answer', _this5._onAnswerOrRinging);
      _this5.pstream.publish('reinvite', {
        sdp: _this5.version.getSDP(),
        callsid: _this5.callSid
      });
    }, reject);
  });
};

PeerConnection.prototype.makeOutgoingCall = function (token, params, callsid, rtcConstraints, rtcConfiguration, onMediaStarted) {
  var _this6 = this;

  if (!this._initializeMediaStream(rtcConstraints, rtcConfiguration)) {
    return;
  }

  var self = this;
  this.callSid = callsid;
  function onAnswerSuccess() {
    self._setNetworkPriority('high');
    onMediaStarted(self.version.pc);
  }
  function onAnswerError(err) {
    var errMsg = err.message || err;
    self.onerror({ info: { code: 31000, message: 'Error processing answer: ' + errMsg } });
  }
  this._onAnswerOrRinging = function (payload) {
    if (!payload.sdp) {
      return;
    }

    self._answerSdp = payload.sdp;
    if (self.status !== 'closed') {
      self.version.processAnswer(_this6.codecPreferences, payload.sdp, onAnswerSuccess, onAnswerError);
    }
    self.pstream.removeListener('answer', self._onAnswerOrRinging);
    self.pstream.removeListener('ringing', self._onAnswerOrRinging);
  };
  this.pstream.on('answer', this._onAnswerOrRinging);
  this.pstream.on('ringing', this._onAnswerOrRinging);

  function onOfferSuccess() {
    if (self.status !== 'closed') {
      self.pstream.publish('invite', {
        sdp: self.version.getSDP(),
        callsid: self.callSid,
        twilio: params ? { params: params } : {}
      });
    }
  }

  function onOfferError(err) {
    var errMsg = err.message || err;
    self.onerror({ info: { code: 31000, message: 'Error creating the offer: ' + errMsg } });
  }

  this.version.createOffer(this.codecPreferences, { audio: true }, onOfferSuccess, onOfferError);
};
PeerConnection.prototype.answerIncomingCall = function (callSid, sdp, rtcConstraints, rtcConfiguration, onMediaStarted) {
  if (!this._initializeMediaStream(rtcConstraints, rtcConfiguration)) {
    return;
  }
  this._answerSdp = sdp.replace(/^a=setup:actpass$/gm, 'a=setup:passive');
  this.callSid = callSid;
  var self = this;
  function onAnswerSuccess() {
    if (self.status !== 'closed') {
      self.pstream.publish('answer', {
        callsid: callSid,
        sdp: self.version.getSDP()
      });
      self._setNetworkPriority('high');
      onMediaStarted(self.version.pc);
    }
  }
  function onAnswerError(err) {
    var errMsg = err.message || err;
    self.onerror({ info: { code: 31000, message: 'Error creating the answer: ' + errMsg } });
  }
  this.version.processSDP(this.codecPreferences, sdp, { audio: true }, onAnswerSuccess, onAnswerError);
};
PeerConnection.prototype.close = function () {
  if (this.version && this.version.pc) {
    if (this.version.pc.signalingState !== 'closed') {
      this.version.pc.close();
    }

    this.version.pc = null;
  }
  if (this.stream) {
    this.mute(false);
    this._stopStream(this.stream);
  }
  this.stream = null;
  if (this.pstream) {
    this.pstream.removeListener('answer', this._onAnswerOrRinging);
  }
  Promise.all(this._removeAudioOutputs()).catch(function () {
    // We don't need to alert about failures here.
  });
  if (this._mediaStreamSource) {
    this._mediaStreamSource.disconnect();
  }
  if (this._inputAnalyser) {
    this._inputAnalyser.disconnect();
  }
  if (this._outputAnalyser) {
    this._outputAnalyser.disconnect();
  }
  if (this._inputAnalyser2) {
    this._inputAnalyser2.disconnect();
  }
  if (this._outputAnalyser2) {
    this._outputAnalyser2.disconnect();
  }
  this.status = 'closed';
  this.onclose();
};
PeerConnection.prototype.reject = function (callSid) {
  this.callSid = callSid;
};
PeerConnection.prototype.ignore = function (callSid) {
  this.callSid = callSid;
};
/**
 * Mute or unmute input audio. If the stream is not yet present, the setting
 *   is saved and applied to future streams/tracks.
 * @params {boolean} shouldMute - Whether the input audio should
 *   be muted or unmuted.
 */
PeerConnection.prototype.mute = function (shouldMute) {
  this.isMuted = shouldMute;
  if (!this.stream) {
    return;
  }

  if (this._sender && this._sender.track) {
    this._sender.track.enabled = !shouldMute;
  } else {
    var audioTracks = typeof this.stream.getAudioTracks === 'function' ? this.stream.getAudioTracks() : this.stream.audioTracks;

    audioTracks.forEach(function (track) {
      track.enabled = !shouldMute;
    });
  }
};
/**
 * Get or create an RTCDTMFSender for the first local audio MediaStreamTrack
 * we can get from the RTCPeerConnection. Return null if unsupported.
 * @instance
 * @returns ?RTCDTMFSender
 */
PeerConnection.prototype.getOrCreateDTMFSender = function getOrCreateDTMFSender() {
  if (this._dtmfSender || this._dtmfSenderUnsupported) {
    return this._dtmfSender || null;
  }

  var self = this;
  var pc = this.version.pc;
  if (!pc) {
    this.log('No RTCPeerConnection available to call createDTMFSender on');
    return null;
  }

  if (typeof pc.getSenders === 'function' && (typeof RTCDTMFSender === 'function' || typeof RTCDtmfSender === 'function')) {
    var chosenSender = pc.getSenders().find(function (sender) {
      return sender.dtmf;
    });
    if (chosenSender) {
      this.log('Using RTCRtpSender#dtmf');
      this._dtmfSender = chosenSender.dtmf;
      return this._dtmfSender;
    }
  }

  if (typeof pc.createDTMFSender === 'function' && typeof pc.getLocalStreams === 'function') {
    var track = pc.getLocalStreams().map(function (stream) {
      var tracks = self._getAudioTracks(stream);
      return tracks && tracks[0];
    })[0];

    if (!track) {
      this.log('No local audio MediaStreamTrack available on the RTCPeerConnection to pass to createDTMFSender');
      return null;
    }

    this.log('Creating RTCDTMFSender');
    this._dtmfSender = pc.createDTMFSender(track);
    return this._dtmfSender;
  }

  this.log('RTCPeerConnection does not support RTCDTMFSender');
  this._dtmfSenderUnsupported = true;
  return null;
};

PeerConnection.prototype._canStopMediaStreamTrack = function () {
  return typeof MediaStreamTrack.prototype.stop === 'function';
};

PeerConnection.prototype._getAudioTracks = function (stream) {
  return typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : stream.audioTracks;
};

PeerConnection.prototype._getProtocol = function () {
  return PeerConnection.protocol;
};

PeerConnection.protocol = function () {
  return RTCPC.test() ? new RTCPC() : null;
}();

function addStream(pc, stream) {
  if (typeof pc.addTrack === 'function') {
    stream.getAudioTracks().forEach(function (track) {
      // The second parameters, stream, should not be necessary per the latest editor's
      //   draft, but FF requires it. https://bugzilla.mozilla.org/show_bug.cgi?id=1231414
      pc.addTrack(track, stream);
    });
  } else {
    pc.addStream(stream);
  }
}

function cloneStream(oldStream) {
  var newStream = typeof MediaStream !== 'undefined' ? new MediaStream()
  // eslint-disable-next-line
  : new webkitMediaStream();

  oldStream.getAudioTracks().forEach(newStream.addTrack, newStream);
  return newStream;
}

function removeStream(pc, stream) {
  if (typeof pc.removeTrack === 'function') {
    pc.getSenders().forEach(function (sender) {
      pc.removeTrack(sender);
    });
  } else {
    pc.removeStream(stream);
  }
}

/**
 * Set the source of an HTMLAudioElement to the specified MediaStream
 * @param {HTMLAudioElement} audio
 * @param {MediaStream} stream
 * @returns {boolean} Whether the audio source was set successfully
 */
function setAudioSource(audio, stream) {
  if (typeof audio.srcObject !== 'undefined') {
    audio.srcObject = stream;
  } else if (typeof audio.mozSrcObject !== 'undefined') {
    audio.mozSrcObject = stream;
  } else if (typeof audio.src !== 'undefined') {
    var _window = audio.options.window || window;
    audio.src = (_window.URL || _window.webkitURL).createObjectURL(stream);
  } else {
    return false;
  }

  return true;
}

PeerConnection.enabled = !!PeerConnection.protocol;

module.exports = PeerConnection;