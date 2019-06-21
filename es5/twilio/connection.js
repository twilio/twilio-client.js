"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module Voice
 * @publicapi
 * @internal
 */
var events_1 = require("events");
var device_1 = require("./device");
var monitor_1 = require("./rtc/monitor");
var tslog_1 = require("./tslog");
var util_1 = require("./util");
var C = require('./constants');
var PeerConnection = require('./rtc').PeerConnection;
var DTMF_INTER_TONE_GAP = 70;
var DTMF_PAUSE_DURATION = 500;
var DTMF_TONE_DURATION = 160;
var ICE_RESTART_INTERVAL = 3000;
var METRICS_BATCH_SIZE = 10;
var METRICS_DELAY = 5000;
var WARNING_NAMES = {
    audioInputLevel: 'audio-input-level',
    audioOutputLevel: 'audio-output-level',
    bytesReceived: 'bytes-received',
    bytesSent: 'bytes-sent',
    jitter: 'jitter',
    mos: 'mos',
    packetsLostFraction: 'packet-loss',
    rtt: 'rtt',
};
var WARNING_PREFIXES = {
    max: 'high-',
    maxDuration: 'constant-',
    min: 'low-',
};
var hasBeenWarnedHandlers = false;
/**
 * A {@link Connection} represents a media and signaling connection to a TwiML application.
 * @publicapi
 */
