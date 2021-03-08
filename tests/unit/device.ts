import { levels as LogLevels } from 'loglevel';
import ConnectionType from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { GeneralErrors } from '../../lib/twilio/errors';
import {
  Region,
  regionShortcodes,
  regionToEdge,
} from '../../lib/twilio/regions';

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { SinonFakeTimers, SinonSpy, SinonStubbedInstance } from 'sinon';
import * as sinon from 'sinon';

declare var root: any;

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
  const Connection = (_?: any, _connectOptions?: Record<string, any>) => {
    connectOptions = _connectOptions;
    return activeConnection = createEmitterStub(require('../../lib/twilio/connection').default);
  };
  const PStream = () =>
    pstream = createEmitterStub(require('../../lib/twilio/pstream'));
  const Publisher = () =>
    publisher = createEmitterStub(require('../../lib/twilio/eventpublisher'));
  const Sound = (name: Device.SoundName) =>
    sounds[name] = sinon.createStubInstance(require('../../lib/twilio/sound'));
  const setupOptions: any = { AudioHelper, Connection, PStream, Publisher, Sound };

  afterEach(() => {
    clock.restore();
    root.resetEvents();
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());
    token = createToken('alice');
    device = new Device(setupOptions);
    device.on('error', () => { /* no-op */ });
  });

  describe('constructor', () => {
    it('should set _isUnifiedPlanDefault once', () => {
      Device['_isUnifiedPlanDefault'] = undefined;

      assert.equal(Device['_isUnifiedPlanDefault'], undefined);
      const tempDev1 = new Device();
      assert.notEqual(Device['_isUnifiedPlanDefault'], undefined);

      const isUnifiedPlan = Device['_isUnifiedPlanDefault'];
      Device['_isUnifiedPlanDefault'] = !isUnifiedPlan;
      const tempDev2 = new Device();
      assert.equal(Device['_isUnifiedPlanDefault'], !isUnifiedPlan);
    });

    context('should always call setOptions', () => {
      it('when passed options', () => {
        stub = sinon.createStubInstance(Device);
        Device.prototype.constructor.call(stub, setupOptions);
        sinon.assert.calledOnce(stub.setOptions);
      });

      it('when not passed options', () => {
        stub = sinon.createStubInstance(Device);
        Device.prototype.constructor.call(stub);
        sinon.assert.calledOnce(stub.setOptions);
      });
    });

    it('should set preflight to false by default', () => {
      assert.equal(device['_options'].preflight, false);
    });

    it('should set preflight to false if passed in as false', () => {
      device = new Device({ ...setupOptions, preflight: false });
      assert.equal(device['_options'].preflight, false);
    });

    it('should set preflight to true if passed in as true', () => {
      device = new Device({ ...setupOptions, preflight: true });
      assert.equal(device['_options'].preflight, true);
    });

    it('should set forceAggressiveIceNomination to false by default', () => {
      assert.equal(device['_options'].forceAggressiveIceNomination, false);
    });

    it('should set forceAggressiveIceNomination to false if passed in as false', () => {
      device = new Device({ ...setupOptions, forceAggressiveIceNomination: false });
      assert.equal(device['_options'].forceAggressiveIceNomination, false);
    });

    it('should set forceAggressiveIceNomination to true if passed in as true', () => {
      device = new Device({ ...setupOptions, forceAggressiveIceNomination: true });
      assert.equal(device['_options'].forceAggressiveIceNomination, true);
    });
  });

  context('after Device is registered', () => {
    beforeEach(async () => {
      const registerPromise = device.register(token);
      pstream.emit('ready');
      await registerPromise;
    });

    describe('.activeConnection', () => {
      it('should return undefined if there are no Connections', () => {
        assert.equal(device.activeConnection, undefined);
      });

      it('should return the active Connection if one exists', () => {
        const conn = device.connect();
        assert.equal(device.activeConnection, conn);
        assert.equal(device.activeConnection, activeConnection);
      });
    });

    describe('.connect(params?, audioConstraints?, iceServers?)', () => {
      it('should throw an error if there is already an active connection', () => {
        device.connect();
        assert.throws(() => device.connect(), /A Connection is already active/);
      });

      it('should call ignore on all existing connections', () => {
        const connections: any[] = [];
        for (let i = 0; i < 10; i++) {
          connections.push({ ignore: sinon.spy() });
        }
        device['_connections'] = connections;
        device.connect();
        connections.forEach((conn: any) => sinon.assert.calledOnce(conn.incoming));
        assert.equal(device.connections.length, 0);
      });

      it('should stop playing the incoming sound', () => {
        const spy: any = { stop: sinon.spy() };
        device['_soundcache'].set(Device.SoundName.Incoming, spy);
        device.connect();
        sinon.assert.calledOnce(spy.stop);
      });

      it('should return a Connection', () => {
        assert.equal(device.connect(), activeConnection);
      });

      it('should set .activeConnection', () => {
        assert.equal(device.connect(), device.activeConnection);
      });

      it('should play outgoing sound after accepted if enabled', () => {
        const spy: any = { play: sinon.spy() };
        device['_soundcache'].set(Device.SoundName.Outgoing, spy);
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
        (device as any)['_connections'] = [
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
      it('should clear device._connections', () => {
        (device as any)['_connections'] = [
          { disconnect: () => { } },
          { disconnect: () => { } },
        ];
        device.disconnectAll();
        assert.equal(device.connections.length, 0);
      });

      it('should call disconnect on all connections', () => {
        const disconnect = sinon.spy();
        (device as any)['_connections'] = [
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

    describe('.edge', () => {
      it(`should return 'null' if not connected`, () => {
        assert.equal(device.edge, null);
      });

      // these unit tests will need to be changed for Phase 2 Regional
      context('when the region is mapped to a known edge', () => {
        Object.entries(regionShortcodes).forEach(([fullName, region]: [string, string]) => {
          const preferredEdge = regionToEdge[region as Region];
          it(`should return ${preferredEdge} for ${region}`, () => {
            pstream.emit('connected', { region: fullName });
            assert.equal(device.edge, preferredEdge);
          });
        });
      });

      context('when the region is not mapped to a known edge', () => {
        ['FOO_BAR', ''].forEach((name: string) => {
          it(`should return the region string directly if it's '${name}'`, () => {
            pstream.emit('connected', { region: name });
            assert.equal(device['_region'], name);
          });
        });
      });
    });

    describe('.listen()', () => {
      it('should send a register request with audio: true', () => {
        device.listen(true);
        sinon.assert.calledOnce(pstream.register);
        sinon.assert.calledWith(pstream.register, { audio: true });
      });

      it('should send a register request with audio: false', () => {
        device.listen(false);
        sinon.assert.calledOnce(pstream.register);
        sinon.assert.calledWith(pstream.register, { audio: false });
      });

      it('should start the registration timer', () => {
        device.listen(true);
        sinon.assert.calledOnce(pstream.register);
        clock.tick(30000 + 1);
        sinon.assert.calledTwice(pstream.register);
      });

      it('should stop the registration timer', () => {
        device.listen(false);
        sinon.assert.calledOnce(pstream.register);
        clock.tick(30000 + 1);
        sinon.assert.calledOnce(pstream.register);
      });
    });

    describe('.register()', () => {
      const PStreamMock: any = new (class PStreamMock extends EventEmitter {
        destroy = sinon.stub();
        setToken = sinon.stub();
      })();
      const PStream = sinon.stub().returns(PStreamMock);

      const PublisherStubs = {
        disable: sinon.stub(),
        on: sinon.stub(),
        setToken: sinon.stub(),
      };
      const Publisher = sinon.stub().returns(PublisherStubs);

      const options = { ...setupOptions, PStream, Publisher };

      beforeEach(() => {
        device = new Device(options);
        PStreamMock.removeAllListeners();
        PStream.resetHistory();
        Publisher.resetHistory();
      });

      it('should return a Promise-like', () => {
        const devicePromise = device.register(token);
        assert(typeof devicePromise.then === 'function');
        assert(typeof devicePromise.catch === 'function');
        assert(typeof devicePromise.finally === 'function');
      });

      it('should resolve with the device', async () => {
        const devicePromise = device.register(token);
        PStreamMock.emit('ready');
        const resolvedDevice = await devicePromise;
        assert(resolvedDevice === device);
      });

      it('should create a new stream and publisher', () => {
        device.register(token);

        sinon.assert.calledOnce(PStream);
        sinon.assert.calledWith(PStream, token);

        sinon.assert.calledOnce(Publisher);
        sinon.assert.calledWith(Publisher, 'twilio-js-sdk', token);
      });

      it('should update an existing stream and publisher', () => {
        device.register(token);

        PStream.resetHistory();
        Publisher.resetHistory();

        device.register(token);

        sinon.assert.notCalled(PStream);
        sinon.assert.notCalled(Publisher);

        sinon.assert.calledOnce(PStreamMock.setToken);
        sinon.assert.calledWith(PStreamMock.setToken, token);

        sinon.assert.calledOnce(PublisherStubs.setToken);
        sinon.assert.calledWith(PublisherStubs.setToken, token);
      });

      it('should reconstruct an existing stream if necessary', () => {
        const streamSpy = device['_setupStream'] = sinon.spy();

        device.register(token, { edge: 'ashburn' });

        sinon.assert.calledOnce(streamSpy);
      });

      it('should reconstruct an existing publisher if necessary', () => {
        const publisherSpy = device['_setupPublisher'] = sinon.spy();

        device.register(token, { appName: 'foo' });

        sinon.assert.calledOnce(publisherSpy);
      });

      it('should not reconstruct an existing stream if unnecessary', () => {
        device.register(token);

        const streamSpy = device['_setupStream'] = sinon.spy();

        device.register(token);

        sinon.assert.notCalled(streamSpy);
      });

      it('should not reconstruct an existing publisher if unnecessary', () => {
        device.register(token);

        const publisherSpy = device['_setupPublisher'] = sinon.spy();

        device.register(token);

        sinon.assert.notCalled(publisherSpy);
      });

      describe('should use chunderw regardless', () => {
        it('when it is a string', () => {
          device.register(token, { chunderw: 'foo' } as any);

          sinon.assert.calledOnce(PStream);
          sinon.assert.calledWithExactly(PStream,
            token, ['wss://foo/signal'],
            { backoffMaxMs: undefined });
        });

        it('when it is an array', () => {
          device.register(token, { chunderw: ['foo', 'bar'] } as any);

          sinon.assert.calledOnce(PStream);
          sinon.assert.calledWithExactly(PStream,
            token, ['wss://foo/signal', 'wss://bar/signal'],
            { backoffMaxMs: undefined });
        });
      });

      it('should use default chunder uri if no region or edge is passed in', () => {
        device.register(token, { edge: 'singapore' });

        PStream.resetHistory();

        device.register(token);

        sinon.assert.calledOnce(PStream);
        sinon.assert.calledWithExactly(PStream,
          token, ['wss://chunderw-vpc-gll.twilio.com/signal'],
          { backoffMaxMs: undefined });
      });

      it('should use correct edge if only one is supplied', () => {
        device.register(token, { edge: 'singapore' });

        sinon.assert.calledOnce(PStream);
        sinon.assert.calledWithExactly(PStream,
          token, ['wss://chunderw-vpc-gll-sg1.twilio.com/signal'],
          { backoffMaxMs: undefined });
      });

      it('should use correct edges if more than one is supplied', () => {
        device.register(token, { edge: ['singapore', 'sydney'] });

        sinon.assert.calledOnce(PStream);
        sinon.assert.calledWithExactly(PStream, token, [
          'wss://chunderw-vpc-gll-sg1.twilio.com/signal',
          'wss://chunderw-vpc-gll-au1.twilio.com/signal',
        ], { backoffMaxMs: undefined });
      });
    });

    describe('.setOptions()', () => {
      it('should set up an audio helper', () => {
        const spy = device['_setupAudioHelper'] = sinon.spy(device['_setupAudioHelper']);
        device.setOptions({});
        sinon.assert.calledOnce(spy);
      });

      describe('log', () => {
        let setDefaultLevelStub: any;

        beforeEach(() => {
          setDefaultLevelStub = sinon.stub();
        });

        Object.entries(LogLevels).forEach(([level, number]) => {
          it(`should set log level to '${level}'`, () => {
            device['_log'].setDefaultLevel = setDefaultLevelStub;
            device.setOptions({ logLevel: number });
            sinon.assert.calledWith(setDefaultLevelStub, number);
          });
        });
      });
    });

    describe('._setupAudioHelper()', () => {
      it('should destroy an existing audio helper', () => {
        const spy = device['_destroyAudioHelper'] = sinon.spy(device['_destroyAudioHelper']);
        device.setOptions({});
        sinon.assert.calledOnce(spy);
      });
    });

    describe('.status()', () => {
      it('should return offline before registering', () => {
        device = new Device(setupOptions);
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
        activeConnection['_mediaHandler'] = { _onInputDevicesChanged: spy };
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
        assert.equal(device['_stream'], null);
      });
    });

    describe('on signaling.connected', () => {
      it('should update region', () => {
        pstream.emit('connected', { region: 'EU_IRELAND' });
        assert.equal(device['_region'], regionShortcodes.EU_IRELAND);
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
        sinon.assert.calledWith(device.emit as any, 'error', twilioError);
      });

      it('should emit Device.error with connection if payload.callsid is present', () => {
        pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
        const conn = device.connections[0];
        conn.parameters = { CallSid: 'foo' };
        device.emit = sinon.spy();
        pstream.emit('error', { error: { twilioError }, callsid: 'foo' });
        sinon.assert.calledOnce(device.emit as any);
        sinon.assert.calledWith(device.emit as any, 'error', twilioError, conn);
      });

      it('should not stop registrations if code is not 31205', () => {
        device.listen(true);
        pstream.emit('error', { error: { } });
        pstream.register.reset();
        clock.tick(30000 + 1);
        sinon.assert.called(pstream.register);
      });

      it('should stop registrations if code is 31205', () => {
        device.listen(true);
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
        device['_soundcache'].set(Device.SoundName.Incoming, spy);
        pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
        sinon.assert.calledOnce(spy.play);
      });

      context('when allowIncomingWhileBusy is true', () => {
        beforeEach(async () => {
          device = new Device({ ...setupOptions, allowIncomingWhileBusy: true });
          const registerPromise = device.register(token);
          pstream.emit('ready');
          await registerPromise;
          device.connect();
        });

        it('should create a new connection', () => {
          pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
          assert.equal(device.connections.length, 1);
          assert.notEqual(device.connections[0], device.activeConnection);
        });

        it('should not play the incoming sound', () => {
          const spy = { play: sinon.spy() };
          device['_soundcache'].set(Device.SoundName.Incoming, spy);
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

      it(`should set Device edge to 'null'`, () => {
        pstream.emit('offline');
        assert.equal(device.edge, null);
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

    describe('on unload or pagehide', () => {
      it('should call destroy once on pagehide', () => {
        stub = sinon.createStubInstance(Device);
        Device.prototype.constructor.call(stub);
        root.window.dispatchEvent('pagehide');
        sinon.assert.calledOnce(stub.destroy);
      });

      it('should call destroy once on unload', () => {
        stub = sinon.createStubInstance(Device);
        Device.prototype.constructor.call(stub);
        root.window.dispatchEvent('unload');
        sinon.assert.calledOnce(stub.destroy);
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
          assert.equal(conn, device.activeConnection);
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
          device['_soundcache'].set(Device.SoundName.Outgoing, spy);
          device.connections[0].emit('accept');
          sinon.assert.notCalled(spy.play);
        });
      });

      describe('on connection.error', () => {
        it('should should remove the connection if closed', () => {
          device.connections[0].status = () => ConnectionType.State.Closed;
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
          device.connections[0].status = () => ConnectionType.State.Pending;
          device.connections[0].emit('transportClose');
          assert.equal(device.connections.length, 0);
        });
        it('should not remove the connection if the connection was open', () => {
          device.connections[0].status = () => ConnectionType.State.Open;
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
          conn.emit('accept');
          assert.equal(typeof conn, 'object');
          assert.equal(conn, device.activeConnection);

          conn.emit('disconnect');
          assert.equal(device.activeConnection, null);
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
