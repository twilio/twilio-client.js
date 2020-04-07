import { levels as LogLevels } from 'loglevel';
import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { regionShortcodes } from '../../lib/twilio/regions';
import { GeneralErrors } from '../../lib/twilio/errors';

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { SinonFakeTimers, SinonSpy, SinonStubbedInstance } from 'sinon';
import * as sinon from 'sinon';

const ClientCapability = require('twilio').jwt.ClientCapability;

const NOT_INITIALIZED_ERROR = /Call Device.setup/;

/* tslint:disable-next-line */
describe('Device', function() {
  let activeConnection: any;
  let audioHelper: any;
  let clock: SinonFakeTimers;
  let connectOptions: Record<string, any> | undefined;
  let device: Device;
  let pstream: any;
  let publisher: any;
  let stub: SinonStubbedInstance<Device>;
  let token: string;
  let updateInputStream: Function;
  let updateSinkIds: Function;

  const sounds: Partial<Record<Device.SoundName, any>> = { };

  const AudioHelper = (_updateSinkIds: Function, _updateInputStream: Function) => {
    updateInputStream = _updateInputStream;
    updateSinkIds = _updateSinkIds;
    return audioHelper = createEmitterStub(require('../../lib/twilio/audiohelper').default);
  };
  const connectionFactory = (_?: any, _connectOptions?: Record<string, any>) => {
    connectOptions = _connectOptions;
    return activeConnection = createEmitterStub(require('../../lib/twilio/connection').default);
  };
  const pStreamFactory = () =>
    pstream = createEmitterStub(require('../../lib/twilio/pstream').PStream);
  const Publisher = () =>
    publisher = createEmitterStub(require('../../lib/twilio/eventpublisher'));
  const soundFactory = (name: Device.SoundName) =>
    sounds[name] = sinon.createStubInstance(require('../../lib/twilio/sound'));
  const setupOptions = { AudioHelper, connectionFactory, pStreamFactory, Publisher, soundFactory };

  afterEach(() => {
    clock.restore();
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());
    token = createToken('alice');
    device = new Device();
  });

  describe('constructor', () => {
    it('should set _isUnifiedPlanDefault once', () => {
      assert.equal(Device['_isUnifiedPlanDefault'], undefined);
      device.setup('temptoken');
      assert.notEqual(Device['_isUnifiedPlanDefault'], undefined);

      const isUnifiedPlan = Device['_isUnifiedPlanDefault'];
      Device['_isUnifiedPlanDefault'] = !isUnifiedPlan;
      device.setup('temptoken');
      assert.equal(Device['_isUnifiedPlanDefault'], !isUnifiedPlan);
    });

    it('should not call setup if no token is passed', () => {
      stub = sinon.stub(device);
      Device.prototype.constructor.call(stub);
      sinon.assert.notCalled(stub.setup);
    });

    it('should call setup if token and no options are passed', () => {
      stub = sinon.stub(device);
      Device.prototype.constructor.call(stub, token);
      sinon.assert.calledOnce(stub.setup);
    });

    it('should call setup if token and options are passed', () => {
      stub = sinon.stub(device);
      Device.prototype.constructor.call(stub, token, { } as any);
      sinon.assert.calledOnce(stub.setup);
    });

    it('should throw an error if options are passed but no token', () => {
      assert.throws(() => new (Device as any)(undefined, { } as any), /Cannot construct a Device/);
    });

    it('should set enableIceRestart to false by default', () => {
      const conn = device.setup(token, setupOptions);
      assert.equal(conn['options'].enableIceRestart, false);
    });

    it('should set enableIceRestart to false if passed in as false', () => {
      const conn = device.setup(token, Object.assign({ enableIceRestart: false}, setupOptions));
      assert.equal(conn['options'].enableIceRestart, false);
    });

    it('should set enableIceRestart to false if passed in as true', () => {
      const conn = device.setup(token, Object.assign({ enableIceRestart: true}, setupOptions));
      assert.equal(conn['options'].enableIceRestart, true);
    });

    it('should set forceAggressiveIceNomination to false by default', () => {
      const conn = device.setup(token, setupOptions);
      assert.equal(conn['options'].forceAggressiveIceNomination, false);
    });

    it('should set forceAggressiveIceNomination to false if passed in as false', () => {
      const conn = device.setup(token, Object.assign({ forceAggressiveIceNomination: false}, setupOptions));
      assert.equal(conn['options'].forceAggressiveIceNomination, false);
    });

    it('should set forceAggressiveIceNomination to true if passed in as true', () => {
      const conn = device.setup(token, Object.assign({ forceAggressiveIceNomination: true}, setupOptions));
      assert.equal(conn['options'].forceAggressiveIceNomination, true);
    });

    describe('log', () => {
      let setDefaultLevelStub: any;
      beforeEach(() => {
        setDefaultLevelStub = sinon.stub();
        device['_log'].setDefaultLevel = setDefaultLevelStub;
      });

      it('should set log level to DEBUG if debug is true and warnings is true', () => {
        device.setup(token, Object.assign({ debug: true, warnings: true }, setupOptions));
        sinon.assert.calledWith(setDefaultLevelStub, LogLevels.DEBUG);
      });

      it('should set log level to DEBUG if debug is true and warnings is false', () => {
        device.setup(token, Object.assign({ debug: true, warnings: false }, setupOptions));
        sinon.assert.calledWith(setDefaultLevelStub, LogLevels.DEBUG);
      });

      it('should set log level to WARN if debug is false and warnings is true', () => {
        device.setup(token, Object.assign({ debug: false, warnings: true }, setupOptions));
        sinon.assert.calledWith(setDefaultLevelStub, LogLevels.WARN);
      });

      it('should set log level to SILENT if debug is false and warnings is false', () => {
        device.setup(token, Object.assign({ debug: false, warnings: false }, setupOptions));
        sinon.assert.calledWith(setDefaultLevelStub, LogLevels.SILENT);
      });
    });
  });

  context('before Device is initialized', () => {
    describe('deprecated handler methods', () => {
      Object.entries(Device.EventName).forEach(([eventName, eventString]) => {
        it(`should set an event listener on Device for .${eventString}(handler)`, () => {
          const handler = () => { };
          (device as any)[eventString](handler);
          assert.equal(device.listenerCount(eventString), 1);
          assert.equal(device.listeners(eventString)[0], handler);
          device.removeListener(eventName as Device.EventName, handler);
        });
      });
    });

    describe('.activeConnection()', () => {
      it('should return null', () => {
        assert.equal(device.activeConnection(), null);
      });
    });

    describe('.connect(params?, audioConstraints?)', () => {
      it('should throw an error', () => {
        assert.throws(() => device.connect(), NOT_INITIALIZED_ERROR);
      });
    });

    describe('.destroy()', () => {
      it('should not throw', () => {
        device.destroy();
      });
    });

    describe('.disconnectAll()', () => {
      it('should throw an error', () => {
        assert.throws(() => device.disconnectAll(), NOT_INITIALIZED_ERROR);
      });
    });

    describe('.region()', () => {
      it('should throw an error', () => {
        assert.throws(() => device.region(), NOT_INITIALIZED_ERROR);
      });
    });

    describe('.registerPresence()', () => {
      it('should throw an error', () => {
        assert.throws(() => device.registerPresence(), NOT_INITIALIZED_ERROR);
      });
    });

    describe('.setup()', () => {
      context('when not supported', () => {
        const original: any = (window as any).RTCPeerConnection;

        before(() => Promise.resolve((window as any).RTCPeerConnection = null));

        it('should throw an exception if not supported', () => {
          assert.throws(() => device.setup(token, setupOptions), /require WebRTC\/ORTC browser support/);
        });

        after(() => (window as any).RTCPeerConnection = original);
      });

      context('when supported', () => {
        let d: Device;

        beforeEach(() => {
          d = device.setup(token, setupOptions);
        });

        it('should return the device instance', () => {
          assert.equal(d, device);
        });

        it('should throw if token is undefined', () => {
          device = new Device();
          assert.throws(() => (device.setup as any)(), /Token is required/);
        });

        it('should set device.isInitialized to true', () => {
          assert.equal(device.isInitialized, true);
        });

        it('should disable the publisher when publishEvents: false is passed', () => {
          device = new Device();
          device.setup(token, Object.assign(setupOptions, { publishEvents: false }));
          sinon.assert.calledOnce(publisher.disable);
        });

        it('should call updateToken with the passed token', () => {
          const spy = sinon.spy(device.updateToken);
          device.updateToken = spy;
          device.setup(token);
          sinon.assert.calledOnce(spy);
          sinon.assert.calledWith(spy, token);
        });

        it('should set close protection on the page if closeProtection: true', () => {
          const original = (window as any).addEventListener;
          const spy = sinon.spy();
          (window as any).addEventListener = spy;
          device = new Device();
          device.setup(token, Object.assign(setupOptions, { closeProtection: true }));
          (window as any).addEventListener = original;
          sinon.assert.calledWith(spy, 'beforeunload');
        });
      });
    });

    describe('.status()', () => {
      it('should throw an error', () => {
        assert.throws(() => device.status(), NOT_INITIALIZED_ERROR);
      });
    });

    describe('.unregisterPresence()', () => {
      it('should throw an error', () => {
        assert.throws(() => device.unregisterPresence(), NOT_INITIALIZED_ERROR);
      });
    });

    describe('.toString()', () => {
      it('should return the correct string', () => {
        assert.equal(device.toString(), '[Twilio.Device instance]');
      });
    });
  });

  context('after Device is initialized', () => {
    const rtcConfiguration = { foo: 'bar', abc: 123 };

    beforeEach(() => {
      device.setup(token, Object.assign({ rtcConfiguration }, setupOptions));
    });

    describe('deprecated handler methods', () => {
      Object.entries(Device.EventName).forEach(([eventName, eventString]) => {
        it(`should set an event listener on Device for .${eventString}(handler)`, () => {
          const handler = () => { };
          device.removeAllListeners(eventString);
          (device as any)[eventString](handler);
          assert.equal(device.listenerCount(eventString), 1);
          assert.equal(device.listeners(eventString)[0], handler);
          device.removeListener(eventName as Device.EventName, handler);
        });
      });
    });

    describe('.activeConnection()', () => {
      it('should return undefined if there are no Connections', () => {
        assert.equal(device.activeConnection(), undefined);
      });

      it('should return the active Connection if one exists', () => {
        const conn: Connection = device.connect();
        assert.equal(device.activeConnection(), conn);
        assert.equal(device.activeConnection(), activeConnection);
      });

      it('should return the first connection if no Connection is active', () => {
        (device as any)['connections'] = ['foo', 'bar'];
        assert.equal(device.activeConnection(), 'foo');
      });
    });

    describe('.connect(params?, audioConstraints?)', () => {
      it('should throw an error if there is already an active connection', () => {
        device.connect();
        assert.throws(() => device.connect(), /A Connection is already active/);
      });

      it('should call ignore on all existing connections', () => {
        const connections: any[] = [];
        for (let i = 0; i < 10; i++) {
          connections.push({ ignore: sinon.spy() });
        }
        device['connections'] = connections;
        device.connect();
        connections.forEach((conn: any) => sinon.assert.calledOnce(conn.incoming));
        assert.equal(device.connections.length, 0);
      });

      it('should stop playing the incoming sound', () => {
        const spy: any = { stop: sinon.spy() };
        device['soundcache'].set(Device.SoundName.Incoming, spy);
        device.connect();
        sinon.assert.calledOnce(spy.stop);
      });

      it('should return a Connection', () => {
        assert.equal(device.connect(), activeConnection);
      });

      it('should set .activeConnection()', () => {
        assert.equal(device.connect(), device.activeConnection());
      });

      it('should pass rtcConfiguration along', () => {
        assert.deepEqual(rtcConfiguration, connectOptions && connectOptions.rtcConfiguration);
      });

      it('should play outgoing sound after accepted if enabled', () => {
        const spy: any = { play: sinon.spy() };
        device['soundcache'].set(Device.SoundName.Outgoing, spy);
        device.connect();
        activeConnection._direction = 'OUTGOING';
        activeConnection.emit('accept');
        sinon.assert.calledOnce(spy.play);
      });
    });

    describe('.destroy()', () => {
      it('should destroy .stream', () => {
        device.destroy();
        sinon.assert.calledOnce(pstream.destroy);
      });

      it('should stop sending registrations', () => {
        device.destroy();
        pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
        clock.tick(30000 + 1);
        sinon.assert.notCalled(pstream.register);
      });

      it('should disconnect all connections', () => {
        const disconnect = sinon.spy();
        (device as any)['connections'] = [
          { disconnect },
          { disconnect },
        ];
        device.destroy();
        sinon.assert.calledTwice(disconnect);
      });

      it('should disconnect active connection', () => {
        const connection = device.connect();
        device.destroy();
        sinon.assert.calledOnce((connection as any).disconnect);
      });
    });

    describe('.disconnectAll()', () => {
      it('should clear device.connections', () => {
        (device as any)['connections'] = [
          { disconnect: () => { } },
          { disconnect: () => { } },
        ];
        device.disconnectAll();
        assert.equal(device.connections.length, 0);
      });

      it('should call disconnect on all connections', () => {
        const disconnect = sinon.spy();
        (device as any)['connections'] = [
          { disconnect },
          { disconnect },
        ];
        device.disconnectAll();
        sinon.assert.calledTwice(disconnect);
      });

      it('should call disconnect on the active connection', () => {
        const connection = device.connect();
        device.disconnectAll();
        sinon.assert.calledOnce((connection as any).disconnect);
      });
    });

    describe('.region()', () => {
      it(`should return 'offline' if not connected`, () => {
        assert.equal(device.region(), 'offline');
      });

      context('when the Region is known to the SDK', () => {
        Object.entries(regionShortcodes).forEach(([fullName, region]: [string, string]) => {
          it(`should return ${region.toString()} for ${fullName}`, () => {
            pstream.emit('connected', { region: fullName });
            assert.equal(device.region(), region);
          });
        });
      });

      context('when the Region is not known to the SDK', () => {
        ['FOO_BAR', 'sg1', ''].forEach((name: string) => {
          it(`should return the region string directly if it's '${name}'`, () => {
            pstream.emit('connected', { region: name });
            assert.equal(device.region(), name);
          });
        });
      });
    });

    describe('.registerPresence()', () => {
      it('should send a register request with audio: true', () => {
        device.registerPresence();
        sinon.assert.calledOnce(pstream.register);
        sinon.assert.calledWith(pstream.register, { audio: true });
      });

      it('should start the registration timer', () => {
        device.registerPresence();
        sinon.assert.calledOnce(pstream.register);
        clock.tick(30000 + 1);
        sinon.assert.calledTwice(pstream.register);
      });
    });

    describe('.unregisterPresence()', () => {
      it('should send a register request with audio: false', () => {
        device.unregisterPresence();
        sinon.assert.calledOnce(pstream.register);
        sinon.assert.calledWith(pstream.register, { audio: false });
      });

      it('should stop the registration timer', () => {
        device.unregisterPresence();
        sinon.assert.calledOnce(pstream.register);
        clock.tick(30000 + 1);
        sinon.assert.calledOnce(pstream.register);
      });
    });

    describe('.setup()', () => {
      it('should call updateToken with the passed token', () => {
        const spy = sinon.spy(device.updateToken);
        device.updateToken = spy;
        device.setup(token);
        sinon.assert.calledOnce(spy);
        sinon.assert.calledWith(spy, token);
      });
    });

    describe('.sounds', () => {
      it('should log a deprecation warning the first time a child method is called', () => {
        const spy: SinonSpy = sinon.spy();
        device['_log'].warn = spy;
        assert(device.sounds.incoming);
        if (device.sounds.incoming) {
          device.sounds.incoming(false);
        }
        sinon.assert.calledOnce(spy);
      });

      it('should not log a deprecation warning the second time a child method is called', () => {
        const spy: SinonSpy = sinon.spy();
        device['_log'].warn = spy;
        if (device.sounds.incoming) {
          device.sounds.incoming(false);
        }
        sinon.assert.notCalled(spy);
      });

      it('should contain a working get/set method for .incoming()', () => {
        if (device.sounds.incoming) {
          device.sounds.incoming(true);
          assert.equal(device.sounds.incoming(), true);
          device.sounds.incoming(false);
          assert.equal(device.sounds.incoming(), false);
        }
      });

      it('should contain a working get/set method for .outgoing()', () => {
        if (device.sounds.outgoing) {
          device.sounds.outgoing(true);
          assert.equal(device.sounds.outgoing(), true);
          device.sounds.outgoing(false);
          assert.equal(device.sounds.outgoing(), false);
        }
      });

      it('should contain a working get/set method for .disconnect()', () => {
        if (device.sounds.disconnect) {
          device.sounds.disconnect(true);
          assert.equal(device.sounds.disconnect(), true);
          device.sounds.disconnect(false);
          assert.equal(device.sounds.disconnect(), false);
        }
      });
    });

    describe('.status()', () => {
      it('should return offline before registering', () => {
        assert.equal(device.status(), Device.Status.Offline);
      });
    });

    describe('on device change', () => {
      it('should publish a device-change event', () => {
        device.audio && device.audio.emit('deviceChange', [{ deviceId: 'foo' }]);
        sinon.assert.calledOnce(publisher.info);
        sinon.assert.calledWith(publisher.info, 'audio', 'device-change', {
          lost_active_device_ids: ['foo']
        });
      });

      it('should call _onInputDevicesChanges on the active Connection', () => {
        device.connect();
        const spy: SinonSpy = sinon.spy();
        activeConnection.mediaStream = { _onInputDevicesChanged: spy };
        device.audio && device.audio.emit('deviceChange', []);
        sinon.assert.calledOnce(spy);
      });
    });

    describe('on Device.error', () => {
      it('should never throw uncaught', () => {
        const noop = () => { };

        device.emit('error');
        device.addListener(Device.EventName.Error, noop);
        device.emit('error');
        device.removeListener(Device.EventName.Error, noop);
        device.emit('error');
      });
    });

    describe('createDefaultPayload', () => {
      xit('should be tested', () => {
        // This should be moved somewhere that it can be tested. This is currently:
        // A) Internal to Device where it can't easily be tested and
        // B) Reaching into Connection, causing a weird coupling.
      });
    });

    describe('on signaling.close', () => {
      it('should set stream to null', () => {
        pstream.emit('close');
        assert.equal(device['stream'], null);
      });
    });

    describe('on signaling.connected', () => {
      it('should update region', () => {
        pstream.emit('connected', { region: 'EU_IRELAND' });
        assert.equal(device.region(), regionShortcodes.EU_IRELAND);
      });

      it('should send a register request with audio: true', () => {
        pstream.emit('connected', { region: 'EU_IRELAND' });
        sinon.assert.calledOnce(pstream.register);
        sinon.assert.calledWith(pstream.register, { audio: true });
      });

      it('should start the registration timer', () => {
        pstream.emit('connected', { region: 'EU_IRELAND' });
        sinon.assert.calledOnce(pstream.register);
        clock.tick(30000 + 1);
        sinon.assert.calledTwice(pstream.register);
      });
    });

    describe('on signaling.error', () => {
      const twilioError = new GeneralErrors.UnknownError();

      it('should not emit Device.error if payload.error is missing', () => {
        device.emit = sinon.spy();
        pstream.emit('error', { });
        sinon.assert.notCalled(device.emit as any);
      });

      it('should emit Device.error without connection if payload.callsid is missing', () => {
        device.emit = sinon.spy();
        pstream.emit('error', { error: { twilioError } });
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'error', { twilioError });
      });

      it('should emit Device.error with connection if payload.callsid is present', () => {
        pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
        const conn = device.connections[0];
        conn.parameters = { CallSid: 'foo' };
        device.emit = sinon.spy();
        pstream.emit('error', { error: { twilioError }, callsid: 'foo' });
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'error', { connection: conn, twilioError });
      });

      it('should not stop registrations if code is not 31205', () => {
        device.registerPresence();
        pstream.emit('error', { error: { } });
        pstream.register.reset();
        clock.tick(30000 + 1);
        sinon.assert.called(pstream.register);
      });

      it('should stop registrations if code is 31205', () => {
        device.registerPresence();
        pstream.emit('error', { error: { code: 31205 } });
        pstream.register.reset();
        clock.tick(30000 + 1);
        sinon.assert.notCalled(pstream.register);
      });

      it('should emit Device.error if code is 31005', () => {
        device.emit = sinon.spy();
        pstream.emit('error', { error: { code: 31005 } });
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'error');
        const errorObject = (device.emit as sinon.SinonSpy).getCall(0).args[1];
        assert.equal(31005, errorObject.code);
      });
    });

    describe('on signaling.invite', () => {
      it('should not create a new connection if already on an active call', () => {
        device.connect();
        pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
        assert.equal(device.connections.length, 0);
      });

      it('should emit an error and not create a new connection if payload is missing callsid', () => {
        device.emit = sinon.spy();
        pstream.emit('invite', { sdp: 'bar' });
        assert.equal(device.connections.length, 0);
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'error');
      });

      it('should emit an error and not create a new connection if payload is missing sdp', () => {
        device.emit = sinon.spy();
        pstream.emit('invite', { sdp: 'bar' });
        assert.equal(device.connections.length, 0);
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'error');
      });

      context('if not on an active call and payload is valid', () => {
        beforeEach(() => {
          pstream.emit('invite', { callsid: 'foo', sdp: 'bar', parameters: { Params: 'foo=bar' } });
        });

        it('should not create a new connection if not on an active call and payload is valid', () => {
          assert.equal(device.connections.length, 1);
        });

        it('should pass the custom parameters to the new connection', () => {
          assert.deepEqual(connectOptions && connectOptions.twimlParams, { foo: 'bar' });
        });
      });

      it('should play the incoming sound', () => {
        const spy = { play: sinon.spy() };
        device['soundcache'].set(Device.SoundName.Incoming, spy);
        pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
        sinon.assert.calledOnce(spy.play);
      });

      context('when allowIncomingWhileBusy is true', () => {
        beforeEach(() => {
          device = new Device();
          device.setup(token, Object.assign(setupOptions, { allowIncomingWhileBusy: true }));
          pstream.emit('ready');
          device.connect();
        });

        it('should create a new connection', () => {
          pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
          assert.equal(device.connections.length, 1);
          assert.notEqual(device.connections[0], device.activeConnection());
        });

        it('should not play the incoming sound', () => {
          const spy = { play: sinon.spy() };
          device['soundcache'].set(Device.SoundName.Incoming, spy);
          pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
          sinon.assert.notCalled(spy.play);
        });
      });
    });

    describe('on signaling.offline', () => {
      it('should set Device.status() to Device.Status.Offline', () => {
        pstream.emit('offline');
        assert.equal(device.status(), Device.Status.Offline);
      });

      it(`should set Device.region() to 'offline'`, () => {
        pstream.emit('offline');
        assert.equal(device.region(), 'offline');
      });

      it('should emit Device.offline', () => {
        device.emit = sinon.spy();
        pstream.emit('offline');
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'offline');
      });
    });

    describe('on signaling.ready', () => {
      it('should set Device.status() to Device.Status.Ready if currently Offline', () => {
        pstream.emit('ready');
        assert.equal(device.status(), Device.Status.Ready);
      });

      it('should not change Device.status() if currently Busy', () => {
        device.connect();
        pstream.emit('ready');
        assert.equal(device.status(), Device.Status.Busy);
      });

      it('should emit Device.offline', () => {
        device.emit = sinon.spy();
        pstream.emit('ready');
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'ready');
      });
    });

    describe('on event subscriptions coming from connection', () => {
      let connection: any;

      beforeEach((done: Function) => {
        device.once(Device.EventName.Incoming, () => {
          device.connections[0].parameters = { };
          connection = device.connections[0];
          done();
        });
        pstream.emit('invite', {
          callsid: 'CA1234',
          sdp: 'foobar',
        });
      });

      it('should emit device:connect asynchronously', () => {
        const stub = sinon.stub();
        device.on('connect', stub);
        connection.emit('accept');

        sinon.assert.notCalled(stub);
        clock.tick(1);
        sinon.assert.calledOnce(stub);
      });

      ['error', 'cancel', 'disconnect'].forEach(event => {
        it(`should emit device:${event} asynchronously`, () => {
          const stub = sinon.stub();
          device.on(event, stub);
          connection.emit(event);

          sinon.assert.notCalled(stub);
          clock.tick(1);
          sinon.assert.calledOnce(stub);
        });
      });
    });

    context('with a pending incoming call', () => {
      beforeEach((done: Function) => {
        device.once(Device.EventName.Incoming, () => {
          device.emit = sinon.spy();
          device.connections[0].parameters = { };
          done();
        });

        pstream.emit('invite', {
          callsid: 'CA1234',
          sdp: 'foobar',
        });
      });

      describe('on connection.accept', () => {
        it('should should set the active connection', () => {
          const conn = device.connections[0];
          conn.emit('accept');
          assert.equal(conn, device.activeConnection());
        });

        it('should should remove the connection', () => {
          device.connections[0].emit('accept');
          assert.equal(device.connections.length, 0);
        });

        it('should emit Device.connect', () => {
          device.connections[0].emit('accept');
          clock.tick(1);

          sinon.assert.calledOnce(device.emit as any);
          sinon.assert.calledWith(device.emit as any, 'connect');
        });

        it('should not play outgoing sound', () => {
          const spy: any = { play: sinon.spy() };
          device['soundcache'].set(Device.SoundName.Outgoing, spy);
          device.connections[0].emit('accept');
          sinon.assert.notCalled(spy.play);
        });
      });

      describe('on connection.error', () => {
        it('should should remove the connection if closed', () => {
          device.connections[0].status = () => Connection.State.Closed;
          device.connections[0].emit('error');
          assert.equal(device.connections.length, 0);
        });

        it('should emit Device.error', () => {
          device.connections[0].emit('error');
          clock.tick(1);

          sinon.assert.calledOnce(device.emit as any);
          sinon.assert.calledWith(device.emit as any, 'error');
        });
      });

      describe('on connection.transportClose', () => {
        it('should remove the connection if the connection was pending', () => {
          device.connections[0].status = () => Connection.State.Pending;
          device.connections[0].emit('transportClose');
          assert.equal(device.connections.length, 0);
        });
        it('should not remove the connection if the connection was open', () => {
          device.connections[0].status = () => Connection.State.Open;
          device.connections[0].emit('transportClose');
          assert.equal(device.connections.length, 1);
        });
      });

      describe('on connection.cancel', () => {
        it('should emit Device.cancel', () => {
          it('should should remove the connection', () => {
            device.connections[0].emit('cancel');
            assert.equal(device.connections.length, 0);
          });

          device.connections[0].emit('cancel');
          clock.tick(1);

          sinon.assert.calledOnce(device.emit as any);
          sinon.assert.calledWith(device.emit as any, 'cancel');
        });
      });

      describe('on connection.disconnect', () => {
        it('should emit Device.disconnect', () => {
          device.connections[0].emit('disconnect');
          clock.tick(1);

          sinon.assert.calledOnce(device.emit as any);
          sinon.assert.calledWith(device.emit as any, 'disconnect');
        });

        it('should remove connection from activeDevice', () => {
          const conn = device.connections[0];
          conn.accept();
          assert.equal(typeof conn, 'object');
          assert.equal(conn, device.activeConnection());

          device.connections[0].emit('disconnect');
          assert.equal(typeof device.activeConnection(), 'undefined');
        });
      });

      describe('on connection.reject', () => {
        it('should should remove the connection', () => {
          device.connections[0].emit('reject');
          assert.equal(device.connections.length, 0);
        });
      });
    });

    describe('Device.audio hooks', () => {
      describe('updateInputStream', () => {
        it('should reject if a connection is active and input stream is null', () => {
          device.connect();
          return updateInputStream(null).then(
            () => { throw new Error('Expected rejection'); },
            () => { });
        });

        it('should return a resolved Promise if there is no active connection', () => {
          return updateInputStream(null);
        });

        it('should call the connection._setInputTracksFromStream', () => {
          const info = { id: 'default', label: 'default' };
          device.connect();
          activeConnection._setInputTracksFromStream = sinon.spy(() => Promise.resolve());
          return updateInputStream(info).then(() => {
            sinon.assert.calledOnce(activeConnection._setInputTracksFromStream);
            sinon.assert.calledWith(activeConnection._setInputTracksFromStream, info);
          })
        });
      });

      describe('updateSinkIds', () => {
        context(`when type is 'speaker'`, () => {
          it('should call setSinkIds on all sounds except incoming', () => {
            const sinkIds = ['default'];
            updateSinkIds('speaker', sinkIds);
            Object.values(Device.SoundName)
              .filter((name: Device.SoundName) => name !== Device.SoundName.Incoming)
              .forEach((name: Device.SoundName) => {
                sinon.assert.calledOnce(sounds[name].setSinkIds);
                sinon.assert.calledWith(sounds[name].setSinkIds, sinkIds);
              });
          });

          it('should call _setSinkIds on the active connection', () => {
            device.connect();
            const sinkIds = ['default'];
            activeConnection._setSinkIds = sinon.spy(() => Promise.resolve())
            updateSinkIds('speaker', sinkIds);
            sinon.assert.calledOnce(activeConnection._setSinkIds);
            sinon.assert.calledWith(activeConnection._setSinkIds, sinkIds);
          });

          context('if successful', () => {
            let sinkIds: string[];
            beforeEach(() => {
              device.connect();
              sinkIds = ['default'];
              activeConnection._setSinkIds = sinon.spy(() => Promise.resolve())
              return updateSinkIds('speaker', sinkIds);
            });

            it('should publish a speaker-devices-set event', () => {
              sinon.assert.calledOnce(publisher.info);
              sinon.assert.calledWith(publisher.info, 'audio', 'speaker-devices-set',
                { audio_device_ids: sinkIds });
            });
          });

          context('if unsuccessful', () => {
            let sinkIds: string[];
            beforeEach(() => {
              device.connect();
              sinkIds = ['default'];
              activeConnection._setSinkIds = sinon.spy(() => Promise.reject(new Error('foo')));
              return updateSinkIds('speaker', sinkIds).then(
                () => { throw Error('Expected a rejection') },
                () => Promise.resolve());
            });

            it('should publish a speaker-devices-set event', () => {
              sinon.assert.calledOnce(publisher.error);
              sinon.assert.calledWith(publisher.error, 'audio', 'speaker-devices-set-failed',
                { audio_device_ids: sinkIds, message: 'foo' });
            });
          });
        });

        context(`when type is 'ringtone'`, () => {
          it('should call setSinkIds on incoming', () => {
            const sinkIds = ['default'];
            updateSinkIds('ringtone', sinkIds);
            sinon.assert.calledOnce(sounds[Device.SoundName.Incoming].setSinkIds);
            sinon.assert.calledWith(sounds[Device.SoundName.Incoming].setSinkIds, sinkIds);
          });

          context('if successful', () => {
            let sinkIds: string[];
            beforeEach(() => {
              device.connect();
              sinkIds = ['default'];
              activeConnection._setSinkIds = sinon.spy(() => Promise.resolve())
              return updateSinkIds('ringtone', sinkIds);
            });

            it('should publish a ringtone-devices-set event', () => {
              sinon.assert.calledOnce(publisher.info);
              sinon.assert.calledWith(publisher.info, 'audio', 'ringtone-devices-set',
                { audio_device_ids: sinkIds });
            });
          });
        });
      });
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

/**
 * Create a Capability Token.
 * @param identity
 * @returns A Cap Token JWT.
 */
function createToken(identity: string): string {
  const token = new ClientCapability({
    accountSid: 'AC1234567890123456789012',
    authToken: 'authToken'
  });

  token.addScope(new ClientCapability.OutgoingClientScope({
    applicationSid: 'AP123',
    clientName: identity
  }));

  token.addScope(new ClientCapability.IncomingClientScope(identity));
  return token.toJwt();
}