var Connection = /** @class */ (function (_super) {
    __extends(Connection, _super);
    /**
     * @constructor
     * @private
     * @param config - Mandatory configuration options
     * @param [options] - Optional settings
     */
    function Connection(config, options) {
        var _this = _super.call(this) || this;
        /**
         * Call parameters received from Twilio for an incoming call.
         */
        _this.parameters = {};
        /**
         * The number of times input volume has been the same consecutively.
         */
        _this._inputVolumeStreak = 0;
        /**
         * Keeps track of internal input volumes in the last second
         */
        _this._internalInputVolumes = [];
        /**
         * Keeps track of internal output volumes in the last second
         */
        _this._internalOutputVolumes = [];
        /**
         * Whether the call has been answered.
         */
        _this._isAnswered = false;
        /**
         * The most recent public input volume value. 0 -> 1 representing -100 to -30 dB.
         */
        _this._latestInputVolume = 0;
        /**
         * The most recent public output volume value. 0 -> 1 representing -100 to -30 dB.
         */
        _this._latestOutputVolume = 0;
        /**
         * An instance of Log to use.
         */
        _this._log = new tslog_1.default(tslog_1.LogLevel.Off);
        /**
         * A batch of metrics samples to send to Insights. Gets cleared after
         * each send and appended to on each new sample.
         */
        _this._metricsSamples = [];
        /**
         * The number of times output volume has been the same consecutively.
         */
        _this._outputVolumeStreak = 0;
        /**
         * A Map of Sounds to play.
         */
        _this._soundcache = new Map();
        /**
         * State of the {@link Connection}.
         */
        _this._status = Connection.State.Pending;
        /**
         * Options passed to this {@link Connection}.
         */
        _this.options = {
            debug: false,
            enableRingingState: false,
            mediaStreamFactory: PeerConnection,
            offerSdp: null,
            shouldPlayDisconnect: function () { return true; },
        };
        /**
         * Whether the {@link Connection} should send a hangup on disconnect.
         */
        _this.sendHangup = true;
        /**
         * String representation of {@link Connection} instance.
         * @private
         */
        _this.toString = function () { return '[Twilio.Connection instance]'; };
        _this._emitWarning = function (groupPrefix, warningName, threshold, value, wasCleared) {
            var groupSuffix = wasCleared ? '-cleared' : '-raised';
            var groupName = groupPrefix + "warning" + groupSuffix;
            // Ignore constant input if the Connection is muted (Expected)
            if (warningName === 'constant-audio-input-level' && _this.isMuted()) {
                return;
            }
            var level = wasCleared ? 'info' : 'warning';
            // Avoid throwing false positives as warnings until we refactor volume metrics
            if (warningName === 'constant-audio-output-level') {
                level = 'info';
            }
            var payloadData = { threshold: threshold };
            if (value) {
                if (value instanceof Array) {
                    payloadData.values = value.map(function (val) {
                        if (typeof val === 'number') {
                            return Math.round(val * 100) / 100;
                        }
                        return value;
                    });
                }
                else {
                    payloadData.value = value;
                }
            }
            _this._publisher.post(level, groupName, warningName, { data: payloadData }, _this);
            if (warningName !== 'constant-audio-output-level') {
                var emitName = wasCleared ? 'warning-cleared' : 'warning';
                _this.emit(emitName, warningName);
            }
        };
        /**
         * Called when the {@link Connection} is answered.
         * @param payload
         */
        _this._onAnswer = function (payload) {
            // answerOnBridge=false will send a 183 which we need to catch in _onRinging when
            // the enableRingingState flag is disabled. In that case, we will receive a 200 after
            // the callee accepts the call firing a second `accept` event if we don't
            // short circuit here.
            if (_this._isAnswered) {
                return;
            }
            _this._setCallSid(payload);
            _this._isAnswered = true;
            _this._maybeTransitionToOpen();
        };
        /**
         * Called when the {@link Connection} is cancelled.
         * @param payload
         */
        _this._onCancel = function (payload) {
            // (rrowland) Is this check necessary? Verify, and if so move to pstream / VSP module.
            var callsid = payload.callsid;
            if (_this.parameters.CallSid === callsid) {
                _this._status = Connection.State.Closed;
                _this.emit('cancel');
                _this.pstream.removeListener('cancel', _this._onCancel);
            }
        };
        /**
         * Called when the {@link Connection} is hung up.
         * @param payload
         */
        _this._onHangup = function (payload) {
            /**
             *  see if callsid passed in message matches either callsid or outbound id
             *  connection should always have either callsid or outbound id
             *  if no callsid passed hangup anyways
             */
            if (payload.callsid && (_this.parameters.CallSid || _this.outboundConnectionId)) {
                if (payload.callsid !== _this.parameters.CallSid
                    && payload.callsid !== _this.outboundConnectionId) {
                    return;
                }
            }
            else if (payload.callsid) {
                // hangup is for another connection
                return;
            }
            _this._log.info('Received HANGUP from gateway');
            if (payload.error) {
                var error = {
                    code: payload.error.code || 31000,
                    connection: _this,
                    message: payload.error.message || 'Error sent from gateway in HANGUP',
                };
                _this._log.error('Received an error from the gateway:', error);
                _this.emit('error', error);
            }
            _this.sendHangup = false;
            _this._publisher.info('connection', 'disconnected-by-remote', null, _this);
            _this._disconnect(null, true);
            _this._cleanupEventListeners();
        };
        /**
         * When we get a RINGING signal from PStream, update the {@link Connection} status.
         * @param payload
         */
        _this._onRinging = function (payload) {
            _this._setCallSid(payload);
            // If we're not in 'connecting' or 'ringing' state, this event was received out of order.
            if (_this._status !== Connection.State.Connecting && _this._status !== Connection.State.Ringing) {
                return;
            }
            var hasEarlyMedia = !!payload.sdp;
            if (_this.options.enableRingingState) {
                _this._status = Connection.State.Ringing;
                _this._publisher.info('connection', 'outgoing-ringing', { hasEarlyMedia: hasEarlyMedia }, _this);
                _this.emit('ringing', hasEarlyMedia);
                // answerOnBridge=false will send a 183, which we need to interpret as `answer` when
                // the enableRingingState flag is disabled in order to maintain a non-breaking API from 1.4.24
            }
            else if (hasEarlyMedia) {
                _this._onAnswer(payload);
            }
        };
        /**
         * Called each time RTCMonitor emits a sample.
         * Emits stats event and batches the call stats metrics and sends them to Insights.
         * @param sample
         */
        _this._onRTCSample = function (sample) {
            var callMetrics = __assign({}, sample, { audioInputLevel: Math.round(util_1.average(_this._internalInputVolumes)), audioOutputLevel: Math.round(util_1.average(_this._internalOutputVolumes)), inputVolume: _this._latestInputVolume, outputVolume: _this._latestOutputVolume });
            _this._internalInputVolumes.splice(0);
            _this._internalOutputVolumes.splice(0);
            _this._codec = callMetrics.codecName;
            _this._metricsSamples.push(callMetrics);
            if (_this._metricsSamples.length >= METRICS_BATCH_SIZE) {
                _this._publishMetrics();
            }
            _this.emit('sample', sample);
        };
        /**
         * Re-emit an RTCMonitor warning as a {@link Connection}.warning or .warning-cleared event.
         * @param warningData
         * @param wasCleared - Whether this is a -cleared or -raised event.
         */
        _this._reemitWarning = function (warningData, wasCleared) {
            var groupPrefix = /^audio/.test(warningData.name) ?
                'audio-level-' : 'network-quality-';
            var warningPrefix = WARNING_PREFIXES[warningData.threshold.name];
            var warningName = warningPrefix + WARNING_NAMES[warningData.name];
            _this._emitWarning(groupPrefix, warningName, warningData.threshold.value, warningData.values || warningData.value, wasCleared);
        };
        /**
         * Re-emit an RTCMonitor warning-cleared as a .warning-cleared event.
         * @param warningData
         */
        _this._reemitWarningCleared = function (warningData) {
            _this._reemitWarning(warningData, true);
        };
        _this._isUnifiedPlanDefault = config.isUnifiedPlanDefault;
        _this._soundcache = config.soundcache;
        _this.message = options && options.twimlParams || {};
        _this.customParameters = new Map(Object.entries(_this.message).map(function (_a) {
            var key = _a[0], val = _a[1];
            return [key, String(val)];
        }));
        Object.assign(_this.options, options);
        if (_this.options.callParameters) {
            _this.parameters = _this.options.callParameters;
        }
        _this._direction = _this.parameters.CallSid ? Connection.CallDirection.Incoming : Connection.CallDirection.Outgoing;
        _this._log.setLogLevel(_this.options.debug ? tslog_1.LogLevel.Debug
            : _this.options.warnings ? tslog_1.LogLevel.Warn
                : tslog_1.LogLevel.Off);
        var publisher = _this._publisher = config.publisher;
        if (_this._direction === Connection.CallDirection.Incoming) {
            publisher.info('connection', 'incoming', null, _this);
        }
        var monitor = _this._monitor = new (_this.options.RTCMonitor || monitor_1.default)();
        monitor.on('sample', _this._onRTCSample);
        // First 20 seconds or so are choppy, so let's not bother with these warnings.
        monitor.disableWarnings();
        setTimeout(function () { return monitor.enableWarnings(); }, METRICS_DELAY);
        monitor.on('warning', function (data, wasCleared) {
            if (data.name === 'bytesSent' || data.name === 'bytesReceived') {
                _this._log.warn('ICE Connection disconnected.');
                clearInterval(_this._iceRestartIntervalId);
                _this._iceRestartIntervalId = setInterval(_this.mediaStream.iceRestart.bind(_this.mediaStream), ICE_RESTART_INTERVAL);
            }
            _this._reemitWarning(data, wasCleared);
        });
        monitor.on('warning-cleared', function (data) {
            if (data.name === 'bytesSent' || data.name === 'bytesReceived') {
                _this._log.info('ICE Connection reestablished.');
                clearInterval(_this._iceRestartIntervalId);
            }
            _this._reemitWarningCleared(data);
        });
        _this.mediaStream = new (_this.options.MediaStream || _this.options.mediaStreamFactory)(config.audioHelper, config.pstream, config.getUserMedia, {
            codecPreferences: _this.options.codecPreferences,
            debug: _this.options.debug,
            dscp: _this.options.dscp,
            isUnifiedPlan: _this._isUnifiedPlanDefault,
            warnings: _this.options.warnings,
        });
        _this.on('volume', function (inputVolume, outputVolume) {
            _this._inputVolumeStreak = _this._checkVolume(inputVolume, _this._inputVolumeStreak, _this._latestInputVolume, 'input');
            _this._outputVolumeStreak = _this._checkVolume(outputVolume, _this._outputVolumeStreak, _this._latestOutputVolume, 'output');
            _this._latestInputVolume = inputVolume;
            _this._latestOutputVolume = outputVolume;
        });
        _this.mediaStream.onvolume = function (inputVolume, outputVolume, internalInputVolume, internalOutputVolume) {
            // (rrowland) These values mock the 0 -> 32767 format used by legacy getStats. We should look into
            // migrating to a newer standard, either 0.0 -> linear or -127 to 0 in dB, matching the range
            // chosen below.
            _this._internalInputVolumes.push((internalInputVolume / 255) * 32767);
            _this._internalOutputVolumes.push((internalOutputVolume / 255) * 32767);
            // (rrowland) 0.0 -> 1.0 linear
            _this.emit('volume', inputVolume, outputVolume);
        };
        _this.mediaStream.oniceconnectionstatechange = function (state) {
            var level = state === 'failed' ? 'error' : 'debug';
            _this._publisher.post(level, 'ice-connection-state', state, null, _this);
        };
        _this.mediaStream.onicegatheringstatechange = function (state) {
            _this._publisher.debug('ice-gathering-state', state, null, _this);
        };
        _this.mediaStream.onsignalingstatechange = function (state) {
            _this._publisher.debug('signaling-state', state, null, _this);
        };
        _this.mediaStream.ondisconnect = function (msg) {
            _this._log.info(msg);
            _this._publisher.warn('network-quality-warning-raised', 'ice-connectivity-lost', {
                message: msg,
            }, _this);
            _this.emit('warning', 'ice-connectivity-lost');
        };
        _this.mediaStream.onreconnect = function (msg) {
            _this._log.info(msg);
            _this._publisher.info('network-quality-warning-cleared', 'ice-connectivity-lost', {
                message: msg,
            }, _this);
            _this.emit('warning-cleared', 'ice-connectivity-lost');
        };
        _this.mediaStream.onerror = function (e) {
            if (e.disconnect === true) {
                _this._disconnect(e.info && e.info.message);
            }
            var error = {
                code: e.info.code,
                connection: _this,
                info: e.info,
                message: e.info.message || 'Error with mediastream',
            };
            _this._log.error('Received an error from MediaStream:', e);
            _this.emit('error', error);
        };
        _this.mediaStream.onopen = function () {
            // NOTE(mroberts): While this may have been happening in previous
            // versions of Chrome, since Chrome 45 we have seen the
            // PeerConnection's onsignalingstatechange handler invoked multiple
            // times in the same signalingState 'stable'. When this happens, we
            // invoke this onopen function. If we invoke it twice without checking
            // for _status 'open', we'd accidentally close the PeerConnection.
            //
            // See <https://code.google.com/p/webrtc/issues/detail?id=4996>.
            if (_this._status === Connection.State.Open) {
                return;
            }
            else if (_this._status === Connection.State.Ringing || _this._status === Connection.State.Connecting) {
                _this.mute(false);
                _this._maybeTransitionToOpen();
            }
            else {
                // call was probably canceled sometime before this
                _this.mediaStream.close();
            }
        };
        _this.mediaStream.onclose = function () {
            _this._status = Connection.State.Closed;
            if (_this.options.shouldPlayDisconnect && _this.options.shouldPlayDisconnect()) {
                _this._soundcache.get(device_1.default.SoundName.Disconnect).play();
            }
            monitor.disable();
            _this._publishMetrics();
            _this.emit('disconnect', _this);
        };
        // temporary call sid to be used for outgoing calls
        _this.outboundConnectionId = generateTempCallSid();
        _this.pstream = config.pstream;
        _this.pstream.on('cancel', _this._onCancel);
        _this.pstream.on('ringing', _this._onRinging);
        _this.on('error', function (error) {
            _this._publisher.error('connection', 'error', {
                code: error.code, message: error.message,
            }, _this);
            if (_this.pstream && _this.pstream.status === 'disconnected') {
                _this._cleanupEventListeners();
            }
        });
        _this.on('disconnect', function () {
            _this._cleanupEventListeners();
        });
        return _this;
    }
    Object.defineProperty(Connection.prototype, "direction", {
        /**
         * Whether this {@link Connection} is incoming or outgoing.
         */
        get: function () {
            return this._direction;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Connection.prototype, "codec", {
        /**
         * Audio codec used for this {@link Connection}. Expecting {@link Connection.Codec} but
         * will copy whatever we get from RTC stats.
         */
        get: function () {
            return this._codec;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Get the real CallSid. Returns null if not present or is a temporary call sid.
     * @deprecated
     * @private
     */
    Connection.prototype._getRealCallSid = function () {
        this._log.warn('_getRealCallSid is deprecated and will be removed in 2.0.');
        return /^TJ/.test(this.parameters.CallSid) ? null : this.parameters.CallSid;
    };
    /**
     * Get the temporary CallSid.
     * @deprecated
     * @private
     */
    Connection.prototype._getTempCallSid = function () {
        this._log.warn('_getTempCallSid is deprecated and will be removed in 2.0. \
                    Please use outboundConnectionId instead.');
        return this.outboundConnectionId;
    };
    /**
     * Set the audio input tracks from a given stream.
     * @param stream
     * @private
     */
    Connection.prototype._setInputTracksFromStream = function (stream) {
        return this.mediaStream.setInputTracksFromStream(stream);
    };
    /**
     * Set the audio output sink IDs.
     * @param sinkIds
     * @private
     */
    Connection.prototype._setSinkIds = function (sinkIds) {
        return this.mediaStream._setSinkIds(sinkIds);
    };
    Connection.prototype.accept = function (handlerOrConstraints) {
        var _this = this;
        if (typeof handlerOrConstraints === 'function') {
            this._addHandler('accept', handlerOrConstraints);
            return;
        }
        if (this._status !== Connection.State.Pending) {
            return;
        }
        var audioConstraints = handlerOrConstraints || this.options.audioConstraints;
        this._status = Connection.State.Connecting;
        var connect = function () {
            if (_this._status !== Connection.State.Connecting) {
                // call must have been canceled
                _this._cleanupEventListeners();
                _this.mediaStream.close();
                return;
            }
            var onLocalAnswer = function (pc) {
                _this._publisher.info('connection', 'accepted-by-local', null, _this);
                _this._monitor.enable(pc);
            };
            var onRemoteAnswer = function (pc) {
                _this._publisher.info('connection', 'accepted-by-remote', null, _this);
                _this._monitor.enable(pc);
            };
            var sinkIds = typeof _this.options.getSinkIds === 'function' && _this.options.getSinkIds();
            if (Array.isArray(sinkIds)) {
                _this.mediaStream._setSinkIds(sinkIds).catch(function () {
                    // (rrowland) We don't want this to throw to console since the customer
                    // can't control this. This will most commonly be rejected on browsers
                    // that don't support setting sink IDs.
                });
            }
            _this.pstream.addListener('hangup', _this._onHangup);
            if (_this._direction === Connection.CallDirection.Incoming) {
                _this._isAnswered = true;
                _this.mediaStream.answerIncomingCall(_this.parameters.CallSid, _this.options.offerSdp, _this.options.rtcConstraints, _this.options.rtcConfiguration, onLocalAnswer);
            }
            else {
                var params = Array.from(_this.customParameters.entries()).map(function (pair) {
                    return encodeURIComponent(pair[0]) + "=" + encodeURIComponent(pair[1]);
                }).join('&');
                _this.pstream.once('answer', _this._onAnswer.bind(_this));
                _this.mediaStream.makeOutgoingCall(_this.pstream.token, params, _this.outboundConnectionId, _this.options.rtcConstraints, _this.options.rtcConfiguration, onRemoteAnswer);
            }
        };
        if (this.options.beforeAccept) {
            this.options.beforeAccept(this);
        }
        var inputStream = typeof this.options.getInputStream === 'function' && this.options.getInputStream();
        var promise = inputStream
            ? this.mediaStream.setInputTracksFromStream(inputStream)
            : this.mediaStream.openWithConstraints(audioConstraints);
        promise.then(function () {
            _this._publisher.info('get-user-media', 'succeeded', {
                data: { audioConstraints: audioConstraints },
            }, _this);
            connect();
        }, function (error) {
            var message;
            var code;
            if (error.code && error.code === 31208
                || error.name && error.name === 'PermissionDeniedError') {
                code = 31208;
                message = 'User denied access to microphone, or the web browser did not allow microphone '
                    + 'access at this address.';
                _this._publisher.error('get-user-media', 'denied', {
                    data: {
                        audioConstraints: audioConstraints,
                        error: error,
                    },
                }, _this);
            }
            else {
                code = 31201;
                message = "Error occurred while accessing microphone: " + error.name + (error.message
                    ? " (" + error.message + ")"
                    : '');
                _this._publisher.error('get-user-media', 'failed', {
                    data: {
                        audioConstraints: audioConstraints,
                        error: error,
                    },
                }, _this);
            }
            _this._disconnect();
            _this.emit('error', { message: message, code: code });
        });
    };
    Connection.prototype.cancel = function (handler) {
        this._log.warn('.cancel() is deprecated. Please use .ignore() instead.');
        if (handler) {
            this.ignore(handler);
        }
        else {
            this.ignore();
        }
    };
    Connection.prototype.disconnect = function (handler) {
        if (typeof handler === 'function') {
            this._addHandler('disconnect', handler);
            return;
        }
        this._disconnect();
    };
    /**
     * @deprecated - Set a handler for the {@link errorEvent}
     */
    Connection.prototype.error = function (handler) {
        if (typeof handler === 'function') {
            this._addHandler('error', handler);
        }
    };
    /**
     * Get the local MediaStream, if set.
     */
    Connection.prototype.getLocalStream = function () {
        return this.mediaStream && this.mediaStream.stream;
    };
    /**
     * Get the remote MediaStream, if set.
     */
    Connection.prototype.getRemoteStream = function () {
        return this.mediaStream && this.mediaStream._remoteStream;
    };
    Connection.prototype.ignore = function (handler) {
        if (typeof handler === 'function') {
            this._addHandler('cancel', handler);
            return;
        }
        if (this._status !== Connection.State.Pending) {
            return;
        }
        this._status = Connection.State.Closed;
        this.emit('cancel');
        this.mediaStream.ignore(this.parameters.CallSid);
        this._publisher.info('connection', 'ignored-by-local', null, this);
    };
    /**
     * Check if connection is muted
     */
    Connection.prototype.isMuted = function () {
        return this.mediaStream.isMuted;
    };
    Connection.prototype.mute = function (shouldMute) {
        if (shouldMute === void 0) { shouldMute = true; }
        if (typeof shouldMute === 'function') {
            this._addHandler('mute', shouldMute);
            return;
        }
        var wasMuted = this.mediaStream.isMuted;
        this.mediaStream.mute(shouldMute);
        var isMuted = this.mediaStream.isMuted;
        if (wasMuted !== isMuted) {
            this._publisher.info('connection', isMuted ? 'muted' : 'unmuted', null, this);
            this.emit('mute', isMuted, this);
        }
    };
    /**
     * Post an event to Endpoint Analytics indicating that the end user
     *   has given call quality feedback. Called without a score, this
     *   will report that the customer declined to give feedback.
     * @param score - The end-user's rating of the call; an
     *   integer 1 through 5. Or undefined if the user declined to give
     *   feedback.
     * @param issue - The primary issue the end user
     *   experienced on the call. Can be: ['one-way-audio', 'choppy-audio',
     *   'dropped-call', 'audio-latency', 'noisy-call', 'echo']
     */
    Connection.prototype.postFeedback = function (score, issue) {
        if (typeof score === 'undefined' || score === null) {
            return this._postFeedbackDeclined();
        }
        if (!Object.values(Connection.FeedbackScore).includes(score)) {
            throw new Error("Feedback score must be one of: " + Object.values(Connection.FeedbackScore));
        }
        if (typeof issue !== 'undefined' && issue !== null && !Object.values(Connection.FeedbackIssue).includes(issue)) {
            throw new Error("Feedback issue must be one of: " + Object.values(Connection.FeedbackIssue));
        }
        return this._publisher.info('feedback', 'received', {
            issue_name: issue,
            quality_score: score,
        }, this, true);
    };
    Connection.prototype.reject = function (handler) {
        if (typeof handler === 'function') {
            this._addHandler('reject', handler);
            return;
        }
        if (this._status !== Connection.State.Pending) {
            return;
        }
        var payload = { callsid: this.parameters.CallSid };
        this.pstream.publish('reject', payload);
        this.emit('reject');
        this.mediaStream.reject(this.parameters.CallSid);
        this._publisher.info('connection', 'rejected-by-local', null, this);
    };
    /**
     * Send a string of digits.
     * @param digits
     */
    Connection.prototype.sendDigits = function (digits) {
        if (digits.match(/[^0-9*#w]/)) {
            throw new util_1.Exception('Illegal character passed into sendDigits');
        }
        var sequence = [];
        digits.split('').forEach(function (digit) {
            var dtmf = (digit !== 'w') ? "dtmf" + digit : '';
            if (dtmf === 'dtmf*') {
                dtmf = 'dtmfs';
            }
            if (dtmf === 'dtmf#') {
                dtmf = 'dtmfh';
            }
            sequence.push(dtmf);
        });
        // Binds soundCache to be used in recursion until all digits have been played.
        (function playNextDigit(soundCache, dialtonePlayer) {
            var digit = sequence.shift();
            if (digit) {
                if (dialtonePlayer) {
                    dialtonePlayer.play(digit);
                }
                else {
                    soundCache.get(digit).play();
                }
            }
            if (sequence.length) {
                setTimeout(playNextDigit.bind(null, soundCache), 200);
            }
        })(this._soundcache, this.options.dialtonePlayer);
        var dtmfSender = this.mediaStream.getOrCreateDTMFSender();
        function insertDTMF(dtmfs) {
            if (!dtmfs.length) {
                return;
            }
            var dtmf = dtmfs.shift();
            if (dtmf && dtmf.length) {
                dtmfSender.insertDTMF(dtmf, DTMF_TONE_DURATION, DTMF_INTER_TONE_GAP);
            }
            setTimeout(insertDTMF.bind(null, dtmfs), DTMF_PAUSE_DURATION);
        }
        if (dtmfSender) {
            if (!('canInsertDTMF' in dtmfSender) || dtmfSender.canInsertDTMF) {
                this._log.info('Sending digits using RTCDTMFSender');
                // NOTE(mroberts): We can't just map 'w' to ',' since
                // RTCDTMFSender's pause duration is 2 s and Twilio's is more
                // like 500 ms. Instead, we will fudge it with setTimeout.
                insertDTMF(digits.split('w'));
                return;
            }
            this._log.info('RTCDTMFSender cannot insert DTMF');
        }
        // send pstream message to send DTMF
        this._log.info('Sending digits over PStream');
        if (this.pstream !== null && this.pstream.status !== 'disconnected') {
            this.pstream.publish('dtmf', {
                callsid: this.parameters.CallSid,
                dtmf: digits,
            });
        }
        else {
            var error = {
                code: 31000,
                connection: this,
                message: 'Could not send DTMF: Signaling channel is disconnected',
            };
            this.emit('error', error);
        }
    };
    /**
     * Get the current {@link Connection} status.
     */
    Connection.prototype.status = function () {
        return this._status;
    };
    /**
     * @deprecated - Unmute the {@link Connection}.
     */
    Connection.prototype.unmute = function () {
        this._log.warn('.unmute() is deprecated. Please use .mute(false) to unmute a call instead.');
        this.mute(false);
    };
    /**
     * @deprecated - Set a handler for the {@link volumeEvent}
     * @param handler
     */
    Connection.prototype.volume = function (handler) {
        if (!window || (!window.AudioContext && !window.webkitAudioContext)) {
            this._log.warn('This browser does not support Connection.volume');
        }
        this._addHandler('volume', handler);
    };
    /**
     * Add a handler for an EventEmitter and emit a deprecation warning on first call.
     * @param eventName - Name of the event
     * @param handler - A handler to call when the event is emitted
     */
    Connection.prototype._addHandler = function (eventName, handler) {
        if (!hasBeenWarnedHandlers) {
            this._log.warn("Connection callback handlers (accept, cancel, disconnect, error, ignore, mute, reject,\n        volume) have been deprecated and will be removed in the next breaking release. Instead, the EventEmitter         interface can be used to set event listeners. Example: connection.on('" + eventName + "', handler)");
            hasBeenWarnedHandlers = true;
        }
        this.addListener(eventName, handler);
        return this;
    };
    /**
     * Check the volume passed, emitting a warning if one way audio is detected or cleared.
     * @param currentVolume - The current volume for this direction
     * @param streakFieldName - The name of the field on the {@link Connection} object that tracks how many times the
     *   current value has been repeated consecutively.
     * @param lastValueFieldName - The name of the field on the {@link Connection} object that tracks the most recent
     *   volume for this direction
     * @param direction - The directionality of this audio track, either 'input' or 'output'
     * @returns The current streak; how many times in a row the same value has been polled.
     */
    Connection.prototype._checkVolume = function (currentVolume, currentStreak, lastValue, direction) {
        var wasWarningRaised = currentStreak >= 10;
        var newStreak = 0;
        if (lastValue === currentVolume) {
            newStreak = currentStreak;
        }
        if (newStreak >= 10) {
            this._emitWarning('audio-level-', "constant-audio-" + direction + "-level", 10, newStreak, false);
        }
        else if (wasWarningRaised) {
            this._emitWarning('audio-level-', "constant-audio-" + direction + "-level", 10, newStreak, true);
        }
        return newStreak;
    };
    /**
     * Clean up event listeners.
     */
    Connection.prototype._cleanupEventListeners = function () {
        var _this = this;
        var cleanup = function () {
            if (!_this.pstream) {
                return;
            }
            _this.pstream.removeListener('answer', _this._onAnswer);
            _this.pstream.removeListener('cancel', _this._onCancel);
            _this.pstream.removeListener('hangup', _this._onHangup);
            _this.pstream.removeListener('ringing', _this._onRinging);
        };
        // This is kind of a hack, but it lets us avoid rewriting more code.
        // Basically, there's a sequencing problem with the way PeerConnection raises
        // the
        //
        //   Cannot establish connection. Client is disconnected
        //
        // error in Connection#accept. It calls PeerConnection#onerror, which emits
        // the error event on Connection. An error handler on Connection then calls
        // cleanupEventListeners, but then control returns to Connection#accept. It's
        // at this point that we add a listener for the answer event that never gets
        // removed. setTimeout will allow us to rerun cleanup again, _after_
        // Connection#accept returns.
        cleanup();
        setTimeout(cleanup, 0);
    };
    /**
     * Create the payload wrapper for a batch of metrics to be sent to Insights.
     */
    Connection.prototype._createMetricPayload = function () {
        var payload = {
            call_sid: this.parameters.CallSid,
            dscp: !!this.options.dscp,
            sdk_version: C.RELEASE_VERSION,
            selected_region: this.options.selectedRegion,
        };
        if (this.options.gateway) {
            payload.gateway = this.options.gateway;
        }
        if (this.options.region) {
            payload.region = this.options.region;
        }
        payload.direction = this._direction;
        return payload;
    };
    /**
     * Disconnect the {@link Connection}.
     * @param message - A message explaining why the {@link Connection} is being disconnected.
     * @param wasRemote - Whether the disconnect was triggered locally or remotely.
     */
    Connection.prototype._disconnect = function (message, wasRemote) {
        message = typeof message === 'string' ? message : null;
        if (this._status !== Connection.State.Open
            && this._status !== Connection.State.Connecting
            && this._status !== Connection.State.Ringing) {
            return;
        }
        this._log.info('Disconnecting...');
        clearInterval(this._iceRestartIntervalId);
        // send pstream hangup message
        if (this.pstream !== null && this.pstream.status !== 'disconnected' && this.sendHangup) {
            var callsid = this.parameters.CallSid || this.outboundConnectionId;
            if (callsid) {
                var payload = { callsid: callsid };
                if (message) {
                    payload.message = message;
                }
                this.pstream.publish('hangup', payload);
            }
        }
        this._cleanupEventListeners();
        this.mediaStream.close();
        if (!wasRemote) {
            this._publisher.info('connection', 'disconnected-by-local', null, this);
        }
    };
    /**
     * Transition to {@link ConnectionStatus.Open} if criteria is met.
     */
    Connection.prototype._maybeTransitionToOpen = function () {
        if (this.mediaStream && this.mediaStream.status === 'open' && this._isAnswered) {
            this._status = Connection.State.Open;
            this.emit('accept', this);
        }
    };
    /**
     * Post an event to Endpoint Analytics indicating that the end user
     *   has ignored a request for feedback.
     */
    Connection.prototype._postFeedbackDeclined = function () {
        return this._publisher.info('feedback', 'received-none', null, this, true);
    };
    /**
     * Publish the current set of queued metrics samples to Insights.
     */
    Connection.prototype._publishMetrics = function () {
        var _this = this;
        if (this._metricsSamples.length === 0) {
            return;
        }
        this._publisher.postMetrics('quality-metrics-samples', 'metrics-sample', this._metricsSamples.splice(0), this._createMetricPayload(), this).catch(function (e) {
            _this._log.warn('Unable to post metrics to Insights. Received error:', e);
        });
    };
    /**
     * Set the CallSid
     * @param payload
     */
    Connection.prototype._setCallSid = function (payload) {
        var callSid = payload.callsid;
        if (!callSid) {
            return;
        }
        this.parameters.CallSid = callSid;
        this.mediaStream.callSid = callSid;
    };
    /**
     * String representation of the {@link Connection} class.
     * @private
     */
    Connection.toString = function () { return '[Twilio.Connection class]'; };
    return Connection;
}(events_1.EventEmitter));
(function (Connection) {
    /**
     * Possible states of the {@link Connection}.
     */
    var State;
    (function (State) {
        State["Closed"] = "closed";
        State["Connecting"] = "connecting";
        State["Open"] = "open";
        State["Pending"] = "pending";
        State["Ringing"] = "ringing";
    })(State = Connection.State || (Connection.State = {}));
    /**
     * Different issues that may have been experienced during a call, that can be
     * reported to Twilio Insights via {@link Connection}.postFeedback().
     */
    var FeedbackIssue;
    (function (FeedbackIssue) {
        FeedbackIssue["AudioLatency"] = "audio-latency";
        FeedbackIssue["ChoppyAudio"] = "choppy-audio";
        FeedbackIssue["DroppedCall"] = "dropped-call";
        FeedbackIssue["Echo"] = "echo";
        FeedbackIssue["NoisyCall"] = "noisy-call";
        FeedbackIssue["OneWayAudio"] = "one-way-audio";
    })(FeedbackIssue = Connection.FeedbackIssue || (Connection.FeedbackIssue = {}));
    /**
     * A rating of call quality experienced during a call, to be reported to Twilio Insights
     * via {@link Connection}.postFeedback().
     */
    var FeedbackScore;
    (function (FeedbackScore) {
        FeedbackScore[FeedbackScore["One"] = 1] = "One";
        FeedbackScore[FeedbackScore["Two"] = 2] = "Two";
        FeedbackScore[FeedbackScore["Three"] = 3] = "Three";
        FeedbackScore[FeedbackScore["Four"] = 4] = "Four";
        FeedbackScore[FeedbackScore["Five"] = 5] = "Five";
    })(FeedbackScore = Connection.FeedbackScore || (Connection.FeedbackScore = {}));
    /**
     * The directionality of the {@link Connection}, whether incoming or outgoing.
     */
    var CallDirection;
    (function (CallDirection) {
        CallDirection["Incoming"] = "INCOMING";
        CallDirection["Outgoing"] = "OUTGOING";
    })(CallDirection = Connection.CallDirection || (Connection.CallDirection = {}));
    /**
     * Valid audio codecs to use for the media connection.
     */
    var Codec;
    (function (Codec) {
        Codec["Opus"] = "opus";
        Codec["PCMU"] = "pcmu";
    })(Codec = Connection.Codec || (Connection.Codec = {}));
})(Connection || (Connection = {}));
function generateTempCallSid() {
    return 'TJSxxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        /* tslint:disable:no-bitwise */
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        /* tslint:enable:no-bitwise */
        return v.toString(16);
    });
}
exports.default = Connection;
//# sourceMappingURL=connection.js.map