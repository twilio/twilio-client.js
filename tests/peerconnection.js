const sinon = require('sinon');
const assert = require('assert');
const PeerConnection = require('./../lib/twilio/rtc/peerconnection');

describe('PeerConnection', () => {
  context('PeerConnection.prototype._setInputTracksFromStream', () => {
    const METHOD = PeerConnection.prototype._setInputTracksFromStream;
    const ERROR_STREAM_NOT_NULL = 'Can not set input stream to null while in a call';
    const MESSAGE = 'This is a message';

    let toTest = null;
    let eStream = null;
    let cStream = null;
    let context = null;
    let version = null;

    function createStream() {
      return {
        getAudioTracks: sinon.stub().returns([]),
        removeTrack: sinon.spy(),
        addTrack: sinon.stub(),
        clone: sinon.stub().returns('cloned stream')
      };
    }

    beforeEach(() => {
      cStream = createStream();
      eStream = createStream();
      version = {
        createOffer: sinon.stub().callsArgWith(2),
        processAnswer: sinon.stub().callsArgWith(2),
        pc: {
          addTrack: sinon.stub(),
          removeTrack: sinon.stub(),
          getSenders: sinon.stub().returns([])
        }
      };
      context = {
        isMuted: 'isMuted',
        mute: sinon.stub(),
        stream: cStream,
        version,
        _answerSdp: '_answerSdp',
        _audioContext: {
          createMediaStreamSource: () => { return { connect: sinon.stub() }; },
        },
        _createAnalyser: sinon.stub().returns('_createAnalyser'),
        _updateInputStreamSource: PeerConnection.prototype._updateInputStreamSource,
        _updateOutnputStreamSource: PeerConnection.prototype._updateOutputStreamSource,
        _setInputTracksForPlanB: PeerConnection.prototype._setInputTracksForPlanB,
        _setInputTracksForUnifiedPlan: PeerConnection.prototype._setInputTracksForUnifiedPlan,
        _stopStream: sinon.stub(),
      };
      toTest = METHOD.bind(context);
    });

    it('Should reject when stream is null', done => {
      toTest(false, null).catch(aError => {
        assert.equal(aError.message, ERROR_STREAM_NOT_NULL);
      }).then(done).catch(done);
    });

    it('Should reject when stream has no audio tracks', done => {
      toTest(false, eStream).catch(aError => {
        assert(eStream.getAudioTracks.calledOnce);
        assert(eStream.getAudioTracks.calledWithExactly());
        assert.equal(aError.message, 'Supplied input stream has no audio tracks');
      }).then(done).catch(done);
    });

    it('Should resolve when getAudioTracks returns array with one track', done => {
      eStream.getAudioTracks.returns([{track: 'track'}]);
      cStream.getAudioTracks.returns([{}]);
      toTest(false, eStream).then(aStream => {
        assert.equal(aStream, cStream);
        assert(cStream.addTrack.calledOnce);
        assert(context.mute.calledWithExactly(context.isMuted));
      }).then(done).catch(done);
    });

    it('Should resolve with cloned stream when there is no local stream', done => {
      context.stream = null;
      eStream.getAudioTracks.returns([{track: 'track'}]);
      cStream.getAudioTracks.returns([{}]);
      toTest(false, eStream).then(aStream => {
        assert.equal(aStream, eStream);
        assert(context.mute.calledWithExactly(context.isMuted));
      }).then(done).catch(done);
    });

    it('Should reject when createOffer calls error callback', done => {
      eStream.getAudioTracks.returns([{track: 'track'}]);
      version.createOffer.callsArgWith(3, MESSAGE);
      toTest(false, eStream).then(() => done(new Error('Should not resolve'))).catch(aMessage => {
        assert.equal(aMessage, MESSAGE);
        assert(context.mute.calledWithExactly(context.isMuted));
        version.createOffer.calledWithExactly(undefined, {audio: true}, sinon.match.func, sinon.match.func);
      }).then(done).catch(done);
    });

    it('Should reject when processAnswer calls error callback', done => {
      eStream.getAudioTracks.returns([{track: 'track'}]);
      version.processAnswer.callsArgWith(3, MESSAGE);
      toTest(false, eStream).then(() => done(new Error('Should not resolve'))).catch(aMessage => {
        assert.equal(aMessage, MESSAGE);
        version.createOffer.calledWithExactly({audio: true}, sinon.match.func, sinon.match.func);
        version.processAnswer.calledWithExactly(undefined, context._answerSdp, sinon.match.func, sinon.match.func);
        assert(version.createOffer.calledBefore(version.processAnswer));
      }).then(done).catch(done);
    });

    it('Should resolve when createOffer and processAnswer calls success callbacks', done => {
      eStream.getAudioTracks.returns([{track: 'track'}]);
      toTest(false, eStream).then(aStream => {
        assert.equal(cStream, aStream);
        assert(version.createOffer.calledWithExactly(undefined, {audio: true}, sinon.match.func, sinon.match.func));
        assert(version.processAnswer.calledWithExactly(undefined, context._answerSdp, sinon.match.func, sinon.match.func));
        assert(version.createOffer.calledBefore(version.processAnswer));
        assert(version.processAnswer.calledBefore(context._createAnalyser));
      }).then(done).catch(done);
    });

    it('should remove any existing tracks from the stream', () => {
      context.stream.getAudioTracks = sinon.stub().returns([{ track: 'foo' }, { track: 'bar' }]);
      eStream.getAudioTracks.returns([{track: 'track'}]);
      return toTest(false, eStream).then(aStream => {
        assert.equal(cStream.removeTrack.callCount, 2);
      });
    });
  });

  context('PeerConnection.prototype.openWithConstraints', () => {
    const METHOD = PeerConnection.prototype.openWithConstraints;
    const USER_MEDIA_RESULT = 'getUserMedia';
    const INPUT_TRACKS_FROM_STREAM = '_setInputTracksFromStream';
    const EXPECTED_ERROR = new Error(USER_MEDIA_RESULT);

    let context = null;
    let toTest = null;

    beforeEach(() => {
      context = {
        _setInputTracksFromStream: sinon.stub().returns(Promise.resolve(INPUT_TRACKS_FROM_STREAM)),
        getUserMedia: sinon.stub().returns(Promise.resolve(USER_MEDIA_RESULT))
      };
      toTest = METHOD.bind(context);
    });

    it('Should resolve when getUserMedia, _setInputTracksFromStream resolves', done => {
      toTest({not: 'is random'}).then(stream => {
        assert(context._setInputTracksFromStream.calledOn(context));
        assert(context._setInputTracksFromStream.calledWithExactly(false, USER_MEDIA_RESULT));
        assert(context.getUserMedia.calledOn(context));
        assert(context.getUserMedia.calledWithExactly({audio: {not: 'is random'}}));
        assert(context.getUserMedia.calledBefore(context._setInputTracksFromStream));
        assert.deepStrictEqual(INPUT_TRACKS_FROM_STREAM, stream);
      }).then(done).catch(done);
    });

    it('Should reject when getUserMedia rejects', done => {
      context.getUserMedia.returns(Promise.reject(EXPECTED_ERROR));
      toTest('constraints').catch(aError => {
        assert.equal(aError.message, EXPECTED_ERROR.message);
        assert.equal(context._setInputTracksFromStream.called, false);
        assert(context.getUserMedia.calledOn(context));
        assert(context.getUserMedia.calledWithExactly({audio: 'constraints'}));
      }).then(done).catch(done);
    });

    it('Should reject when setInputTracksFromStream rejects', done => {
      context._setInputTracksFromStream.returns(Promise.reject(EXPECTED_ERROR));
      toTest(undefined).catch(aError => {
        assert.equal(aError.message, EXPECTED_ERROR.message);
        assert(context._setInputTracksFromStream.calledOn(context));
        assert(context._setInputTracksFromStream.calledWithExactly(false, USER_MEDIA_RESULT));
        assert(context.getUserMedia.calledOn(context));
        assert(context.getUserMedia.calledWithExactly({audio: undefined}));
      }).then(done).catch(done);
    });

  });

  context('PeerConnection.prototype.setInputTracksFromStream', () => {
    const METHOD = PeerConnection.prototype.setInputTracksFromStream;
    const INPUT_TRACK_FROM_STATE = 'setInputTracksFromStream';

    let context = null;
    let toTest = null;

    beforeEach(() => {
      context = {
        _setInputTracksFromStream: sinon.stub().returns(Promise.resolve(INPUT_TRACK_FROM_STATE)),
        _shouldManageStream: 'before'
      };
      toTest = METHOD.bind(context);
    });

    it('Should resolve and set _shouldManageStream to false when _setInputTracksFromStream resolves', done => {
      toTest({arg: 'val'}).then(() => {
        assert(context._setInputTracksFromStream.calledOn(context));
        assert(context._setInputTracksFromStream.calledWithExactly(true, {arg: 'val'}));
        assert.strictEqual(context._shouldManageStream, false);
      }).then(done).catch(done);
    });

    it('setInputTracksFromStream rejects', done => {
      context._setInputTracksFromStream.returns(Promise.reject(INPUT_TRACK_FROM_STATE));
      toTest({arg: 'val'}).catch(() => {
        assert(context._setInputTracksFromStream.calledOn(context));
        assert(context._setInputTracksFromStream.calledWithExactly(true, {arg: 'val'}));
        assert.equal(context._shouldManageStream, 'before');
      }).then(done).catch(done);
    });
  });

  context('PeerConnection.prototype._setInputTracksForUnifiedPlan', () => {
    const METHOD = PeerConnection.prototype._setInputTracksForUnifiedPlan;
    const STREAM = { id: 1 };

    let context = null;
    let toTest = null;

    beforeEach(() => {
      context = {
        stream: STREAM,
        mute: sinon.stub(),
        _sender: {}
      };
      toTest = METHOD.bind(context);
    });

    it('Should replace tracks before returning the new stream', done => {
      const replaceTrackCb = sinon.stub();
      context._updateInputStreamSource = sinon.stub();
      context._sender.replaceTrack = () => ({ then: (cb) => {
        replaceTrackCb();
        return cb();
      }})

      toTest(false, { getAudioTracks: () => ['foo'] }).then((result) => {
        assert(context._updateInputStreamSource.calledOnce);
        assert(replaceTrackCb.calledOnce);
        assert.strictEqual(result.id, STREAM.id);
      }).then(done).catch(done);
    });
  });

  context('PeerConnection.prototype.close', () => {
    const METHOD = PeerConnection.prototype.close;

    let context = null;
    let toTest = null;
    let stream = null;
    let pc = null;

    beforeEach(() => {
      pc = {
        signalingState: 'open',
        close: sinon.spy(),
      };
      stream = {
        name: 'this is a stream'
      };
      context = {
        _onAnswer: 'this is on answer',
        _removeAudioOutputs: sinon.stub(),
        _shouldManaageStream: true,
        _stopStream: sinon.stub(),
        _mediaStreamSource: {
          disconnect: sinon.stub()
        },
        _inputAnalyser: {
          disconnect: sinon.stub()
        },
        _outputAnalyser: {
          disconnect: sinon.stub()
        },
        onclose: sinon.spy(),
        status: 'open',
        stream,
        pstream: {
          removeListener: sinon.stub()
        },
        mute: sinon.stub(),
        version: {
          pc
        }
      };
      toTest = METHOD.bind(context);
    });

    it('Should stop everyhting, removeListeners, disconnect analysers, close sockets, etc..', () => {
      toTest();
      assert(context._outputAnalyser.disconnect.calledOnce);
      assert(context._outputAnalyser.disconnect.calledWithExactly());
      assert(context._inputAnalyser.disconnect.calledOnce);
      assert(context._inputAnalyser.disconnect.calledWithExactly());
      assert(context._mediaStreamSource.disconnect.calledOnce);
      assert(context._mediaStreamSource.disconnect.calledWithExactly());
      assert(context._stopStream.calledOnce);
      assert(context.mute.calledWithExactly(false));
      assert(context._stopStream.calledWithExactly(stream));
      assert(context.pstream.removeListener.calledOnce);
      assert(context.pstream.removeListener.calledWithExactly('answer', context._onAnswerOrRinging));
      assert(pc.close.calledOnce);
      assert(pc.close.calledWithExactly());
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version.pc, null);
      assert.strictEqual(context.status, 'closed');
    });

    it('Should stop everything what is available with minimum context', () => {
      context.version = false;
      context.stream = false;
      context.pstream = false;
      context._mediaStreamSource = false;
      context._inputAnalyser = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version, false);
      assert.strictEqual(context.status, 'closed');
    });

    it('Should stop everything what is available with _outputAnalyser', () => {
      context.version = false;
      context.stream = false;
      context.pstream = false;
      context._mediaStreamSource = false;
      context._inputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version, false);
      assert.strictEqual(context.status, 'closed');
      assert(context._outputAnalyser.disconnect.calledOnce);
      assert(context._outputAnalyser.disconnect.calledWithExactly());
    });

    it('Should stop everything what is available with _inputAnalyser', () => {
      context.version = false;
      context.stream = false;
      context.pstream = false;
      context._mediaStreamSource = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version, false);
      assert.strictEqual(context.status, 'closed');
      assert(context._inputAnalyser.disconnect.calledOnce);
      assert(context._inputAnalyser.disconnect.calledWithExactly());
    });

    it('Should stop everything what is available with _mediaStreamSource', () => {
      context.version = false;
      context.stream = false;
      context.pstream = false;
      context._inputAnalyser = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version, false);
      assert.strictEqual(context.status, 'closed');
      assert(context._mediaStreamSource.disconnect.calledOnce);
      assert(context._mediaStreamSource.disconnect.calledWithExactly());
    });

    it('Should stop everything what is available with pstream', () => {
      context.version = false;
      context.stream = false;
      context._mediaStreamSource = false;
      context._inputAnalyser = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version, false);
      assert.strictEqual(context.status, 'closed');
      assert(context.pstream.removeListener.calledOnce);
      assert(context.pstream.removeListener.calledWithExactly('answer', context._onAnswerOrRinging));
    });

    it('Should stop everything what is available with stream', () => {
      context.version = false;
      context.pstream = false;
      context._mediaStreamSource = false;
      context._inputAnalyser = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.mute.calledWithExactly(false));
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version, false);
      assert.strictEqual(context.status, 'closed');
      assert(context._stopStream.calledOnce);
      assert(context._stopStream.calledWithExactly(stream));
    });

    it('Should stop everything what is available with stream and _shouldManaageStream as false', () => {
      context._shouldManaageStream = false;
      context.version = false;
      context.pstream = false;
      context._mediaStreamSource = false;
      context._inputAnalyser = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.mute.calledWithExactly(false));
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.version, false);
      assert.strictEqual(context.status, 'closed');
      assert(context._stopStream.calledWithExactly(stream));
    });

    it('Should stop everything what is available with version', () => {
      context.stream = false;
      context.pstream = false;
      context._mediaStreamSource = false;
      context._inputAnalyser = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.status, 'closed');
      assert.strictEqual(context.version.pc, null);
      assert(pc.close.calledOnce);
      assert(pc.close.calledWithExactly());
    });

    it('Should stop everything what is available with version and signaling state is closed', () => {
      pc.signalingState = 'closed';
      context.stream = false;
      context.pstream = false;
      context._mediaStreamSource = false;
      context._inputAnalyser = false;
      context._outputAnalyser = false;
      toTest();
      assert(context.onclose.calledOnce);
      assert(context.onclose.calledWithExactly());
      assert.strictEqual(context.stream, null);
      assert.strictEqual(context.status, 'closed');
      assert.strictEqual(context.version.pc, null);
      assert.equal(pc.close.called, false);
    });
  });

  context('PeerConnection.prototype.answerIncomingCall', () => {
    const METHOD = PeerConnection.prototype.answerIncomingCall;
    const EXPECTED_ERROR = {info: {code: 31000, message: 'Error creating the answer: error message'}};
    const eCallSid = 'callSid';
    const eSDP = 'sdp';
    const eConstraints = 'rtcConstraints';
    const eIceServers = 'iceServers';

    let context = null;
    let version = null;
    let callback = null;
    let toTest = null;

    beforeEach(() => {
      callback = sinon.stub();
      version = {
        processSDP: sinon.stub(),
        pc: 'peer connection',
        getSDP: sinon.stub()
      };
      context = {
        _initializeMediaStream: sinon.stub(),
        _setNetworkPriority: sinon.stub(),
        callSid: null,
        version,
        status: 'closed',
        onerror: sinon.stub(),
        pstream: {
          publish: sinon.stub()
        }
      };
      toTest = METHOD.bind(
        context,
        eCallSid,
        eSDP,
        eConstraints,
        eIceServers,
        callback
      );
    });

    it('Should not call processSDP when failed to initialize streams', () => {
      context._initializeMediaStream.returns(false);
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert.equal(version.processSDP.called, false);
    });

    it('Should call processSDP when succeeded to initialize streams', () => {
      context._initializeMediaStream.returns(true);
      version.processSDP.callsArgWith(3);
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(version.processSDP.calledOnce);
      assert(version.processSDP.calledWithExactly(undefined, eSDP, {audio: true}, sinon.match.func, sinon.match.func));
      assert.equal(callback.called, false);
    });

    it('Should call onMediaStarted callback when processSDP success callback called and status is not closed', () => {
      const sdp1 = 'sdp1';
      context._initializeMediaStream.returns(true);
      version.getSDP.returns(sdp1);
      version.processSDP.callsArgWith(3);
      context.status = false;
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(context.pstream.publish.calledWithExactly('answer', {callsid: eCallSid, sdp: sdp1}));
      assert(context.pstream.publish.calledOn(context.pstream));
      assert(version.processSDP.calledOnce);
      assert(version.processSDP.calledWithExactly(undefined, eSDP, {audio: true}, sinon.match.func, sinon.match.func));
      assert(version.getSDP.calledWithExactly());
      assert(version.getSDP.calledOn(version));
      assert(context._setNetworkPriority.calledOnce);
      sinon.assert.calledWith(context._setNetworkPriority, 'high');
      assert(callback.calledWithExactly(version.pc));
      assert.equal(context.onerror.called, false);
    });

    it('Should call onerror event when processSDP error callback is called and returns error object', () => {
      const error = new Error('error message');
      const expectedError = {info: {code: 31000, message: 'Error creating the answer: error message'}};
      context._initializeMediaStream.returns(true);
      version.processSDP.callsArgWith(4, error);
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(version.processSDP.calledOnce);
      assert(context.onerror.calledWithExactly(expectedError));
      assert(version.processSDP.calledWithExactly(undefined, eSDP, {audio: true}, sinon.match.func, sinon.match.func));
      assert.equal(context.pstream.publish.called, false);
      assert.equal(version.getSDP.called, false);
      assert.equal(callback.called, false);
    });

    it('Should call onerror event when processSDP error callback is called and returns error message', () => {
      context._initializeMediaStream.returns(true);
      version.processSDP.callsArgWith(4, 'error message');
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(version.processSDP.calledOnce);
      assert(context.onerror.calledWithExactly(EXPECTED_ERROR));
      assert(version.processSDP.calledWithExactly(undefined, eSDP, {audio: true}, sinon.match.func, sinon.match.func));
      assert.equal(context.pstream.publish.called, false);
      assert.equal(version.getSDP.called, false);
      sinon.assert.notCalled(context._setNetworkPriority);
      assert.equal(callback.called, false);
    });

    it('Should call callback for each success callback processSDP calls', () => {
      context._initializeMediaStream.returns(true);
      version.getSDP.returns('sdp');
      context.status = false;
      toTest();
      version.processSDP.callArg(3);
      version.processSDP.callArg(3);
      assert(callback.calledWithExactly(version.pc));
      assert(callback.calledTwice);
      assert.equal(context.onerror.called, false);
    });

    it('Should call onerror for each error callback processSDP calls', () => {
      context._initializeMediaStream.returns(true);
      version.getSDP.returns('sdp');
      toTest();
      version.processSDP.callArg(4, new Error('error message'));
      version.processSDP.callArg(4, new Error('error message'));
      assert(context.onerror.calledWithExactly(EXPECTED_ERROR));
      assert(context.onerror.calledTwice);
      assert.equal(callback.called, false);
    });

  });

  context('PeerConnection.prototype.iceRestart', () => {
    const METHOD = PeerConnection.prototype.iceRestart;
    const SDP = 'sdp';
    const CALLSID = 'callsid';

    let context;
    let pstream;
    let toTest;
    let version;

    beforeEach(() => {
      version = {
        createOffer: sinon.stub().returns({ then: (cb) => cb()}),
        getSDP: () => SDP,
        processAnswer: sinon.stub().callsFake((codecPreferences, sdp, onSuccess, onError) => onSuccess()),
      };
      pstream = {
        on: sinon.stub(),
        reinvite: sinon.stub(),
        removeListener: sinon.stub()
      };
      context = {
        callSid: CALLSID,
        codecPreferences: ['opus'],
        log: sinon.stub(),
        onerror: sinon.stub(),
        pstream,
        version
      };
      toTest = METHOD.bind(context);
    });

    it('Should call createOffer with iceRestart flag', (done) => {
      toTest().catch(() => {
        assert(version.createOffer.calledWithExactly(context.codecPreferences, {iceRestart: true}));
        done();
      });
      context._onAnswerOrRinging({});
    });

    it('Should publish reinvite', (done) => {
      toTest().then(() => {
        assert(pstream.removeListener.calledWithExactly('answer', context._onAnswerOrRinging));
        assert(pstream.removeListener.calledWithExactly('hangup', context._onHangup));
        assert(pstream.reinvite.calledWithExactly(SDP, CALLSID));
        done();
      });
      context._onAnswerOrRinging({ sdp: SDP });
    });

    it('Should return canRetry=true on createOffer fail', (done) => {
      version.createOffer = sinon.stub().returns(Promise.reject());
      toTest().catch((canRetry) => {
        assert(version.createOffer.calledWithExactly(context.codecPreferences, {iceRestart: true}));
        assert.equal(canRetry, true);
        done();
      });
    });

    it('Should return canRetry=false if reinvite fail', (done) => {
      toTest().catch((canRetry) => {
        assert(pstream.reinvite.calledWithExactly(SDP, CALLSID));
        assert(pstream.removeListener.calledWithExactly('answer', context._onAnswerOrRinging));
        assert(pstream.removeListener.calledWithExactly('hangup', context._onHangup));
        assert.equal(canRetry, false);
        done();
      });
      context._onHangup();
    });

    it('Should return canRetry=true if sdp is missing', (done) => {
      toTest().catch((canRetry) => {
        sinon.assert.notCalled(version.processAnswer);
        assert(pstream.removeListener.calledWithExactly('answer', context._onAnswerOrRinging));
        assert(pstream.removeListener.calledWithExactly('hangup', context._onHangup));
        assert.equal(canRetry, true);
        done();
      });
      context._onAnswerOrRinging({});
    });

    it('Should return canRetry=true on processAnswer fail', (done) => {
      version.processAnswer = sinon.stub().callsFake((codecPreferences, sdp, onSuccess, onError) => onError({}));
      toTest().catch((canRetry) => {
        sinon.assert.calledOnce(version.processAnswer);
        assert(pstream.removeListener.calledWithExactly('answer', context._onAnswerOrRinging));
        assert(pstream.removeListener.calledWithExactly('hangup', context._onHangup));
        assert.equal(canRetry, true);
        done();
      });
      context._onAnswerOrRinging({ sdp: SDP });
    });

    it('Should return canRetry=true if current connection is close', (done) => {
      context.status = 'closed';
      toTest().catch((canRetry) => {
        sinon.assert.notCalled(version.processAnswer);
        assert(pstream.removeListener.calledWithExactly('answer', context._onAnswerOrRinging));
        assert(pstream.removeListener.calledWithExactly('hangup', context._onHangup));
        assert.equal(canRetry, true);
        done();
      });
      context._onAnswerOrRinging({ sdp: SDP });
    });

    it('Should update _answerSdp', (done) => {
      toTest().then(() => {
        assert.equal(context._answerSdp, SDP);
        done();
      });
      context._onAnswerOrRinging({ sdp: SDP });
    });
  });

  context('PeerConnection.prototype.makeOutgoingCall', () => {
    const METHOD = PeerConnection.prototype.makeOutgoingCall;
    const EXPECTED_OFFER_ERROR = {info: {code: 31000, message: 'Error creating the offer: error message'}};
    const EXPECTED_PROCESSING_ERROR = {info: {code: 31000, message: 'Error processing answer: error message'}};
    const ERROR_MESSAGE = 'error message';
    const ERROR = new Error(ERROR_MESSAGE);
    const PAYLOAD = {sdp: 'sdp payload'};
    const CLOSED = 'closed';
    const NOT_CLOSED = 'not closed';

    const eParams = 'params';
    const eCallSid = 'callSid';
    const eConstraints = 'rtcConstraints';
    const eIceServers = 'iceServers';
    const eIss = 'this is iss';
    const eSDP = 'sdp';

    let context = null;
    let version = null;
    let callback = null;
    let toTest = null;

    beforeEach(() => {
      callback = sinon.stub();
      version = {
        pc: 'peer connection',
        getSDP: sinon.stub().returns(eSDP),
        createOffer: sinon.stub(),
        processAnswer: sinon.stub()
      };
      context = {
        _initializeMediaStream: sinon.stub().returns(true),
        _setNetworkPriority: sinon.stub(),
        callSid: null,
        version,
        status: CLOSED,
        onerror: sinon.stub(),
        pstream: {
          once: sinon.stub(),
          on: sinon.stub(),
          removeListener: sinon.stub(),
          publish: sinon.stub()
        },
        device: {
          token: null
        }
      };
      toTest = METHOD.bind(
        context,
        'token',
        eParams,
        eCallSid,
        eConstraints,
        eIceServers,
        callback
      );
    });

    it('Should not call createOffer when failed to initialize streams', () => {
      context._initializeMediaStream.returns(false);
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert.equal(version.createOffer.called, false);
    });

    it('Should call createOffer when succeeded to initialize streams', () => {
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(version.createOffer.calledOnce);
      assert(version.createOffer.calledWithExactly(undefined, {audio: true}, sinon.match.func, sinon.match.func));
      assert.equal(callback.called, false);
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
    });

    it('Should call onOfferSuccess and do nothting when createOffer calls success callback and status is closed', () => {
      version.createOffer.callsArg(2);
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(version.createOffer.calledOnce);
      assert(version.createOffer.calledWithExactly(undefined, {audio: true}, sinon.match.func, sinon.match.func));
      assert.equal(callback.called, false);
      assert.equal(context.pstream.publish.called, false);
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
    });

    it('Should call onOfferSuccess and pstream publish when createOffer calls success callback and status is not closed', () => {
      context.status = 'not closed';
      version.createOffer.callsArg(2);
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(version.createOffer.calledOnce);
      assert(version.createOffer.calledWithExactly(undefined, {audio: true}, sinon.match.func, sinon.match.func));
      assert.equal(callback.called, false);
      assert(context.pstream.publish.calledOnce);
      assert(context.pstream.publish.calledWithExactly('invite', {
        sdp: eSDP,
        callsid: eCallSid,
        twilio: {
          params: eParams
        }
      }));
      assert(version.getSDP.calledOnce);
      assert(version.getSDP.calledWithExactly());
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
    });

    it('Should call onOfferSuccess when createOffer calls success callback and status is not closed and device token is not truthy', () => {
      context.device.token = 'this is device token';
      context.status = NOT_CLOSED;
      version.createOffer.callsArg(2);
      toTest();
      assert(context._initializeMediaStream.calledWithExactly(eConstraints, eIceServers));
      assert(version.createOffer.calledOnce);
      assert(version.createOffer.calledWithExactly(undefined, {audio: true}, sinon.match.func, sinon.match.func));
      assert.equal(callback.called, false);
      assert(context.pstream.publish.calledOnce);
      assert(context.pstream.publish.calledWithExactly('invite', {
        sdp: eSDP,
        callsid: eCallSid,
        twilio: {
          params: eParams
        }
      }));
      assert(version.getSDP.calledOnce);
      assert(version.getSDP.calledWithExactly());
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
    });

    it('Should call onOfferError when createOffer calls error callback with error message', () => {
      version.createOffer.callsArgWith(3, ERROR_MESSAGE);
      toTest();
      assert(context.onerror.calledWithExactly(EXPECTED_OFFER_ERROR));
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
    });

    it('Should call onAnswer and set _answerSdp listener when pstream answer event is triggered', () => {
      context.pstream.on.callsArgWith(1, PAYLOAD);
      toTest();
      assert.equal(context._answerSdp, PAYLOAD.sdp);
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
    });

    it('Should call processAnswer when when status not closed and answer is emitted', () => {
      context.status = NOT_CLOSED;
      context.pstream.on.callsArgWith(1, PAYLOAD);
      toTest();
      assert.equal(context._answerSdp, PAYLOAD.sdp);
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
      assert(version.processAnswer.calledWithExactly(undefined, PAYLOAD.sdp, sinon.match.func, sinon.match.func));
      assert(version.processAnswer.calledOn(version));
    });

    it('Should call onerror and proxy error message when processAnswer calls error callback', () => {
      context.status = NOT_CLOSED;
      context.pstream.on.callsArgWith(1, PAYLOAD);
      version.processAnswer.callsArgWith(3, ERROR);
      toTest();
      assert.equal(context._answerSdp, PAYLOAD.sdp);
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
      assert(version.processAnswer.calledWithExactly(undefined, PAYLOAD.sdp, sinon.match.func, sinon.match.func));
      assert(version.processAnswer.calledOn(version));
      assert(context.onerror.calledWithExactly(EXPECTED_PROCESSING_ERROR));
    });

    it('Should call onerror and proxy message when processAnswer calls error callback', () => {
      context.status = NOT_CLOSED;
      context.pstream.on.callsArgWith(1, PAYLOAD);
      version.processAnswer.callsArgWith(3, ERROR_MESSAGE);
      toTest();
      assert.equal(context._answerSdp, PAYLOAD.sdp);
      assert.equal(callback.called, false);
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
      assert(version.processAnswer.calledWithExactly(undefined, PAYLOAD.sdp, sinon.match.func, sinon.match.func));
      assert(version.processAnswer.calledOn(version));
      assert(context.onerror.calledWithExactly(EXPECTED_PROCESSING_ERROR));
      sinon.assert.notCalled(context._setNetworkPriority);
    });

    it('Should call onAnswerSuccess and onMediaStarted with version pc when prcoessAnswer calls success callback', () => {
      context.status = NOT_CLOSED;
      context.pstream.on.callsArgWith(1, PAYLOAD);
      version.processAnswer.callsArgWith(2);
      toTest();
      assert.equal(context.onerror.called, false);
      assert.equal(context._answerSdp, PAYLOAD.sdp);
      assert(context.pstream.on.calledWithExactly('answer', sinon.match.func));
      assert(version.processAnswer.calledWithExactly(undefined, PAYLOAD.sdp, sinon.match.func, sinon.match.func));
      assert(version.processAnswer.calledOn(version));
      assert(callback.calledWithExactly(version.pc));
    });
  });

  context('PeerConnection.prototype._initializeMediaStream', () => {
    const METHOD = PeerConnection.prototype._initializeMediaStream;
    const CONSTRAINTS = {audio: true, video: false};
    const ICE_SERVERS = {SERVER_ONE: 1, SERVER_TWO: 2};
    const STATUS_OPEN = 'open';
    const STATUS_NOT_OPEN = 'not open';
    const PSTREAM_STATUS_DISCONNECTED = 'disconnected';
    const PSTREAM_STATUS_NOT_DISCONNECTED = 'not disconnected';
    const CONNECTION_ERROR = {info: {code: 31000, message: "Cannot establish connection. Client is disconnected"}};

    let context = null;
    let pstream = null;
    let toTest = null;

    beforeEach(() => {
      pstream = {
        status: PSTREAM_STATUS_NOT_DISCONNECTED
      };
      context = {
        status: STATUS_NOT_OPEN,
        pstream,
        onerror: sinon.stub(),
        close: sinon.stub(),
        _setupPeerConnection: sinon.stub(),
        _setupChannel: sinon.stub()
      };
      toTest = METHOD.bind(context, CONSTRAINTS, ICE_SERVERS);
    });

    it('Should return false when status is open', () => {
      context.status = STATUS_OPEN;
      assert.strictEqual(toTest(), false);
      assert.equal(context.onerror.called, false);
      assert.equal(context._setupPeerConnection.called, false);
      assert.equal(context._setupChannel.called, false);
      assert.equal(context.close.called, false);
    });

    it('Should call onerror with error object and return false when pstream status is disconnected', () => {
      pstream.status = PSTREAM_STATUS_DISCONNECTED;
      assert.strictEqual(toTest(), false);
      assert(context.onerror.calledWithExactly(CONNECTION_ERROR));
      assert(context.close.calledWithExactly());
      assert(context.onerror.calledBefore(context.close));
      assert.equal(context._setupPeerConnection.called, false);
      assert.equal(context._setupChannel.called, false);
    });

    it('Should call setup peer connection and return true when status is not open and pstream status is not disconnected', () => {
      assert.strictEqual(toTest(), true);
      assert(context._setupPeerConnection.calledWithExactly(CONSTRAINTS, ICE_SERVERS));
      assert(context._setupChannel.calledWithExactly());
      assert(context._setupPeerConnection.calledBefore(context._setupChannel));
      assert.equal(context.onerror.called, false);
      assert.equal(context.close.called, false);
    });
  });

  context('PeerConnection.prototype._setSinkIds', () => {
    const METHOD = PeerConnection.prototype._setSinkIds;

    let toTest = null;
    let context = null;

    beforeEach(() => {
      context = {
        _isSinkSupported: true,
        _updateAudioOutputs: sinon.stub().returns('_updateAudioOutputs'),
        sinkIds: 'before'
      };
      toTest = METHOD.bind(context);
    });

    it('Should return undefined when isSinkSupported is falsy', done => {
      context._isSinkSupported = '';
      toTest({}).then(() => {
        done('Should not resolve')
      }).catch(error => {
        assert.equal(error instanceof Error, true);
        assert.equal(error.message, 'Audio output selection is not supported by this browser');
        assert.equal(context.sinkIds, 'before');
      }).then(done).catch(done);
    });

    it('Should set this.sinkIds a set if sinkIds is an array', () => {
      const sinkIds = ['a', 'b', 'c'];
      context.version = { };
      assert.equal(toTest(sinkIds), '_updateAudioOutputs');
      assert(context.sinkIds instanceof Set);
      assert(context.sinkIds.has('a'));
      assert(context.sinkIds.has('b'));
      assert(context.sinkIds.has('c'));
    });

    it('Should set this.sinkIds a set if sinkIds is not iterable', () => {
      const sinkIds = 'a';
      context.version = { };
      assert.equal(toTest(sinkIds), '_updateAudioOutputs');
      assert(context.sinkIds instanceof Set);
      assert(context.sinkIds.has('a'));
    });

    it('Should set this.sinkIds but not call _updateAudioOutputs if version is empty', () => {
      const sinkIds = 'a';
      context._updateAudioOutputs = sinon.spy(() => Promise.resolve());
      return PeerConnection.prototype._setSinkIds.call(context, 'a').then(a => {
        assert(!a);
        assert(context.sinkIds instanceof Set);
        assert(context.sinkIds.has('a'));
        assert(!context._updateAudioOutputs.called);
      });
    });
  });

  context('PeerConnection.prototype._updateAudioOutputs', () => {
    const METHOD = PeerConnection.prototype._updateAudioOutputs;
    const SINK_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
    const HAS_IDS = ['a', 'b', 'c', 'g', 'h'];
    const ERROR = new Error('error message');

    let toTest = null;
    let context = null;

    beforeEach(() => {
      context = {
        sinkIds: new Set(SINK_IDS),
        outputs: new Set(HAS_IDS),
        _createAudioOutput: sinon.stub().returns(Promise.resolve()),
        _removeAudioOutput: sinon.stub().returns(Promise.resolve())
      };
      toTest = METHOD.bind(context);
    });

    it('Should call createAudioOutput for all sinkIds when there is no outputs', done => {
      context.outputs = new Set();
      toTest().then(() => {
        assert(context._createAudioOutput.alwaysCalledOn(context));
        assert.equal(context._removeAudioOutput.called, false);
      }).then(done).catch(done);
    });

    it('Should call removeAudioOutput for all outputs when there is no sinkIds', done => {
      context.sinkIds = new Set();
      toTest().then(() => {
        assert(context._removeAudioOutput.alwaysCalledOn(context));
        assert.equal(context._createAudioOutput.called, false);
      }).then(done).catch(done);
    });

    it('Should call createAudioOutput for all new sinkIds and call removeAudioOutput for all outputs which are not in sinkIds collection', done => {
      toTest().then(() => {
        assert(context._removeAudioOutput.alwaysCalledOn(context));
        assert(context._createAudioOutput.alwaysCalledOn(context));
        assert(context._removeAudioOutput.calledWith('g'));
        assert(context._removeAudioOutput.calledWith('h'));
        assert(context._createAudioOutput.calledWith('d'));
        assert(context._createAudioOutput.calledWith('e'));
        assert(context._createAudioOutput.calledWith('f'));
        assert.equal(context._removeAudioOutput.callCount, 2);
        assert.equal(context._createAudioOutput.callCount, 3);
      }).then(done).catch(done);
    });

    it('Should reject and should not call removeAudioOutput when createAudioOutput rejects', done => {
      context._createAudioOutput.returns(Promise.reject(ERROR));
      toTest().catch(aError => {
        assert.equal(aError.message, ERROR.message);
        assert(context._createAudioOutput.alwaysCalledOn(context));
        assert.equal(context._removeAudioOutput.called, false);
      }).then(done).catch(done);
    });

    it('Should reject and should have called createAudioOutput when removeAudioOutput rejects', done => {
      context._removeAudioOutput.returns(Promise.reject(ERROR));
      toTest().catch(aError => {
        assert.equal(aError.message, ERROR.message);
        assert(context._removeAudioOutput.alwaysCalledOn(context));
        assert(context._createAudioOutput.alwaysCalledOn(context));
        assert(context._createAudioOutput.calledWith('d'));
        assert(context._createAudioOutput.calledWith('e'));
        assert(context._createAudioOutput.calledWith('f'));
        assert.equal(context._createAudioOutput.callCount, 3);
      }).then(done).catch(done);
    });

    it('Should returns results from removeAudioOutput when everything resolves', done => {
      context._removeAudioOutput
        .withArgs('g').returns(Promise.resolve('g'))
        .withArgs('h').returns(Promise.resolve('h'));
      toTest().then(aResults => {
        assert.equal(context._removeAudioOutput.callCount, 2);
        assert.equal(aResults.length, 2);
        assert.notEqual(aResults.indexOf('h'), -1);
        assert.notEqual(aResults.indexOf('g'), -1);
      }).then(done).catch(done);
    });
  });

  context('PeerConnection.prototype._createAudioOutput', () => {
    const METHOD = PeerConnection.prototype._createAudioOutput;
    const ID = 'this is ID';
    const DEST_STREAM = 'dest.stream';
    const SOURCE = 'this is source';
    const MESSAGE = 'this is error';
    const ERROR = new Error(MESSAGE);

    let toTest = null;
    let context = null;
    let audio = null;
    let dest = null;

    beforeEach(() => {
      dest = {
        stream: DEST_STREAM
      };
      audio = {
        setSinkId: sinon.stub().returns(Promise.resolve()),
        play: sinon.stub(),

      };
      context = {
        outputs: {
          set: sinon.stub()
        },
        window: {
          URL: {
            createObjectURL: sinon.stub().returns(SOURCE)
          },
          webkitURL: {
            createObjectURL: sinon.stub().returns(SOURCE)
          }
        },
        _audioContext: {
          createMediaStreamDestination: sinon.stub().returns(dest)
        },
        _mediaStreamSource: {
          connect: sinon.stub()
        },
        _createAudio: sinon.stub().returns(audio)
      };
      toTest = METHOD.bind(context, ID);
    });

    it('Should create media stream, connect to it and start playing audio and set outputs when no errors or rejections with window.URL', done => {
      context.window.webkitURL = null;
      toTest().then(() => {
        assert(context._audioContext.createMediaStreamDestination.calledOnce);
        assert(context._audioContext.createMediaStreamDestination.calledWithExactly());
        assert(context._mediaStreamSource.connect.calledOnce);
        assert(context._mediaStreamSource.connect.calledWithExactly(dest));
        assert(context._createAudio.calledOnce);
        assert(audio.setSinkId.calledOnce);
        assert(audio.setSinkId.calledWithExactly(ID));
        assert(audio.setSinkId.calledBefore(audio.play));
        assert(audio.play.calledOnce);
        assert(audio.play.calledWithExactly());
        assert(context.outputs.set.calledOnce);
        assert(context.outputs.set.calledWithExactly(ID, {
          audio,
          dest
        }));
      }).then(done).catch(done)
    });

    it('Should create media stream, connect to it and start playing audio and set outputs when no errors or rejections with window.webkitURL', done => {
      context.window.URL = null;
      toTest().then(() => {
        assert(context._audioContext.createMediaStreamDestination.calledOnce);
        assert(context._audioContext.createMediaStreamDestination.calledWithExactly());
        assert(context._mediaStreamSource.connect.calledOnce);
        assert(context._mediaStreamSource.connect.calledWithExactly(dest));
        assert(context._createAudio.calledOnce);
        assert(audio.setSinkId.calledOnce);
        assert(audio.setSinkId.calledWithExactly(ID));
        assert(audio.setSinkId.calledBefore(audio.play));
        assert(audio.play.calledOnce);
        assert(audio.play.calledWithExactly());
        assert(context.outputs.set.calledOnce);
        assert(context.outputs.set.calledWithExactly(ID, {
          audio,
          dest
        }));
      }).then(done).catch(done)
    });

    it('Should throw error when createMediaStreamDestination throws error', () => {
      context._audioContext.createMediaStreamDestination.throws(ERROR);
      assert.throws(toTest, MESSAGE);
    });

    it('Should throw error when mediaStreamSource connect throws error', () => {
      context._mediaStreamSource.connect.throws(ERROR);
      assert.throws(toTest, MESSAGE);
    });

    it('Should reject and not call audio play and set outputs when setSinkIds rejects', done => {
      audio.setSinkId.returns(Promise.reject(ERROR));
      toTest().catch(aError => {
        assert.equal(aError.message, ERROR.message);
        assert.equal(audio.play.called, false);
        assert.equal(context.outputs.set.called, false);
      }).then(done).catch(done);
    });

    it('Should reject and set outputs when audio play rejects', done => {
      audio.play.returns(Promise.reject(ERROR));
      toTest().catch(aError => {
        assert.equal(aError.message, ERROR.message);
        assert.equal(context.outputs.set.called, false);
        assert(audio.setSinkId.calledOnce);
      }).then(done).catch(done);
    });

    it('Should reject when outputs set throws error', done => {
      context.outputs.set.throws(ERROR);
      toTest().catch(aError => {
        assert.equal(aError.message, ERROR.message);
        assert(audio.setSinkId.calledOnce);
        assert(audio.play.calledOnce);
      }).then(done).catch(done);
    });
  });

  context('PeerConnection.prototype._removeAudioOutputs', () => {
    const METHOD = PeerConnection.prototype._removeAudioOutputs;
    const OUTPUTS = [['a', 'a1'], ['b', 'b1'], ['c', 'c1']];
    const SRC_OBJECT = { tempKey: 'tempVal' };
    const SRC_URL = 'http://google.com';

    let toTest = null;
    let context = null;

    beforeEach(() => {
      context = {
        outputs: new Map(OUTPUTS),
        _removeAudioOutput: sinon.stub(),
        _masterAudio: { paused: true },
        _masterAudioDeviceId: 1,
        _disableOutput: sinon.stub()
      };
      toTest = METHOD.bind(context);
    });

    it('Should call remove audio output on every key in output and return results from remove audio output', () => {
      context._removeAudioOutput
        .withArgs('a').returns('a1')
        .withArgs('b').returns('b1')
        .withArgs('c').returns('c1');
      const actual = toTest();
      assert.notEqual(actual.indexOf('a1'), -1);
      assert.notEqual(actual.indexOf('b1'), -1);
      assert.notEqual(actual.indexOf('c1'), -1);
      assert.equal(actual.length, 3);
      assert(context._removeAudioOutput.calledThrice);
      assert(context._removeAudioOutput.calledWith('a'));
      assert(context._removeAudioOutput.calledWith('b'));
      assert(context._removeAudioOutput.calledWith('c'));
      assert(context._removeAudioOutput.calledOn(context));
    });

    it('Should properly release audio srcObject when removing outputs', () => {
      context._masterAudio.srcObject = SRC_OBJECT;
      const ref = context._masterAudio;
      toTest();
      assert.equal(ref.srcObject, null);
      assert.equal(context._masterAudio, null);
    });

    it('Should properly release audio src when removing outputs', () => {
      context._masterAudio.src = SRC_URL;
      const ref = context._masterAudio;
      toTest();
      assert.equal(ref.src, '');
      assert.equal(context._masterAudio, null);
    });
  });

  context('PeerConnection.prototype._removeAudioOutput', () => {
    const METHOD = PeerConnection.prototype._removeAudioOutput;
    const ID = '123';
    const ID_NUMB = 123;
    const ID_DIFF = 'diff from 123';
    const MESSAGE = 'this ir error message';
    const ERROR = new Error(MESSAGE);

    let toTest = null;
    let context = null;

    beforeEach(() => {
      context = {
        _masterAudioDeviceId: ID,
        _reassignMasterOutput: sinon.stub().returns('_reassignMasterOutput'),
        _disableOutput: sinon.stub(),
        outputs: {
          delete: sinon.stub()
        }
      };
      toTest = METHOD.bind(context, ID);
    });

    it('Should reasign master output when master audio device id is argument id', () => {
      assert.equal(toTest(), '_reassignMasterOutput');
      assert(context._reassignMasterOutput.calledOnce);
      assert(context._reassignMasterOutput.calledWithExactly(context, ID));
      assert.equal(context._disableOutput.called, false);
      assert.equal(context.outputs.delete.called, false);
    });

    it('Should disable output and delete it from outputs collection and return resolved promise when ids are not equa', done => {
      context._masterAudioDeviceId = ID_DIFF;
      toTest().then(result => {
        assert.strictEqual(result, undefined);
        assert.equal(context._reassignMasterOutput.called, false);
        assert(context._disableOutput.calledOnce);
        assert(context._disableOutput.calledWithExactly(context, ID));
        assert(context.outputs.delete.calledOnce);
        assert(context.outputs.delete.calledWithExactly(ID));
      }).then(done).catch(done);
    });

    it('Should disable and delete device when ids are not strictly equal', done => {
      context._masterAudioDeviceId = ID_NUMB;
      toTest().then(result => {
        assert.strictEqual(result, undefined);
        assert.equal(context._reassignMasterOutput.called, false);
        assert(context._disableOutput.calledOnce);
        assert(context._disableOutput.calledWithExactly(context, ID));
        assert(context.outputs.delete.calledOnce);
        assert(context.outputs.delete.calledWithExactly(ID));
      }).then(done).catch(done);
    });

    it('Should throw error when reassignMasterOutput throws error', () => {
      context._reassignMasterOutput.throws(ERROR);
      assert.throws(toTest, MESSAGE);
      assert.equal(context._disableOutput.called, false);
    });

    it('Should throw error when disable output throws error', () => {
      context._masterAudioDeviceId = ID_DIFF;
      context._disableOutput.throws(ERROR);
      assert.throws(toTest, MESSAGE);
      assert.equal(context.outputs.delete.called, false);
    });

    it('Should throw error when collection throws error', () => {
      context._masterAudioDeviceId = ID_DIFF;
      context.outputs.delete.throws(ERROR);
      assert.throws(toTest, MESSAGE);
      assert(context._disableOutput.calledOnce);
    });
  });

  context('PeerConnection.prototype._disableOutput', () => {
    const METHOD = PeerConnection.prototype._disableOutput;

    let toTest = null;
    let pc = null;
    let output = null;

    beforeEach(() => {
      output = {
        audio: {
          pause: sinon.stub(),
          src: 'before'
        },
        dest: {
          disconnect: sinon.stub()
        }
      };
      pc = {
        outputs: {
          get: sinon.stub().returns(output)
        }
      };
      toTest = METHOD.bind(null, pc, 'id');
    });

    it('Should get output by id pause and disconnect it when all methods are defined', () => {
      assert.strictEqual(toTest(), undefined);
      assert(output.audio.pause.calledOnce);
      assert(output.audio.pause.calledWithExactly());
      assert(output.dest.disconnect.calledOnce);
      assert(output.dest.disconnect.calledWithExactly());
      assert.equal(output.audio.src, '');
    });

    it('Should return early when output not present in collections', () => {
      pc.outputs.get.returns(null);
      assert.strictEqual(toTest(), undefined);
    });

    it('Should not call pause on audio if audio does not exist in output', () => {
      output.audio = null;
      assert.strictEqual(toTest(), undefined);
      assert(output.dest.disconnect.calledOnce);
      assert(output.dest.disconnect.calledWithExactly());
    });

    it('Should not call disconnect on dest if dest does not exist in output', () => {
      output.dest = null;
      assert.strictEqual(toTest(), undefined);
      assert(output.audio.pause.calledOnce);
      assert(output.audio.pause.calledWithExactly());
    });
  });

  context('PeerConnection.prototype._reassignMasterOutput', () => {
    const METHOD = PeerConnection.prototype._reassignMasterOutput;
    const OUTPUTS = [['a', 'a1'], ['b', 'b1'], ['c', 'c1']];
    const MASTER_ID = 'masterId';
    const MESSAGE = 'error message';
    const ERROR = new Error(MESSAGE);
    let toTest = null;
    let pc = null;
    let output = null;
    let context = null;

    beforeEach(() => {
      output = {
        audio: {
          pause: sinon.stub(),
          src: 'before',
          setSinkId: sinon.stub()
        },
        dest: {
          disconnect: sinon.stub()
        }
      };
      pc = {
        _masterAudioDeviceId: 'before',
        outputs: new Map(OUTPUTS)
      };
      pc.outputs.set(MASTER_ID, output);
      context = {
        _disableOutput: sinon.stub(),
        log: sinon.stub()
      };
      toTest = METHOD.bind(context, pc, MASTER_ID);
    });

    it('Should call setSinkId with default when audio outputs are empty', done => {
      output.audio.setSinkId.returns(Promise.resolve());
      pc.outputs.delete('a');
      pc.outputs.delete('b');
      pc.outputs.delete('c');
      toTest().then(() => {
        assert.equal(pc.outputs.has(MASTER_ID), false);
        assert(output.audio.setSinkId.calledWithExactly('default'));
        assert(context._disableOutput.calledWithExactly(pc, 'default'));
        assert.deepStrictEqual(pc.outputs.get('default'), output);
        assert.deepStrictEqual(pc._masterAudioDeviceId, 'default');
        assert(output.audio.setSinkId.calledBefore(context._disableOutput));
      }).then(done).catch(done);
    });

    it('Should call setSinkId with first available audio device from outputs', done => {
      output.audio.setSinkId.returns(Promise.resolve());
      toTest().then(() => {
        assert(pc.outputs.has('a'));
        assert(pc.outputs.has('c'));
        assert(pc.outputs.has('b'));
        assert.equal(pc.outputs.has(MASTER_ID), false);
        assert(output.audio.setSinkId.calledWithExactly('a'));
        assert(context._disableOutput.calledWithExactly(pc, 'a'));
        assert.deepStrictEqual(pc.outputs.get('a'), output);
        assert.deepStrictEqual(pc._masterAudioDeviceId, 'a');
        assert(output.audio.setSinkId.calledBefore(context._disableOutput));
      }).then(done).catch(done);
    });

    it('Should add back pc output when setSinkId rejects', () => {
      output.audio.setSinkId.returns(Promise.reject(ERROR));
      return toTest().then(() => {
        assert(pc.outputs.has('a'));
        assert(pc.outputs.has('c'));
        assert(pc.outputs.has('b'));
        assert(pc.outputs.has(MASTER_ID));
        assert(output.audio.setSinkId.calledWithExactly('a'));
        assert.equal(context._disableOutput.called, false);
        assert.deepStrictEqual(pc.outputs.get('a'), 'a1');
        assert.deepStrictEqual(pc._masterAudioDeviceId, 'before');
      });
    });
  });

  context('PeerConnection.prototype.getOrCreateDTMFSender', () => {
    const METHOD = PeerConnection.prototype.getOrCreateDTMFSender;
    const DTMF_SENDER = 'dtmf sender';

    let toTest = null;
    let context = null;
    let pc = null;

    beforeEach(() => {
      pc = {
        createDTMFSender: sinon.stub().returns(DTMF_SENDER),
        getLocalStreams: sinon.stub().throws(new Error('Override this'))
      };
      context = {
        _getAudioTracks: sinon.stub().throws(new Error('Override this')),
        _dtmfSender: false,
        _dtmfSenderUnsupported: false,
        version: {
          pc
        },
        log: sinon.stub()
      };
      toTest = METHOD.bind(context);
    });

    it('Should return dtmf sender early when it is truthy', () => {
      context._dtmfSender = 'truthy';
      assert.deepStrictEqual(toTest(), 'truthy');
    });

    it('Should return null early when dtmf sender is not supported', () => {
      context._dtmfSenderUnsupported = 'truthy';
      assert.deepStrictEqual(toTest(), null);
      assert.equal(context._getAudioTracks.called, false);
    });

    it('Should return null when peer connection is not falsy', () => {
      context.version.pc = false;
      assert.deepStrictEqual(toTest(), null);
      assert.equal(context._getAudioTracks.called, false);
      assert(context.log.calledWith('No RTCPeerConnection available to call createDTMFSender on'));
    });

    xit('Should return null and set dtmf unsupported true when createDTMFSender is not a function', () => {
      pc.createDTMFSender = false;
      pc.getLocalStreams.returns([]);
      assert.deepStrictEqual(toTest(), null);
      assert(context.log.calledWith('No local audio MediaStreamTrack available on the ' +
        'RTCPeerConnection to pass to createDTMFSender'));
      assert.equal(context._getAudioTracks.called, false);
    });

    xit('Should return null when there are not any local streams', () => {
      pc.getLocalStreams.returns([]);
      assert.deepStrictEqual(toTest(), null);
      assert(pc.getLocalStreams.calledWithExactly());
      assert.equal(context._getAudioTracks.called, false);
      assert(context.log.calledWith('No local audio MediaStreamTrack available on the RTCPeerConnection to pass to createDTMFSender'));
    });

    xit('Should return null when any of the local streams getAudioTracks does not have tracks', () => {
      pc.getLocalStreams.returns(['stream1', 'stream2', 'stream3']);
      context._getAudioTracks.returns([]);

      assert.deepStrictEqual(toTest(), null);
      assert(pc.getLocalStreams.calledWithExactly());
      assert(context._getAudioTracks.calledWithExactly('stream1'));
      assert(context._getAudioTracks.calledWithExactly('stream2'));
      assert(context._getAudioTracks.calledWithExactly('stream3'));
      assert(context.log.calledWith('No local audio MediaStreamTrack available on the RTCPeerConnection to pass to createDTMFSender'));
    });

    xit('Should find first available track from all local streams and createDTMFSender from it', () => {
      pc.getLocalStreams.returns(['stream1', 'stream2', 'stream3']);
      context._getAudioTracks.returns(['track1', 'track2']);

      assert.deepStrictEqual(toTest(), DTMF_SENDER);
      assert(pc.getLocalStreams.calledWithExactly());
      assert(context.log.calledWith('Creating RTCDTMFSender'));
      assert(pc.createDTMFSender.calledWithExactly('track1'));
      assert(context._getAudioTracks.calledWithExactly('stream1'));
      assert.equal(context._getAudioTracks.calledWithExactly('stream2'), false);
      assert.equal(context._getAudioTracks.calledWithExactly('stream3'), false);
      assert.deepStrictEqual(context._dtmfSender, DTMF_SENDER);
    });
  });

  context('PeerConnection.prototype._stopStream', () => {
    const METHOD = PeerConnection.prototype._stopStream;

    let toTest = null;
    let context = null;
    let stream = null;

    beforeEach(() => {
      stream = {
        stop: sinon.stub()
      };
      context = {
        _getAudioTracks: sinon.stub().throws(new Error('Override this')),
        _canStopMediaStreamTrack: sinon.stub()
      };
      toTest = METHOD.bind(context);
    });

    xit('Should stop all tracks for specific stream with getAudioTracks', () => {
      const track1 = {stop: sinon.stub()};
      const track2 = {stop: sinon.stub()};
      context._canStopMediaStreamTrack.returns(true);
      context._getAudioTracks.returns([track1, track2]);

      assert.equal(toTest(stream), undefined);
      assert(track1.stop.calledWithExactly());
      assert(track2.stop.calledWithExactly());
      assert(context._getAudioTracks.calledWithExactly(stream));
    });

    it('Should stop stream when media track stop returns false', () => {
      context._canStopMediaStreamTrack.returns(false);

      assert.equal(toTest(stream), undefined);
      assert.equal(context._getAudioTracks.called, false);
    });

    it('should do nothing if _shouldManaageStream is false', () => {
      context._shouldManaageStream = false;
      assert.equal(toTest(stream), undefined);
      assert.equal(context._getAudioTracks.called, false);
    });
  });

  context('PeerConnection.prototype._setupPeerConnection', () => {
    const METHOD = PeerConnection.prototype._setupPeerConnection;
    const CONSTRAINTS = {audio: 'boolean'};
    const ICE_SERVERS = {many: 'ice', servers: 'here'};
    const LOG = 'log';
    const STREAM = 'stream';
    const MESSAGE = 'error message';
    const ERROR = new Error(MESSAGE);

    let toTest = null;
    let context = null;
    let params = null;
    let sender = null;
    let version = null;

    beforeEach(() => {
      params = {
        foo: 'bar',
        encodings: [
          { priority: 'low', networkPriority: 'low' },
          { priority: 'low', networkPriority: 'low' },
        ]
      };
      sender = {
        getParameters: sinon.spy(() => Object.assign({ }, params)),
        setParameters: sinon.spy((p) => params = p),
      };
      version = {
        create: sinon.stub(),
        pc: {
          addStream: sinon.stub(),
          getSenders: () => [sender],
        }
      };
      context = {
        _isSinkSupported: true,
        options: { },
        stream: STREAM,
        log: LOG,
        _onAddTrack: sinon.stub(),
        _fallbackOnAddTrack: sinon.stub(),
        _startPollingVolume: sinon.stub(),
        _getProtocol: sinon.stub().returns(version),
      };
      toTest = METHOD.bind(context, CONSTRAINTS, ICE_SERVERS);
    });

    it('Should set callback on version pc onaddstream when create and addstream do not throw error', () => {
      assert.deepStrictEqual(toTest(), version);
      assert(version.create.calledWithExactly(LOG, CONSTRAINTS, ICE_SERVERS));
      assert(version.pc.addStream.calledWithExactly(STREAM));
      assert.equal(typeof version.pc.onaddstream, 'function');
    });

    it('Should not create onaddstream callback function when version create throws error', () => {
      version.create.throws(ERROR);
      assert.throws(toTest, MESSAGE);
      assert(version.create.calledWithExactly(LOG, CONSTRAINTS, ICE_SERVERS));
      assert.equal(version.pc.addStream.called, false);
      assert.equal(typeof version.pc.onaddstream, 'undefined');
    });

    it('Should not create onaddstream callback function when pc addstream throws error', () => {
      version.pc.addStream.throws(ERROR);
      assert.throws(toTest, MESSAGE);
      assert(version.create.calledWithExactly(LOG, CONSTRAINTS, ICE_SERVERS));
      assert(version.pc.addStream.calledWithExactly(STREAM));
      assert.equal(typeof version.pc.onaddstream, 'undefined');
    });

    it('Should call _onAddTrack when sink is supported', () => {
      const event = {stream: STREAM};
      assert.deepStrictEqual(toTest(), version);
      version.pc.onaddstream({stream: STREAM});
      assert.equal(typeof version.pc.onaddstream, 'function');
      assert.equal(context._remoteStream, STREAM);
      assert(context._onAddTrack.calledWithExactly(context, STREAM));
      assert.equal(context._fallbackOnAddTrack.called, false);
      assert(context._onAddTrack.calledOn(context));
      assert(context._startPollingVolume.calledWithExactly());
    });

    it('Should call _onAddTrack when sink is supported', () => {
      context._isSinkSupported = false;
      const event = {stream: STREAM};
      assert.deepStrictEqual(toTest(), version);
      version.pc.onaddstream({stream: STREAM});
      assert.equal(typeof version.pc.onaddstream, 'function');
      assert.equal(context._remoteStream, STREAM);
      assert(context._fallbackOnAddTrack.calledWithExactly(context, STREAM));
      assert(context._fallbackOnAddTrack.calledOn(context));
      assert.equal(context._onAddTrack.called, false);
      assert(context._startPollingVolume.calledWithExactly());
    });
  });

  describe('PeerConnection.prototype._setNetworkPriority', () => {
    const METHOD = PeerConnection.prototype._setNetworkPriority;
    const LOG = 'log';
    const STREAM = 'stream';
    const MESSAGE = 'error message';
    const ERROR = new Error(MESSAGE);

    let toTest = null;
    let context = null;
    let params = null;
    let sender = null;
    let version = null;

    beforeEach(() => {
      params = {
        foo: 'bar',
        encodings: [
          { priority: 'low', networkPriority: 'low' },
          { priority: 'low', networkPriority: 'low' },
        ]
      };
      sender = {
        getParameters: sinon.spy(() => Object.assign({ }, params)),
        setParameters: sinon.spy((p) => params = p),
      };
      version = {
        create: sinon.stub(),
        pc: {
          addStream: sinon.stub(),
        }
      };
      context = {
        _isSinkSupported: true,
        _sender: sender,
        options: { },
        stream: STREAM,
        log: LOG,
        _onAddTrack: sinon.stub(),
        _fallbackOnAddTrack: sinon.stub(),
        _startPollingVolume: sinon.stub(),
        _getProtocol: sinon.stub().returns(version),
      };
      toTest = METHOD.bind(context, 'high');
    });

    it('Should set network priority to high when dscp is enabled', () => {
      context.options.dscp = true;
      toTest();
      assert.deepEqual(sender.setParameters.args[0][0], { foo: 'bar', priority: 'high', encodings: [
        { priority: 'high', networkPriority: 'high' },
        { priority: 'high', networkPriority: 'high' },
      ] });
    });

    it('Should leave network priority alone when dscp is disabled', () => {
      context.options.dscp = false;
      toTest();
      sinon.assert.notCalled(sender.setParameters);
    });
  });

  describe('PeerConnection.prototype._setupPeerConnection.mute', () => {
    const METHOD = PeerConnection.prototype.mute;

    let toTest = null;
    let context = null;

    beforeEach(() => {
      context = {
        stream: {
          audioTracks: [{}]
        }
      };
      toTest = METHOD.bind(context);
    });

    it('Should set .isMuted to the boolean passed', () => {
      toTest(true);
      assert(context.isMuted);
      toTest(false);
      assert(!context.isMuted);
    });

    it('Should set track.enabled to the opposite of the boolean passed', () => {
      toTest(true);
      assert(!context.stream.audioTracks[0].enabled);
      toTest(false);
      assert(context.stream.audioTracks[0].enabled);
    });
  });

});
