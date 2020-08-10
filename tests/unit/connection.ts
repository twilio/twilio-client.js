import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import * as assert from 'assert';
import { EventEmitter } from 'events';
import { SinonFakeTimers, SinonSpy, SinonStubbedInstance } from 'sinon';
import * as sinon from 'sinon';
import { MediaErrors } from '../../lib/twilio/errors';

const Util = require('../../lib/twilio/util');

/* tslint:disable-next-line */
describe('Connection', function() {
  let audioHelper: any;
  let callback: Function;
  let clock: SinonFakeTimers;
  let config: Connection.Config;
  let conn: Connection;
  let getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  let mediaStream: any;
  let monitor: any;
  let options: Connection.Options;
  let pstream: any;
  let publisher: any;
  let rtcConfig: RTCConfiguration;
  let soundcache: Map<Device.SoundName, any>;

  const MediaHandler = () => {
    mediaStream = createEmitterStub(require('../../lib/twilio/rtc/peerconnection'));
    mediaStream.setInputTracksFromStream = sinon.spy((rejectCode?: number) => {
      return rejectCode ? Promise.reject({ code: rejectCode }) : Promise.resolve();
    });
    mediaStream.answerIncomingCall = sinon.spy((a: any, b: any, c: any, d: RTCConfiguration, cb: Function) => {
      callback = cb;
      rtcConfig = d;
      return Promise.reject('no');
    });
    mediaStream.openWithConstraints = sinon.spy(() => Promise.resolve());
    mediaStream.stream = Symbol('stream');
    mediaStream._remoteStream = Symbol('_remoteStream');
    mediaStream.isMuted = Symbol('isMuted');
    mediaStream.mute = sinon.spy((shouldMute: boolean) => { mediaStream.isMuted = shouldMute; });
    mediaStream.version = {pc: {}, getSDP: () =>
      'a=rtpmap:1337 opus/48000/2\na=rtpmap:0 PCMU/8000\na=fmtp:0\na=fmtp:1337 maxaveragebitrate=12000'};
    return mediaStream;
  };

  const StatsMonitor: any = () => monitor = createEmitterStub(require('../../lib/twilio/statsMonitor').default);

  afterEach(() => {
    clock.restore();
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());

    audioHelper = createEmitterStub(require('../../lib/twilio/audiohelper').default);
    getUserMedia = sinon.spy(() => Promise.resolve(new MediaStream()));
    pstream = createEmitterStub(require('../../lib/twilio/pstream'));
    publisher = createEmitterStub(require('../../lib/twilio/eventpublisher'));
    publisher.postMetrics = sinon.spy(() => Promise.resolve());

    pstream.transport = {
      on: sinon.stub()
    };

    soundcache = new Map()
    Object.values(Device.SoundName).forEach((soundName: Device.SoundName) => {
      soundcache.set(soundName, { play: sinon.spy() });
    });

    config = {
      audioHelper,
      getUserMedia,
      isUnifiedPlanDefault: false,
      publisher,
      pstream,
      soundcache,
    };

    options = {
      MediaStream: MediaHandler,
      StatsMonitor,
      enableIceRestart: true,
    };

    conn = new Connection(config, options);
  });

  describe('constructor', () => {
    it('should set .parameters to options.callParameters', () => {
      const callParameters = { foo: 'bar' };
      conn = new Connection(config, Object.assign(options, { callParameters }));
      assert.equal(conn.parameters, callParameters);
    });

    it('should convert options.twimlParams to .customParameters as a Map<string, string>', () => {
      conn = new Connection(config, Object.assign(options, { twimlParams: {
        foo: 'bar',
        baz: 123,
      }}));
      assert.equal(conn.customParameters.get('foo'), 'bar');
      assert.equal(conn.customParameters.get('baz'), 123);
    });

    context('when incoming', () => {
      it('should populate the .callerInfo fields appropriately when StirStatus is A', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-Validation-Passed-A',
          CallSid: 'CA123',
          From: '929-321-2323',
        }}));
        let callerInfo: Connection.CallerInfo;
        if (conn.callerInfo !== null) {
          callerInfo = conn.callerInfo;
          assert.equal(callerInfo.isVerified, true);
        } else {
          throw Error('callerInfo object null, but expected to be populated');
        }
      });

      it('should populate the .callerInfo fields appropriately when StirStatus is B', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-Validation-Passed-B',
          CallSid: 'CA123',
          From: '1-929-321-2323',
        }}));
        let callerInfo: Connection.CallerInfo;
        if (conn.callerInfo !== null) {
          callerInfo = conn.callerInfo;
          assert.equal(callerInfo.isVerified, false);
        } else {
          throw Error('callerInfo object null, but expected to be populated');
        }
      });

      it('should populate the .callerInfo fields appropriately when StirStatus is C', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-Validation-Passed-C',
          CallSid: 'CA123',
          From: '1 (929) 321-2323',
        }}));
        let callerInfo: Connection.CallerInfo;
        if (conn.callerInfo !== null) {
          callerInfo = conn.callerInfo;
          assert.equal(callerInfo.isVerified, false);
        } else {
          throw Error('callerInfo object null, but expected to be populated');
        }
      });

      it('should populate the .callerInfo fields appropriately when StirStatus is failed-A', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-Validation-Failed-A',
          CallSid: 'CA123',
          From: '1 (929) 321 2323',
        }}));
        let callerInfo: Connection.CallerInfo;
        if (conn.callerInfo !== null) {
          callerInfo = conn.callerInfo;
          assert.equal(callerInfo.isVerified, false);
        } else {
          throw Error('callerInfo object null, but expected to be populated');
        }
      });

      it('should populate the .callerInfo fields appropriately when StirStatus is failed-B', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-Validation-Failed-B',
          CallSid: 'CA123',
          From: '1 929 321 2323',
        }}));
        let callerInfo: Connection.CallerInfo;
        if (conn.callerInfo !== null) {
          callerInfo = conn.callerInfo;
          assert.equal(callerInfo.isVerified, false);
        } else {
          throw Error('callerInfo object null, but expected to be populated');
        }
      });

      it('should populate the .callerInfo fields appropriately when StirStatus is failed-C', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-Validation-Failed-C',
          CallSid: 'CA123',
          From: '19293212323',
        }}));
        let callerInfo: Connection.CallerInfo;
        if (conn.callerInfo !== null) {
          callerInfo = conn.callerInfo;
          assert.equal(callerInfo.isVerified, false);
        } else {
          throw Error('callerInfo object null, but expected to be populated');
        }
      });

      it('should populate the .callerInfo fields appropriately when StirStatus is no-validation', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-No-Validation',
          CallSid: 'CA123',
          From: '+19293212323',
        }}));
        let callerInfo: Connection.CallerInfo;
        if (conn.callerInfo !== null) {
          callerInfo = conn.callerInfo;
          assert.equal(callerInfo.isVerified, false);
        } else {
          throw Error('callerInfo object null, but expected to be populated');
        }
      });

      it('should set .callerInfo to null when StirStatus is undefined', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          CallSid: 'CA123',
          From: '19293212323',
        }}));
        assert.equal(conn.callerInfo, null);
      });

      describe('when From is not a number', () => {
        it('should populate the .callerInfo fields appropriately when StirStatus is A', () => {
          conn = new Connection(config, Object.assign(options, { callParameters: {
            StirStatus: 'TN-Validation-Passed-A',
            CallSid: 'CA123',
            From: 'client:alice',
          }}));
          let callerInfo: Connection.CallerInfo;
          if (conn.callerInfo !== null) {
            callerInfo = conn.callerInfo;
            assert.equal(callerInfo.isVerified, true);
          } else {
            throw Error('callerInfo object null, but expected to be populated');
          }
        });

        it('should populate the .callerInfo fields appropriately when StirStatus is failed-A', () => {
          conn = new Connection(config, Object.assign(options, { callParameters: {
            StirStatus: 'TN-Validation-Failed-A',
            CallSid: 'CA123',
            From: 'client:alice',
          }}));
          let callerInfo: Connection.CallerInfo;
          if (conn.callerInfo !== null) {
            callerInfo = conn.callerInfo;
            assert.equal(callerInfo.isVerified, false);
          } else {
            throw Error('callerInfo object null, but expected to be populated');
          }
        });
      });

      describe('when additional parameters are supplied', () => {
        it('should populate the .callerInfo fields appropriately when DisplayName is supplied', () => {
          conn = new Connection(config, Object.assign(options, { callParameters: {
            StirStatus: 'TN-Validation-Passed-A',
            CallSid: 'CA123',
            From: 'client:alice',
            DisplayName: 'foo bar baz',
          }}));
          let callerInfo: Connection.CallerInfo;
          if (conn.callerInfo !== null) {
            callerInfo = conn.callerInfo;
            assert.equal(callerInfo.isVerified, true);
          } else {
            throw Error('callerInfo object null, but expected to be populated');
          }
        });

        it('should populate the .callerInfo fields appropriately when a long string is supplied', () => {
          conn = new Connection(config, Object.assign(options, { callParameters: {
            StirStatus: 'TN-Validation-Passed-A',
            CallSid: 'CA123',
            From: 'client:alice',
            DisplayName: Array(100).fill('foo bar baz').join(','),
          }}));
          let callerInfo: Connection.CallerInfo;
          if (conn.callerInfo !== null) {
            callerInfo = conn.callerInfo;
            assert.equal(callerInfo.isVerified, true);
          } else {
            throw Error('callerInfo object null, but expected to be populated');
          }
        });
      });
    });

    context('when outgoing', () => {
      it('should not populate the .callerInfo fields, instead return null', () => {
        conn = new Connection(config, Object.assign(options, { callParameters: {
          StirStatus: 'TN-Validation-Passed-A',
        }}));
        assert.equal(conn.callerInfo, null);
      });
    });

    it('should set .direction to CallDirection.Outgoing if there is no CallSid', () => {
      const callParameters = { foo: 'bar' };
      conn = new Connection(config, Object.assign(options, { callParameters }));
      assert.equal(conn.direction, Connection.CallDirection.Outgoing);
    });

    it('should set .direction to CallDirection.Incoming if there is a CallSid', () => {
      const callParameters = { CallSid: 'CA1234' };
      conn = new Connection(config, Object.assign(options, { callParameters }));
      assert.equal(conn.direction, Connection.CallDirection.Incoming);
    });

    it('should disable monitor warnings', () => {
      sinon.assert.calledOnce(monitor.disableWarnings);
    });

    it('should enable monitor warnings after 5000 ms', () => {
      clock.tick(5000 - 10);
      sinon.assert.notCalled(monitor.enableWarnings);
      clock.tick(20);
      sinon.assert.calledOnce(monitor.enableWarnings);
    });
  });

  describe('_getRealCallSid', () => {
    it('should return null if CallSid is temporary', () => {
      conn = new Connection(config, Object.assign({
        callParameters: { CallSid: 'TJ123' }
      }, options));

      assert.equal(conn._getRealCallSid(), null);
    });

    it('should return the callsid if it does not begin with TJ', () => {
      conn = new Connection(config, Object.assign({
        callParameters: { CallSid: 'CA123' }
      }, options));

      assert.equal(conn._getRealCallSid(), 'CA123');
    });
  });

  describe('_getTempCallSid', () => {
    it('should return connection.outboundConnectionId', () => {
      assert.equal(conn._getTempCallSid(), conn.outboundConnectionId);
    });
  });

  describe('deprecated handler methods', () => {
    ['accept', 'cancel', 'disconnect', 'error', 'mute', 'reject', 'volume'].forEach((eventName: string) => {
      it(`should set an event listener on Connection for .${eventName}(handler)`, () => {
        const handler = () => { };
        (conn as any).removeAllListeners(eventName);
        (conn as any)[eventName](handler);
        assert.equal(conn.listenerCount(eventName), 1);
        assert.equal(conn.listeners(eventName)[0], handler);
        conn.removeListener(eventName, handler);
      });
    });

    it(`should set an event listener on Connection for .ignore(handler)`, () => {
      const handler = () => { };
      (conn as any).removeAllListeners('cancel');
      (conn as any)['ignore'](handler);
      assert.equal(conn.listenerCount('cancel'), 1);
      assert.equal(conn.listeners('cancel')[0], handler);
      conn.removeListener('cancel', handler);
    });
  });

  describe('.accept', () => {
    [
      Connection.State.Open,
      Connection.State.Connecting,
      Connection.State.Ringing,
      Connection.State.Closed,
    ].forEach((state: Connection.State) => {
      context(`when state is ${state}`, () => {
        beforeEach(() => {
          (conn as any)['_status'] = state;
        });

        it('should not transition state', () => {
          conn.accept();
          assert.equal(conn.status(), state);
        });

        it('should not call mediaStream.openWithConstraints', () => {
          conn.accept();
          sinon.assert.notCalled(mediaStream.openWithConstraints);
        });
      });
    });

    it('should transition state to Connecting', () => {
      conn.accept();
      assert.equal(conn.status(), Connection.State.Connecting);
    });

    context('when getInputStream is not present', () => {
      it('should call mediaStream.openWithConstraints with audioConstraints if passed', () => {
        conn.accept({ foo: 'bar' } as MediaTrackConstraints);
        sinon.assert.calledWith(mediaStream.openWithConstraints, { foo: 'bar' });
      });

      it('should call mediaStream.openWithConstraints with options.audioConstraints if no args', () => {
        Object.assign(options, { audioConstraints: { bar: 'baz' } });
        conn = new Connection(config, options);
        conn.accept();
        sinon.assert.calledWith(mediaStream.openWithConstraints, { bar: 'baz' });
      });

      it('should result in a `denied` error when `getUserMedia` does not allow the application to access the media', () => {
        return new Promise(resolve => {
          mediaStream.openWithConstraints = () => {
            const p = Promise.reject({
              code: 0,
              name: 'NotAllowedError',
              message: 'Permission denied',
            });
            p.catch(() => resolve());
            return p;
          }

          conn.accept();
        }).then(() => {
          sinon.assert.calledWith(publisher.error, 'get-user-media', 'denied');
        });
      });
    });

    context('when getInputStream is present and succeeds', () => {
      let getInputStream;
      let wait: Promise<any>;

      beforeEach(() => {
        getInputStream = sinon.spy(() => 'foo');
        Object.assign(options, { getInputStream });
        conn = new Connection(config, options);

        mediaStream.setInputTracksFromStream = sinon.spy(() => {
          const p = Promise.resolve();
          wait = p.then(() => Promise.resolve());
          return p;
        });
      });

      it('should call mediaStream.setInputTracksFromStream', () => {
        conn.accept();
        sinon.assert.calledWith(mediaStream.setInputTracksFromStream, 'foo');
      });

      it('should publish a get-user-media succeeded event', () => {
        conn.accept();
        return wait.then(() => {
          sinon.assert.calledWith(publisher.info, 'get-user-media', 'succeeded');
        });
      });

      context('when incoming', () => {
        beforeEach(() => {
          getInputStream = sinon.spy(() => 'foo');
          Object.assign(options, {
            getInputStream,
            callParameters: { CallSid: 'CA123' },
            rtcConfiguration: {
              foo: 'bar',
              sdpSemantics: 'unified-plan',
            },
          });
          conn = new Connection(config, options);

          mediaStream.setInputTracksFromStream = sinon.spy(() => {
            const p = Promise.resolve();
            wait = p.then(() => Promise.resolve());
            return p;
          });
        });

        it('should call mediaStream.answerIncomingCall', () => {
          conn.accept();
          return wait.then(() => {
            sinon.assert.calledOnce(mediaStream.answerIncomingCall);
          });
        });

        context('when the success callback is called', () => {
          it('should publish an accepted-by-local event', () => {
            conn.accept();
            return wait.then(() => {
              callback('foo');
              sinon.assert.calledWith(publisher.info, 'connection', 'accepted-by-local');
            });
          });

          it('should publish a settings:codec event', () => {
            conn.accept();
            return wait.then(() => {
              callback('foo');
              sinon.assert.calledWith(publisher.info, 'settings', 'codec', {
                codec_params: 'maxaveragebitrate=12000',
                selected_codec: 'opus/48000/2',
              });
            });
          });

          it('should call monitor.enable', () => {
            conn.accept();
            return wait.then(() => {
              callback('foo');
              sinon.assert.calledWith(monitor.enable, 'foo');
            });
          });
        });
      });

      context('when outgoing', () => {
        let callback: Function;

        beforeEach(() => {
          getInputStream = sinon.spy(() => 'foo');
          Object.assign(options, { getInputStream });
          options.twimlParams = {
            To: 'foo',
            a: undefined,
            b: true,
            c: false,
            d: '',
            e: 123,
            f: '123',
            g: null,
            h: 'undefined',
            i: 'null',
            j: 0,
            k: '0',
            l: 'a$b&c?d=e',
          };
          conn = new Connection(config, options);

          mediaStream.setInputTracksFromStream = sinon.spy(() => {
            const p = Promise.resolve();
            wait = p.then(() => Promise.resolve());
            return p;
          });

          mediaStream.makeOutgoingCall = sinon.spy((a: any, b: any, c: any, d: any, e: any, _callback: Function) => {
            callback = _callback;
          });
        });

        it('should call mediaStream.makeOutgoingCall with correctly encoded params', () => {
          conn.accept();
          return wait.then(() => {
            sinon.assert.calledOnce(mediaStream.makeOutgoingCall);
            assert.equal(mediaStream.makeOutgoingCall.args[0][1],
              'To=foo&a=undefined&b=true&c=false&d=&e=123&f=123&g=null&h=undefined&i=null&j=0&k=0&l=a%24b%26c%3Fd%3De');
          });
        });

        context('when the success callback is called', () => {
          it('should publish an accepted-by-remote event', () => {
            conn.accept();
            return wait.then(() => {
              callback('foo');
              sinon.assert.calledWith(publisher.info, 'connection', 'accepted-by-remote');
            });
          });

          it('should publish a settings:codec event', () => {
            conn.accept();
            return wait.then(() => {
              callback('foo');
              sinon.assert.calledWith(publisher.info, 'settings', 'codec', {
                codec_params: 'maxaveragebitrate=12000',
                selected_codec: 'opus/48000/2',
              });
            });
          });

          it('should call monitor.enable', () => {
            conn.accept();
            return wait.then(() => {
              callback('foo');
              sinon.assert.calledWith(monitor.enable, 'foo');
            });
          });
        });
      });

      context('if connection state transitions before connect finishes', () => {
        beforeEach(() => {
          mediaStream.setInputTracksFromStream = sinon.spy(() => {
            (conn as any)['_status'] = Connection.State.Closed;
            const p = Promise.resolve();
            wait = p.then(() => Promise.resolve());
            return p;
          });
        });

        it('should call mediaStream.close', () => {
          conn.accept();
          return wait.then(() => {
            sinon.assert.calledOnce(mediaStream.close);
          });
        });

        it('should not set a pstream listener for hangup', () => {
          pstream.addListener = sinon.spy();
          conn.accept();
          return wait.then(() => {
            sinon.assert.notCalled(pstream.addListener);
          });
        });
      });
    });

    context('when getInputStream is present and fails with 31208', () => {
      let getInputStream: () => any;
      let wait: Promise<any>;

      beforeEach(() => {
        getInputStream = sinon.spy(() => 'foo');

        Object.assign(options, { getInputStream });
        conn = new Connection(config, options);

        mediaStream.setInputTracksFromStream = sinon.spy(() => {
          const p = Promise.reject({ code: 31208 });
          wait = p.catch(() => Promise.resolve());
          return p;
        });
      });

      it('should publish a get-user-media denied error', () => {
        conn.accept({ foo: 'bar' } as MediaTrackConstraints);
        return wait.then(() => {
          sinon.assert.calledWith(publisher.error, 'get-user-media', 'denied');
        });
      });
    });

    context('when getInputStream is present and fails without 31208', () => {
      let getInputStream: () => any;
      let wait: Promise<any>;

      beforeEach(() => {
        getInputStream = sinon.spy(() => 'foo');

        Object.assign(options, { getInputStream });
        conn = new Connection(config, options);

        mediaStream.setInputTracksFromStream = sinon.spy(() => {
          const p = Promise.reject({ });
          wait = p.catch(() => Promise.resolve());
          return p;
        });
      });

      it('should publish a get-user-media failed error', () => {
        conn.accept({ foo: 'bar' } as MediaTrackConstraints);
        return wait.then(() => {
          sinon.assert.calledWith(publisher.error, 'get-user-media', 'failed');
        });
      });
    });
  });

  describe('.cancel()', () => {
    it('should call .ignore()', () => {
      conn.ignore = sinon.spy();
      conn.cancel();
      sinon.assert.calledOnce(conn.ignore as SinonSpy);
    });
  });

  describe('.disconnect()', () => {
    [
      Connection.State.Open,
      Connection.State.Connecting,
      Connection.State.Ringing,
    ].forEach((state: Connection.State) => {
      context(`when state is ${state}`, () => {
        beforeEach(() => {
          (conn as any)['_status'] = state;
        });

        it('should call pstream.hangup', () => {
          conn.disconnect();
          sinon.assert.calledWith(pstream.hangup, conn.outboundConnectionId);
        });

        it('should call mediaStream.close', () => {
          conn.disconnect();
          sinon.assert.calledOnce(mediaStream.close);
        });
      });
    });

    [
      Connection.State.Pending,
      Connection.State.Closed,
    ].forEach((state: Connection.State) => {
      context(`when state is ${state}`, () => {
        beforeEach(() => {
          (conn as any)['_status'] = state;
        });

        it('should not call pstream.hangup', () => {
          conn.disconnect();
          sinon.assert.notCalled(pstream.hangup);
        });

        it('should not call mediaStream.close', () => {
          conn.disconnect();
          sinon.assert.notCalled(mediaStream.close);
        });
      });
    });
  });

  describe('.getLocalStream()', () => {
    it('should get the local MediaStream from the MediaHandler', () => {
      assert.equal(conn.getLocalStream(), mediaStream.stream);
    });
  });

  describe('.getRemoteStream()', () => {
    it('should get the local MediaStream from the MediaHandler', () => {
      assert.equal(conn.getRemoteStream(), mediaStream._remoteStream);
    });
  });

  describe('.ignore()', () => {
    context('when state is pending', () => {
      it('should call mediaStream.ignore', () => {
        conn.ignore();
        sinon.assert.calledOnce(mediaStream.ignore);
      });

      it('should emit cancel', (done) => {
        conn.on('cancel', () => done());
        conn.ignore();
      });

      it('should transition state to closed', () => {
        conn.ignore();
        assert.equal(conn.status(), Connection.State.Closed);
      });

      it('should publish an event to insights', () => {
        conn.ignore();
        sinon.assert.calledWith(publisher.info, 'connection', 'ignored-by-local');
      });
    });

    [
      Connection.State.Closed,
      Connection.State.Connecting,
      Connection.State.Open,
      Connection.State.Ringing,
    ].forEach((state: Connection.State) => {
      context(`when connection state is ${state}`, () => {
        beforeEach(() => {
          (conn as any)['_status'] = state;
        });

        it('should not call mediaStream.ignore', () => {
          conn.ignore();
          sinon.assert.notCalled(mediaStream.ignore);
        });

        it('should not emit cancel', () => {
          conn.on('cancel', () => { throw new Error('Should not have emitted cancel'); });
          conn.ignore();
        });

        it('should not transition state to closed', () => {
          conn.ignore();
          assert.equal(conn.status(), state);
        });

        it('should not publish an event to insights', () => {
          conn.ignore();
          sinon.assert.notCalled(publisher.info);
        });
      });
    });
  });

  describe('.isMuted()', () => {
    it('should return isMuted from MediaHandler', () => {
      assert.equal(conn.isMuted(), mediaStream.isMuted);
    });
  });

  describe('.mute()', () => {
    context('when mediaStream.isMuted was previously true', () => {
      beforeEach(() => {
        mediaStream.isMuted = true;
      });

      [true, undefined].forEach((value?: boolean) => {
        context(`when ${value}`, () => {
          it('should call mediaStream.mute()', () => {
            conn.mute(value);
            sinon.assert.calledOnce(mediaStream.mute);
            sinon.assert.calledWith(mediaStream.mute, true);
          });

          it('should not call publisher.info', () => {
            conn.mute(value);
            sinon.assert.notCalled(publisher.info);
          });

          it('should not emit mute', () => {
            conn.on('mute', () => { throw new Error('Expected mute to not be emitted'); });
            conn.mute(value);
          });
        });
      });

      context(`when false`, () => {
        it('should call mediaStream.mute()', () => {
          conn.mute(false);
          sinon.assert.calledOnce(mediaStream.mute);
          sinon.assert.calledWith(mediaStream.mute, false);
        });

        it('should call publisher.info', () => {
          conn.mute(false);
          sinon.assert.calledWith(publisher.info, 'connection', 'unmuted');
        });

        it('should emit mute', (done) => {
          conn.on('mute', () => done());
          conn.mute(false);
        });
      });
    });

    context('when mediaStream.isMuted was previously false', () => {
      beforeEach(() => {
        mediaStream.isMuted = false;
      });

      [true, undefined].forEach((value?: boolean) => {
        context(`when ${value}`, () => {
          it('should call mediaStream.mute()', () => {
            conn.mute(value);
            sinon.assert.calledOnce(mediaStream.mute);
            sinon.assert.calledWith(mediaStream.mute, true);
          });
        });

        it('should call publisher.info', () => {
          conn.mute(value);
          sinon.assert.calledWith(publisher.info, 'connection', 'muted');
        });

        it('should emit mute', (done) => {
          conn.on('mute', () => done());
          conn.mute(value);
        });
      });

      context(`when false`, () => {
        it('should call mediaStream.mute()', () => {
          conn.mute(false);
          sinon.assert.calledOnce(mediaStream.mute);
          sinon.assert.calledWith(mediaStream.mute, false);
        });

        it('should not call publisher.info', () => {
          conn.mute(false);
          sinon.assert.notCalled(publisher.info);
        });

        it('should not emit mute', () => {
          conn.on('mute', () => { throw new Error('Expected mute to not be emitted'); });
          conn.mute(false);
        });
      });
    });
  });

  describe('.reject()', () => {
    context('when state is pending', () => {
      it('should call pstream.reject', () => {
        conn.reject();
        sinon.assert.calledOnce(pstream.reject);
        sinon.assert.calledWith(pstream.reject, conn.parameters.CallSid);
      });

      it('should call mediaStream.reject', () => {
        conn.reject();
        sinon.assert.calledOnce(mediaStream.reject);
      });

      it('should emit cancel', (done) => {
        conn.on('reject', () => done());
        conn.reject();
      });

      it('should publish an event to insights', () => {
        conn.reject();
        sinon.assert.calledWith(publisher.info, 'connection', 'rejected-by-local');
      });

      it('should transition status to closed', () => {
        conn.reject();
        assert.equal(conn.status(), 'closed');
      });
    });

    [
      Connection.State.Closed,
      Connection.State.Connecting,
      Connection.State.Open,
      Connection.State.Ringing,
    ].forEach((state: Connection.State) => {
      context(`when connection state is ${state}`, () => {
        beforeEach(() => {
          (conn as any)['_status'] = state;
        });

        it('should not call pstream.reject', () => {
          conn.reject();
          sinon.assert.notCalled(pstream.reject);
        });

        it('should not call mediaStream.reject', () => {
          conn.reject();
          sinon.assert.notCalled(mediaStream.reject);
        });

        it('should not emit reject', () => {
          conn.on('reject', () => { throw new Error('Should not have emitted reject'); });
          conn.reject();
        });

        it('should not publish an event to insights', () => {
          conn.reject();
          sinon.assert.notCalled(publisher.info);
        });
      });
    });
  });

  describe('.postFeedback()', () => {
    it('should call publisher.info with feedback received-none when called with no arguments', () => {
      conn.postFeedback();
      sinon.assert.calledWith(publisher.info, 'feedback', 'received-none');
    });

    Object.values(Connection.FeedbackScore).forEach((score: Connection.FeedbackScore) => {
      Object.values(Connection.FeedbackIssue).forEach((issue: Connection.FeedbackIssue) => {
        it(`should call publisher.info with feedback received-none when called with ${score} and ${issue}`, () => {
          conn.postFeedback(score, issue);
          sinon.assert.calledWith(publisher.info, 'feedback', 'received', {
            issue_name: issue,
            quality_score: score,
          });
        });
      });
    });

    it('should throw if score is invalid', () => {
      assert.throws(() => { (conn as any)['postFeedback'](0); });
    });

    it('should throw if issue is invalid', () => {
      assert.throws(() => { (conn as any)['postFeedback'](Connection.FeedbackScore.Five, 'foo'); });
    });
  });

  describe('.sendDigits()', () => {
    context('when digit string is invalid', () => {
      [
        'foo',
        '87309870934z',
        '09-823-',
        'ABC',
        '9 9',
      ].forEach((digits: string) => {
        it(`should throw on '${digits}'`, () => {
          assert.throws(() => conn.sendDigits(digits));
        });
      });
    });

    context('when digit string is valid', () => {
      [
        '12345',
        '1w2w3w',
        '*#*#*#',
        '1#*w23####0099',
      ].forEach((digits: string) => {
        it(`should not throw on '${digits}'`, () => {
          conn.sendDigits(digits);
        });
      });
    });

    it('should call dtmfSender.insertDTMF for each segment', () => {
      const sender = { insertDTMF: sinon.spy() };
      mediaStream.getOrCreateDTMFSender = () => sender;
      conn.sendDigits('123w456w#*');
      clock.tick(1 + 500 * 3);
      sinon.assert.callCount(sender.insertDTMF, 3);
    });

    it('should play the sound for each letter', () => {
      const sender = { insertDTMF: sinon.spy() };
      mediaStream.getOrCreateDTMFSender = () => sender;
      conn.sendDigits('123w456w#*w');

      clock.tick(1 + 200);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf1).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf2).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf3).play, 0);

      clock.tick(1 + (200 * 7) + (500 * 3));
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf1).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf2).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf3).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf4).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf5).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.Dtmf6).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.DtmfS).play, 1);
      sinon.assert.callCount(soundcache.get(Device.SoundName.DtmfH).play, 1);
    });

    it('should call pstream.dtmf if connected', () => {
      conn.sendDigits('123');
      sinon.assert.calledWith(pstream.dtmf, conn.parameters.CallSid, '123');
    });

    it('should emit error if pstream is disconnected', (done) => {
      pstream.status = 'disconnected';
      conn.on('error', () => done());
      conn.sendDigits('123');
    });
  });

  describe('.unmute()', () => {
    it('should call .mute(false)', () => {
      conn.mute = sinon.spy();
      conn.unmute();
      sinon.assert.calledWith(conn.mute as SinonSpy, false);
    });
  });

  context('in response to', () => {
    describe('mediaStream.onvolume', () => {
      it('should emit volume', (done) => {
        conn.on('volume', (input, output) => {
          assert.equal(input, 123);
          assert.equal(output, 456);
          done();
        });

        mediaStream.onvolume(123, 456);
      });
    });

    describe('mediaStream.onicecandidate', () => {
      it('should publish a debug event', () => {
        mediaStream.onicecandidate({ candidate: 'foo' });
        sinon.assert.calledWith(publisher.debug, 'ice-candidate', 'ice-candidate');
      });
    });

    describe('mediaStream.onselectedcandidatepairchange', () => {
      it('should publish a debug event', () => {
        mediaStream.onselectedcandidatepairchange({
          local: { candidate: 'foo' },
          remote: { candidate: 'bar' },
        });
        sinon.assert.calledWith(publisher.debug, 'ice-candidate', 'selected-ice-candidate-pair');
      });
    });

    describe('mediaStream.onpcconnectionstatechange', () => {
      it('should publish an warning event if state is failed', () => {
        mediaStream.onpcconnectionstatechange('failed');
        sinon.assert.calledWith(publisher.post, 'warning', 'pc-connection-state', 'failed');
      });

      it('should publish a debug event if state is not failed', () => {
        mediaStream.onpcconnectionstatechange('foo');
        sinon.assert.calledWith(publisher.post, 'debug', 'pc-connection-state', 'foo');
      });
    });

    describe('mediaStream.ondtlstransportstatechange', () => {
      it('should publish an error event if state is failed', () => {
        mediaStream.ondtlstransportstatechange('failed');
        sinon.assert.calledWith(publisher.post, 'error', 'dtls-transport-state', 'failed');
      });

      it('should publish a debug event if state is not failed', () => {
        mediaStream.ondtlstransportstatechange('foo');
        sinon.assert.calledWith(publisher.post, 'debug', 'dtls-transport-state', 'foo');
      });
    });

    describe('mediaStream.oniceconnectionstatechange', () => {
      it('should publish an error event if state is failed', () => {
        mediaStream.oniceconnectionstatechange('failed');
        sinon.assert.calledWith(publisher.post, 'error', 'ice-connection-state', 'failed');
      });

      it('should publish a debug event if state is not failed', () => {
        mediaStream.oniceconnectionstatechange('foo');
        sinon.assert.calledWith(publisher.post, 'debug', 'ice-connection-state', 'foo');
      });
    });

    describe('mediaStream.onicegatheringstatechange', () => {
      it('should publish a debug event: ice-gathering-state', () => {
        mediaStream.onicegatheringstatechange('foo');
        sinon.assert.calledWith(publisher.debug, 'ice-gathering-state', 'foo');
      });
    });

    describe('mediaStream.onsignalingstatechange', () => {
      it('should publish a debug event: signaling-state', () => {
        mediaStream.onsignalingstatechange('foo');
        sinon.assert.calledWith(publisher.debug, 'signaling-state', 'foo');
      });
    });

    describe('mediaStream.ondisconnected', () => {
      it('should publish a warning event: ice-connectivity-lost', () => {
        mediaStream.ondisconnected('foo');
        sinon.assert.calledWith(publisher.warn, 'network-quality-warning-raised',
          'ice-connectivity-lost', { message: 'foo' });
      });

      it('should emit a warning event', (done) => {
        conn.on('warning', (warningName) => {
          assert.equal(warningName, 'ice-connectivity-lost');
          done();
        });

        mediaStream.ondisconnected('foo');
      });
    });

    describe('mediaStream.onreconnected', () => {
      it('should publish an info event: ice-connectivity-lost', () => {
        mediaStream.onreconnected('foo');
        sinon.assert.calledWith(publisher.info, 'network-quality-warning-cleared',
          'ice-connectivity-lost', { message: 'foo' });
      });

      it('should emit a warning-cleared event', (done) => {
        conn.on('warning-cleared', (warningName) => {
          assert.equal(warningName, 'ice-connectivity-lost');
          done();
        });

        mediaStream.onreconnected('foo');
      });
    });

    describe('mediaStream.onerror', () => {
      const baseError = { info: { code: 123, message: 'foo', twilioError: 'bar' } };

      it('should emit an error event', (done) => {
        conn.on('error', (error) => {
          assert.deepEqual(error, {
            code: 123,
            connection: conn,
            info: baseError.info,
            message: 'foo',
            twilioError: 'bar'
          });

          done();
        });

        mediaStream.onerror(baseError);
      });

      context('when error.disconnect is true', () => {
        [
          Connection.State.Open,
          Connection.State.Connecting,
          Connection.State.Ringing,
        ].forEach((state: Connection.State) => {
          context(`and state is ${state}`, () => {
            beforeEach(() => {
              (conn as any)['_status'] = state;
            });

            it('should call pstream.hangup with error message', () => {
              mediaStream.onerror(Object.assign({ disconnect: true }, baseError));
              sinon.assert.calledWith(pstream.hangup, conn.outboundConnectionId, 'foo');
            });

            it('should call mediaStream.close', () => {
              mediaStream.onerror(Object.assign({ disconnect: true }, baseError));
              sinon.assert.calledOnce(mediaStream.close);
            });
          });
        });

        [
          Connection.State.Pending,
          Connection.State.Closed,
        ].forEach((state: Connection.State) => {
          context(`and state is ${state}`, () => {
            beforeEach(() => {
              (conn as any)['_status'] = state;
            });

            it('should not call pstream.hangup', () => {
              mediaStream.onerror(Object.assign({ disconnect: true }, baseError));
              sinon.assert.notCalled(pstream.hangup);
            });

            it('should not call mediaStream.close', () => {
              mediaStream.onerror(Object.assign({ disconnect: true }, baseError));
              sinon.assert.notCalled(mediaStream.close);
            });
          });
        });
      });
    });

    describe('mediaStream.onopen', () => {
      context('when state is open', () => {
        beforeEach(() => {
          (conn as any)['_status'] = Connection.State.Open;
        });

        it(`should not call mediaStream.close`, () => {
          mediaStream.onopen();
          sinon.assert.notCalled(mediaStream.close);
        });

        it(`should not call connection.mute(false)`, () => {
          conn.mute = sinon.spy();
          mediaStream.onopen();
          sinon.assert.notCalled(conn.mute as SinonSpy);
        });
      });

      [
        Connection.State.Ringing,
        Connection.State.Connecting,
      ].forEach((state: Connection.State) => {
        context(`when state is ${state}`, () => {
          beforeEach(() => {
            (conn as any)['_status'] = state;
          });

          it(`should not call mediaStream.close`, () => {
            mediaStream.onopen();
            sinon.assert.notCalled(mediaStream.close);
          });

          it(`should call connection.mute(false)`, () => {
            conn.mute = sinon.spy();
            mediaStream.onopen();
            sinon.assert.calledWith(conn.mute as SinonSpy, false);
          });

          context('when this connection is answered', () => {
            beforeEach(() => {
              mediaStream.status = 'open';
              conn['_isAnswered'] = true;
            });

            it('should emit Connection.accept event', (done) => {
              conn.on('accept', () => done());
              mediaStream.onopen();
            });

            it('should transition to open', () => {
              mediaStream.onopen();
              assert.equal(conn.status(), Connection.State.Open);
            });
          });

          context('when this connection is not answered', () => {
            beforeEach(() => {
              mediaStream.status = 'open';
            });

            it('should not emit Connection.accept event', () => {
              conn.on('accept', () => { throw new Error('Expected to not emit accept event'); });
              mediaStream.onopen();
              clock.tick(1);
            });

            it('should not transition to open', () => {
              mediaStream.onopen();
              assert.equal(conn.status(), state);
            });
          });
        });
      });

      [
        Connection.State.Pending,
        Connection.State.Closed,
      ].forEach((state: Connection.State) => {
        context(`when state is ${state}`, () => {
          beforeEach(() => {
            (conn as any)['_status'] = state;
          });

          it(`should call mediaStream.close`, () => {
            mediaStream.onopen();
            sinon.assert.calledOnce(mediaStream.close);
          });

          it(`should not call connection.mute(false)`, () => {
            conn.mute = sinon.spy();
            mediaStream.onopen();
            sinon.assert.notCalled(conn.mute as SinonSpy);
          });
        });
      });
    });

    describe('mediaStream.onclose', () => {
      it('should transition to closed', () => {
        mediaStream.onclose();
        assert.equal(conn.status(), Connection.State.Closed);
      });

      it('should call monitor.disable', () => {
        mediaStream.onclose();
        sinon.assert.calledOnce(monitor.disable);
      });

      it('should emit a disconnect event', (done) => {
        conn.on('disconnect', (connection) => {
          assert.equal(conn, connection);
          done();
        });

        mediaStream.onclose();
      });

      it('should play the disconnect ringtone if shouldPlayDisconnect is not specified', () => {
        mediaStream.onclose();
        sinon.assert.calledOnce(soundcache.get(Device.SoundName.Disconnect).play);
      });

      it('should play the disconnect ringtone if shouldPlayDisconnect returns true', () => {
        conn = new Connection(config, Object.assign({ shouldPlayDisconnect: () => true }, options));
        mediaStream.onclose();
        sinon.assert.calledOnce(soundcache.get(Device.SoundName.Disconnect).play);
      });

      it('should not play the disconnect ringtone if shouldPlayDisconnect returns false', () => {
        conn = new Connection(config, Object.assign({ shouldPlayDisconnect: () => false }, options));
        mediaStream.onclose();
        sinon.assert.notCalled(soundcache.get(Device.SoundName.Disconnect).play);
      });
    });

    describe('pstream.transportClose event', () => {
      it('should re-emit transportClose event', () => {
        const callback = sinon.stub();
        conn = new Connection(config, Object.assign({
          callParameters: { CallSid: 'CA123' }
        }, options));

        conn.on('transportClose', callback);
        pstream.emit('transportClose');

        assert(callback.calledOnce);
      });
    });

    describe('pstream.cancel event', () => {
      const wait = (timeout?: number) => new Promise(r => {
        setTimeout(r, timeout || 0);
        clock.tick(0);
      });

      let conn: any;
      let cleanupStub: any;
      let closeStub: any;
      let publishStub: any;

      beforeEach(() => {
        cleanupStub = sinon.stub();
        closeStub = sinon.stub();
        publishStub = sinon.stub();

        conn = new Connection(config, Object.assign({
          callParameters: { CallSid: 'CA123' }
        }, options));

        conn._cleanupEventListeners = cleanupStub;
        conn.mediaStream.close = () => {
          closeStub();
          conn.emit('disconnect');
        };
        conn._publisher = {
          info: publishStub
        };
      });

      context('when the callsid matches', () => {
        it('should transition to closed', () => {
          pstream.emit('cancel', { callsid: 'CA123' });
          assert.equal(conn.status(), Connection.State.Closed);
        });

        it('should emit a cancel event', (done) => {
          conn.on('cancel', () => done());
          pstream.emit('cancel', { callsid: 'CA123' });
        });

        it('should disconnect the call', () => {
          pstream.emit('cancel', { callsid: 'CA123' });
          sinon.assert.called(cleanupStub);
          sinon.assert.called(closeStub);
          sinon.assert.calledWithExactly(publishStub, 'connection', 'cancel', null, conn);
        });

        it('should not emit a disconnect event', () => {
          const callback = sinon.stub();
          conn.mediaStream.close = () => mediaStream.onclose();
          conn.on('disconnect', callback);
          pstream.emit('cancel', { callsid: 'CA123' });

          return wait().then(() => sinon.assert.notCalled(callback));
        });
      });

      context('when the callsid does not match', () => {
        it('should not transition to closed', () => {
          pstream.emit('cancel', { callsid: 'foo' });
          assert.equal(conn.status(), Connection.State.Pending);
        });

        it('should not emit a cancel event', () => {
          conn.on('cancel', () => { throw new Error('Was expecting cancel to not be emitted'); });
          pstream.emit('cancel', { callsid: 'foo' });
        });
      });
    });

    describe('pstream.hangup event', () => {
      context('when callsid matches', () => {
        beforeEach((done) => {
          conn = new Connection(config, Object.assign({
            callParameters: { CallSid: 'CA123' }
          }, options));
          mediaStream.makeOutgoingCall = () => done();
          mediaStream.answerIncomingCall = () => done();
          conn.accept();
        });

        it('should publish a disconnected-by-remote event', () => {
          publisher.info.reset();
          pstream.emit('hangup', { callsid: 'CA123' });
          sinon.assert.calledWith(publisher.info, 'connection', 'disconnected-by-remote');
        });

        it('should not call pstream.hangup', () => {
          pstream.emit('hangup', { callsid: 'CA123' });
          sinon.assert.notCalled(pstream.hangup);
        });

        it('should throw an error if the payload contains an error', () => {
          const callback = sinon.stub();
          conn.on('error', callback);
          pstream.emit('cancel', { callsid: 'foo' });
          pstream.emit('hangup', { callsid: 'CA123', error: {
            code: 123,
            message: 'foo',
          }});

          sinon.assert.calledWithMatch(callback, {
            code: 123,
            message: 'foo',
            connection: conn,
          });

          const rVal = callback.firstCall.args[0];
          assert.equal(rVal.twilioError.code, 31005);
        });
      });

      context('when callsid does not match', () => {
        beforeEach((done) => {
          conn = new Connection(config, Object.assign({
            callParameters: { CallSid: 'CA987' }
          }, options));
          mediaStream.makeOutgoingCall = () => done();
          mediaStream.answerIncomingCall = () => done();
          conn.accept();
        });

        it('should not publish a disconnected-by-remote event', () => {
          publisher.info.reset();
          pstream.emit('hangup', { callsid: 'CA123' });
          sinon.assert.notCalled(publisher.info);
        });

        it('should not call pstream.hangup', () => {
          pstream.emit('hangup', { callsid: 'CA123' });
          sinon.assert.notCalled(pstream.hangup);
        });
      });
    });

    describe('pstream.ringing event', () => {
      [Connection.State.Connecting, Connection.State.Ringing].forEach((state: Connection.State) => {
        context(`when state is ${state} and enableRingingState is false`, () => {
          beforeEach(() => {
            (conn as any)['_status'] = state;
          });

          context('and sdp is present', () => {
            it('should transition to open if mediastream is open', () => {
              mediaStream.status = 'open';
              pstream.emit('ringing', { sdp: 'foo' });
              assert.equal(conn.status(), Connection.State.Open);
            });

            it('should emit accept if mediastream is open', (done) => {
              mediaStream.status = 'open';
              conn.on('accept', () => done());
              pstream.emit('ringing', { sdp: 'foo' });
            });

            it('should not transition to open if mediastream is not open', () => {
              mediaStream.status = 'closed';
              pstream.emit('ringing', { sdp: 'foo' });
              assert.equal(conn.status(), state);
            });

            it('should not emit accept if mediastream is not open', () => {
              mediaStream.status = 'closed';
              conn.on('accept', () => { throw new Error('Was expecting accept to not be emitted'); });
              pstream.emit('ringing', { sdp: 'foo' });
            });
          });

          context('and sdp is not present', () => {
            it('should not transition to open if mediastream is open', () => {
              mediaStream.status = 'open';
              pstream.emit('ringing', { });
              assert.equal(conn.status(), state);
            });

            it('should not emit accept if mediastream is open', () => {
              mediaStream.status = 'open';
              conn.on('accept', () => { throw new Error('Was expecting accept to not be emitted'); });
              pstream.emit('ringing', { });
            });

            it('should not transition to open if mediastream is not open', () => {
              mediaStream.status = 'closed';
              pstream.emit('ringing', { });
              assert.equal(conn.status(), state);
            });

            it('should not emit accept if mediastream is not open', () => {
              mediaStream.status = 'closed';
              conn.on('accept', () => { throw new Error('Was expecting accept to not be emitted'); });
              pstream.emit('ringing', { });
            });
          });
        });

        context(`when state is ${state} and enableRingingState is true`, () => {
          beforeEach(() => {
            conn = new Connection(config, Object.assign({
              enableRingingState: true,
            }, options));
            (conn as any)['_status'] = state;
          });

          it('should set status to ringing', () => {
            pstream.emit('ringing', { callsid: 'ABC123', });
            assert.equal(conn.status(), Connection.State.Ringing);
          });

          it('should publish an outgoing-ringing event with hasEarlyMedia: false if no sdp', () => {
            pstream.emit('ringing', { callsid: 'ABC123' });
            sinon.assert.calledWith(publisher.info, 'connection', 'outgoing-ringing', {
              hasEarlyMedia: false,
            });
          });

          it('should publish an outgoing-ringing event with hasEarlyMedia: true if sdp', () => {
            pstream.emit('ringing', { callsid: 'ABC123', sdp: 'foo' });
            sinon.assert.calledWith(publisher.info, 'connection', 'outgoing-ringing', {
              hasEarlyMedia: true,
            });
          });

          it('should emit a ringing event with hasEarlyMedia: false if no sdp', (done) => {
            conn.on('ringing', (hasEarlyMedia) => {
              assert(!hasEarlyMedia);
              done();
            });

            pstream.emit('ringing', { callsid: 'ABC123' });
          });

          it('should emit a ringing event with hasEarlyMedia: true if sdp', (done) => {
            conn.on('ringing', (hasEarlyMedia) => {
              assert(hasEarlyMedia);
              done();
            });

            pstream.emit('ringing', { callsid: 'ABC123', sdp: 'foo' });
          });
        });
      });
    });
  });

  describe('on monitor.sample', () => {
    let sampleData: any;
    let audioData: any;

    beforeEach(() => {
      sampleData = {
        timestamp: 0,
        totals: {
          packetsReceived: 0,
          packetsLost: 0,
          packetsSent: 0,
          packetsLostFraction: 0,
          bytesReceived: 0,
          bytesSent: 0
        },
        packetsSent: 0,
        packetsReceived: 0,
        packetsLost: 0,
        packetsLostFraction: 0,
        jitter: 0,
        rtt: 0,
        mos: 0,
        codecName: 'opus'
      };

      audioData = {
        audioInputLevel: 0,
        audioOutputLevel: 0,
        inputVolume: 0,
        outputVolume: 0
      };
    });

    context('after 10 samples have been emitted', () => {
      it('should call publisher.postMetrics with the samples', () => {
        const samples = [];

        for (let i = 0; i < 10; i++) {
          const sample = {...sampleData, ...audioData}
          samples.push(sample);
          monitor.emit('sample', sample);
        }

        sinon.assert.calledOnce(publisher.postMetrics);
        sinon.assert.calledWith(publisher.postMetrics, 'quality-metrics-samples', 'metrics-sample', samples);
      });

      it('should publish correct volume levels', () => {
        const samples = [];
        const dataLength = 10;

        const convert = (internalValue: any) => (internalValue / 255) * 32767;

        for (let i = 1; i <= dataLength; i++) {
          const internalAudioIn = i;
          const internalAudioOut = i * 2;

          mediaStream.onvolume(i, i, internalAudioIn, internalAudioOut);

          // This helps determine that levels are averaging correctly
          mediaStream.onvolume(i, i, 2, 2);

          const sample = {
            ...sampleData,
            audioInputLevel: Math.round((convert(internalAudioIn) + convert(2)) / 2),
            audioOutputLevel: Math.round((convert(internalAudioOut) + convert(2)) / 2),
            inputVolume: i,
            outputVolume: i
          };

          samples.push(sample);
          monitor.emit('sample', sample);
        }

        sinon.assert.calledOnce(publisher.postMetrics);
        sinon.assert.calledWith(publisher.postMetrics, 'quality-metrics-samples', 'metrics-sample', samples);
      });

      it('should call on sample event handler', () => {
        const onSample = sinon.stub();
        conn.on('sample', onSample);

        const sample = {...sampleData};
        monitor.emit('sample', sample);
        sinon.assert.calledOnce(onSample);
        sinon.assert.calledWith(onSample, sample);
      });
    });
  });

  describe('on monitor.warning', () => {
    context('if warningData.name contains audio', () => {
      it('should publish an audio-level-warning-raised warning event', () => {
        monitor.emit('warning', { name: 'audio', threshold: { name: 'max' }, values: [1, 2, 3] });
        sinon.assert.calledWith(publisher.post, 'warning', 'audio-level-warning-raised');
      });

      it('should emit a warning event', (done) => {
        conn.on('warning', () => done());
        monitor.emit('warning', { name: 'audio', threshold: { name: 'max' } });
      });
    });

    context('if warningData.name does not contain audio', () => {
      it('should publish an network-quality-warning-raised warning event', () => {
        monitor.emit('warning', { name: 'foo', threshold: { name: 'max' } });
        sinon.assert.calledWith(publisher.post, 'warning', 'network-quality-warning-raised');
      });

      it('should emit a warning event', (done) => {
        conn.on('warning', () => done());
        monitor.emit('warning', { name: 'foo', threshold: { name: 'max' } });
      });
    });
  });

  describe('on monitor.warning-cleared', () => {
    context('if warningData.name contains audio', () => {
      it('should publish an audio-level-warning-cleared info event', () => {
        monitor.emit('warning-cleared', { name: 'audio', threshold: { name: 'max' } });
        sinon.assert.calledWith(publisher.post, 'info', 'audio-level-warning-cleared');
      });

      it('should emit a warning-cleared event', (done) => {
        conn.on('warning-cleared', () => done());
        monitor.emit('warning-cleared', { name: 'audio', threshold: { name: 'max' } });
      });
    });

    context('if warningData.name does not contain audio', () => {
      it('should publish an network-quality-warning-cleared info event', () => {
        monitor.emit('warning-cleared', { name: 'foo', threshold: { name: 'max' } });
        sinon.assert.calledWith(publisher.post, 'info', 'network-quality-warning-cleared');
      });

      it('should emit a warning-cleared event', (done) => {
        conn.on('warning-cleared', () => done());
        monitor.emit('warning-cleared', { name: 'foo', threshold: { name: 'max' } });
      });
    });
  });

  describe('on media failed', () => {
    beforeEach(() => {
      mediaStream.iceRestart = sinon.stub();
      conn = new Connection(config, Object.assign(options, { enableIceRestart: true }));
      conn['_mediaReconnectBackoff'] = {
        backoff: () => mediaStream.iceRestart(),
        reset: sinon.stub(),
      }
      Util.isChrome = sinon.stub().returns(true);
    });

    context('on ICE Gathering failures', () => {
      it('should emit reconnecting', () => {
        const callback = sinon.stub();

        conn.on('reconnecting', callback);
        mediaStream.onicegatheringfailure();

        sinon.assert.callCount(callback, 1);
        sinon.assert.calledWithMatch(callback, {
          code: 53405,
          message: 'Media connection failed.',
        });

        const rVal = callback.firstCall.args[0];
        assert.equal(rVal.twilioError.code, 53405);
      });

      it('should publish warning on ICE Gathering timeout', () => {
        mediaStream.onicegatheringfailure(Connection.IceGatheringFailureReason.Timeout);
        sinon.assert.calledWith(publisher.warn, 'ice-gathering-state',
          Connection.IceGatheringFailureReason.Timeout, null);
      });

      it('should publish warning on ICE Gathering none', () => {
        mediaStream.onicegatheringfailure(Connection.IceGatheringFailureReason.None);
        sinon.assert.calledWith(publisher.warn, 'ice-gathering-state',
          Connection.IceGatheringFailureReason.None, null);
      });
    });

    context('on low bytes', () => {
      it('should restart ice if ice connection state is disconnected and bytes received is low', () => {
        mediaStream.version.pc.iceConnectionState = 'disconnected';
        monitor.hasActiveWarning = sinon.stub().returns(true);
        monitor.emit('warning', { name: 'bytesReceived', threshold: { name: 'min' } });
        sinon.assert.callCount(mediaStream.iceRestart, 1);
      });

      it('should restart ice if ice connection state is disconnected and bytes sent is low', () => {
        mediaStream.version.pc.iceConnectionState = 'disconnected';
        monitor.hasActiveWarning = sinon.stub().returns(true);
        monitor.emit('warning', { name: 'bytesSent', threshold: { name: 'min' } });
        sinon.assert.callCount(mediaStream.iceRestart, 1);
      });

      it('should not restart ice if ice connection state is not disconnected and bytes received is low', () => {
        mediaStream.version.pc.iceConnectionState = 'connected';
        monitor.hasActiveWarning = sinon.stub().returns(true);
        monitor.emit('warning', { name: 'bytesReceived', threshold: { name: 'min' } });
        sinon.assert.callCount(mediaStream.iceRestart, 0);
      });

      it('should not restart ice if ice connection state is not disconnected and bytes sent is low', () => {
        mediaStream.version.pc.iceConnectionState = 'connected';
        monitor.hasActiveWarning = sinon.stub().returns(true);
        monitor.emit('warning', { name: 'bytesSent', threshold: { name: 'min' } });
        sinon.assert.callCount(mediaStream.iceRestart, 0);
      });
    });

    context('on ice disconnected', () => {
      it('should restart ice if has low bytes', () => {
        mediaStream.version.pc.iceConnectionState = 'disconnected';
        monitor.hasActiveWarning = sinon.stub().returns(true);
        mediaStream.ondisconnected();
        sinon.assert.callCount(mediaStream.iceRestart, 1);
      });
      it('should not restart ice if no low bytes warning', () => {
        mediaStream.version.pc.iceConnectionState = 'disconnected';
        monitor.hasActiveWarning = sinon.stub().returns(false);
        mediaStream.ondisconnected();
        sinon.assert.callCount(mediaStream.iceRestart, 0);
      });
    });

    it('should restart on ice failed', () => {
      mediaStream.onfailed();
      sinon.assert.callCount(mediaStream.iceRestart, 1);
    });

    it('should emit reconnecting once', () => {
      const callback = sinon.stub();
      mediaStream.version.pc.iceConnectionState = 'disconnected';
      monitor.hasActiveWarning = sinon.stub().returns(true);

      conn.on('reconnecting', callback);
      mediaStream.ondisconnected();
      mediaStream.onfailed();

      sinon.assert.callCount(callback, 1);
      sinon.assert.calledWithMatch(callback, {
        code: 53405,
        message: 'Media connection failed.',
      });

      const rVal = callback.firstCall.args[0];
      assert.equal(rVal.twilioError.code, 53405);
    });

    it('should emit reconnected on ice reconnected', () => {
      const callback = sinon.stub();
      mediaStream.onfailed();
      conn.on('reconnected', callback);
      mediaStream.onreconnected();

      sinon.assert.callCount(callback, 1);
    });

    it('should emit reconnected on initial ice connected after ice gathering failure', () => {
      const callback = sinon.stub();
      mediaStream.onicegatheringfailure();
      conn.on('reconnected', callback);
      mediaStream.onconnected();

      sinon.assert.callCount(callback, 1);
    });
  });
});

/**
 * Create a stub and mixin the EventEmitter functions. All methods are replaced with stubs,
 * except the EventEmitter functionality, which works as expected.
 * @param BaseClass - The base class to stub.
 * @returns A stubbed instance with EventEmitter mixed in.
 */
function createEmitterStub(BaseClass: any): SinonStubbedInstance<any> {
  const stub: SinonStubbedInstance<any> = sinon.createStubInstance(BaseClass);

  Object.getOwnPropertyNames(EventEmitter.prototype).forEach((name: string) => {
    const property = (EventEmitter.prototype as any)[name];
    if (typeof property !== 'function') { return; }
    stub[name] = property.bind(stub);
  });

  EventEmitter.constructor.call(stub);
  return stub;
}
