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

// tslint:disable max-classes-per-file only-arrow-functions no-empty

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
  const PStream = sinon.spy((...args: any[]) =>
    pstream = createEmitterStub(require('../../lib/twilio/pstream')));
  const Publisher = sinon.spy((...args: any[]) =>
    publisher = createEmitterStub(require('../../lib/twilio/eventpublisher')));
  const Sound = (name: Device.SoundName) =>
    sounds[name] = sinon.createStubInstance(require('../../lib/twilio/sound'));
  const setupOptions: any = { AudioHelper, Connection, PStream, Publisher, Sound };

  afterEach(() => {
    clock.restore();
    root.resetEvents();

    PStream.resetHistory();
    Publisher.resetHistory();
  });

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());
    token = createToken('alice');
    device = new Device(token, setupOptions);
    device.on('error', () => { /* no-op */ });
  });

  describe('constructor', () => {
    it('should set _isUnifiedPlanDefault once', () => {
      Device['_isUnifiedPlanDefault'] = undefined;

      assert.equal(Device['_isUnifiedPlanDefault'], undefined);
      const tempDev1 = new Device(token);
      assert.notEqual(Device['_isUnifiedPlanDefault'], undefined);

      const isUnifiedPlan = Device['_isUnifiedPlanDefault'];
      Device['_isUnifiedPlanDefault'] = !isUnifiedPlan;
      const tempDev2 = new Device(token);
      assert.equal(Device['_isUnifiedPlanDefault'], !isUnifiedPlan);
    });

    describe('should always call updateOptions', () => {
      it('when passed options', () => {
        stub = sinon.createStubInstance(Device);
        Device.prototype.constructor.call(stub, token, setupOptions);
        sinon.assert.calledOnce(stub.updateOptions);
      });

      it('when not passed options', () => {
        stub = sinon.createStubInstance(Device);
        Device.prototype.constructor.call(stub, token);
        sinon.assert.calledOnce(stub.updateOptions);
      });
    });

    it('should set preflight to false by default', () => {
      assert.equal(device['_options'].preflight, false);
    });

    it('should set preflight to false if passed in as false', () => {
      device = new Device(token, { ...setupOptions, preflight: false });
      assert.equal(device['_options'].preflight, false);
    });

    it('should set preflight to true if passed in as true', () => {
      device = new Device(token, { ...setupOptions, preflight: true });
      assert.equal(device['_options'].preflight, true);
    });

    it('should set forceAggressiveIceNomination to false by default', () => {
      assert.equal(device['_options'].forceAggressiveIceNomination, false);
    });

    it('should set forceAggressiveIceNomination to false if passed in as false', () => {
      device = new Device(token, { ...setupOptions, forceAggressiveIceNomination: false });
      assert.equal(device['_options'].forceAggressiveIceNomination, false);
    });

    it('should set forceAggressiveIceNomination to true if passed in as true', () => {
      device = new Device(token, { ...setupOptions, forceAggressiveIceNomination: true });
      assert.equal(device['_options'].forceAggressiveIceNomination, true);
    });

    it('should throw if the token is an invalid type', () => {
      assert.throws(() => new Device(null as any), /Parameter "token" must be of type "string"./);
    });
  });

  describe('after Device is constructed', () => {
    it('should create a publisher', () => {
      assert(device['_publisher']);
    });

    describe('after the Device has been connected to signaling', () => {
      beforeEach(async () => {
        const setupPromise = device['_setupStream']();
        pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
        await setupPromise;
      });

      describe('.activeConnection', () => {
        it('should return "null" if there is no active Connection', () => {
          assert.equal(device.activeConnection, null);
        });

        it('should return the active Connection if one exists', async () => {
          const conn = await device.connect();
          assert.equal(device.activeConnection, conn);
          assert.equal(device.activeConnection, activeConnection);
        });
      });

      describe('.connect(params?, audioConstraints?, iceServers?)', () => {
        it('should reject if there is already an active connection', async () => {
          await device.connect();
          await assert.rejects(() => device.connect(), /A Connection is already active/);
        });

        it('should call ignore on all existing connections', async () => {
          const connections: any[] = [];
          for (let i = 0; i < 10; i++) {
            connections.push({ ignore: sinon.spy() });
          }
          device['_connections'] = connections;
          await device.connect();
          connections.forEach((conn: any) => sinon.assert.calledOnce(conn.ignore));
          assert.equal(device.connections.length, 0);
        });

        it('should not set up a signaling connection if unnecessary', async () => {
          await device.connect();
          sinon.assert.calledOnce(PStream);
        });

        it('should stop playing the incoming sound', async () => {
          const spy: any = { stop: sinon.spy() };
          device['_soundcache'].set(Device.SoundName.Incoming, spy);
          await device.connect();
          sinon.assert.calledOnce(spy.stop);
        });

        it('should return a Connection', async () => {
          assert.equal(await device.connect(), activeConnection);
        });

        it('should set .activeConnection', async () => {
          assert.equal(await device.connect(), device.activeConnection);
        });

        it('should play outgoing sound after accepted if enabled', async () => {
          const spy: any = { play: sinon.spy() };
          device['_soundcache'].set(Device.SoundName.Outgoing, spy);
          await device.connect();
          activeConnection._direction = 'OUTGOING';
          activeConnection.emit('accept');
          sinon.assert.calledOnce(spy.play);
        });
      });

      describe('.destroy()', () => {
        it('should destroy .stream if one exists', () => {
          device.destroy();
          sinon.assert.calledOnce(pstream.destroy);
        });

        it('should stop sending registrations', () => {
          pstream.register.resetHistory();

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

        it('should disconnect active connection', async () => {
          const conn: any = await device.connect();
          device.destroy();
          sinon.assert.calledOnce(conn.disconnect);
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

        it('should call disconnect on the active connection', async () => {
          const conn: any = await device.connect();
          device.disconnectAll();
          sinon.assert.calledOnce(conn.disconnect);
        });
      });

      describe('.edge', () => {
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

      describe('.register()', () => {
        it('should not set up a signaling connection if unnecessary', async () => {
          await device.register();
          sinon.assert.calledOnce(PStream);
        });

        it('should set state to "registered" immediately', async () => {
          await device.register();
          assert.equal(device.state, Device.State.Registered);
        });

        it('should send a register request with audio: true', async () => {
          await device.register();
          sinon.assert.calledOnce(pstream.register);
          sinon.assert.calledWith(pstream.register, { audio: true });
        });

        it('should start the registration timer', async () => {
          await device.register();
          sinon.assert.calledOnce(pstream.register);
          await clock.tickAsync(30000 + 1);
          sinon.assert.calledTwice(pstream.register);
        });
      });

      describe('.state', () => {
        it('should return "registered" after registering', async () => {
          await device.register();
          assert.equal(device.state, Device.State.Registered);
        });
      });

      describe('.unregister()', () => {
        beforeEach(async () => {
          await device.register();
          pstream.register.resetHistory();
        });

        it('should send a register request with audio: false', async () => {
          await device.unregister();
          sinon.assert.calledOnce(pstream.register);
          sinon.assert.calledWith(pstream.register, { audio: false });
        });

        it('should stop the registration timer', async () => {
          await device.unregister();
          sinon.assert.calledOnce(pstream.register);
          await clock.tickAsync(30000 + 1);
          sinon.assert.calledOnce(pstream.register);
        });
      });

      describe('.updateOptions()', () => {
        it('should set up an audio helper', () => {
          const spy = device['_setupAudioHelper'] = sinon.spy(device['_setupAudioHelper']);
          device.updateOptions({});
          sinon.assert.calledOnce(spy);
        });

        it('should reconstruct an existing stream if necessary', async () => {
          const regPromise = device.register();
          pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
          await regPromise;

          const setupStreamSpy = device['_setupStream'] = sinon.spy(device['_setupStream']);
          device.updateOptions({ edge: 'ashburn' });
          sinon.assert.calledOnce(setupStreamSpy);
        });

        describe('log', () => {
          let setDefaultLevelStub: any;

          beforeEach(() => {
            setDefaultLevelStub = sinon.stub();
          });

          Object.entries(LogLevels).forEach(([level, number]) => {
            it(`should set log level to '${level}'`, () => {
              device['_log'].setDefaultLevel = setDefaultLevelStub;
              device.updateOptions({ logLevel: number });
              sinon.assert.calledWith(setDefaultLevelStub, number);
            });
          });
        });
      });

      describe('.updateToken()', () => {
        it('should update the tokens for an existing stream and publisher', () => {
          const newToken = 'foobar-token';

          device.updateToken(newToken);

          sinon.assert.calledOnce(pstream.setToken);
          sinon.assert.calledWith(pstream.setToken, newToken);

          sinon.assert.calledOnce(publisher.setToken);
          sinon.assert.calledWith(publisher.setToken, newToken);
        });
      });

      describe('on device change', () => {
        it('should call _onInputDevicesChanges on the active Connection', async () => {
          await device.connect();
          const spy: SinonSpy = sinon.spy();
          activeConnection['_mediaHandler'] = { _onInputDevicesChanged: spy };
          device.audio && device.audio.emit('deviceChange', []);
          sinon.assert.calledOnce(spy);
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

        it('should emit Device.error with connection if payload.callsid is present', async () => {
          pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
          await clock.tickAsync(0);
          const conn = device.connections[0];
          conn.parameters = { CallSid: 'foo' };
          device.emit = sinon.spy();
          pstream.emit('error', { error: { twilioError }, callsid: 'foo' });
          sinon.assert.calledOnce(device.emit as any);
          sinon.assert.calledWith(device.emit as any, 'error', twilioError, conn);
        });

        it('should not stop registrations if code is not 31205', async () => {
          await device.register();
          pstream.emit('error', { error: { } });
          pstream.register.reset();
          await clock.tickAsync(30000 + 1);
          sinon.assert.called(pstream.register);
        });

        it('should stop registrations if code is 31205', async () => {
          await device.register();
          pstream.emit('error', { error: { code: 31205 } });
          pstream.register.reset();
          await clock.tickAsync(30000 + 1);
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
        it('should not create a new connection if already on an active call', async () => {
          await device.connect();
          pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
          await clock.tickAsync(0);
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
          beforeEach(async () => {
            pstream.emit('invite', { callsid: 'foo', sdp: 'bar', parameters: { Params: 'foo=bar' } });
            await clock.tickAsync(0);
          });

          it('should not create a new connection if not on an active call and payload is valid', () => {
            assert.equal(device.connections.length, 1);
          });

          it('should pass the custom parameters to the new connection', () => {
            assert.deepEqual(connectOptions && connectOptions.twimlParams, { foo: 'bar' });
          });
        });

        it('should play the incoming sound', async () => {
          const spy = { play: sinon.spy() };
          device['_soundcache'].set(Device.SoundName.Incoming, spy);
          pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
          await clock.tickAsync(0);
          sinon.assert.calledOnce(spy.play);
        });

        context('when allowIncomingWhileBusy is true', () => {
          beforeEach(async () => {
            device = new Device(token, { ...setupOptions, allowIncomingWhileBusy: true });
            const setupPromise = device['_setupStream']();
            pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
            await setupPromise;
            await device.connect();
          });

          it('should create a new connection', async () => {
            pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
            await clock.tickAsync(0);
            assert.equal(device.connections.length, 1);
            assert.notEqual(device.connections[0], device.activeConnection);
          });

          it('should not play the incoming sound', async () => {
            const spy = { play: sinon.spy() };
            device['_soundcache'].set(Device.SoundName.Incoming, spy);
            pstream.emit('invite', { callsid: 'foo', sdp: 'bar' });
            await clock.tickAsync(0);
            sinon.assert.notCalled(spy.play);
          });
        });
      });

      describe('on signaling.offline', () => {
        it('should set "Device.state" to "Device.State.Unregistered"', () => {
          pstream.emit('offline');
          assert.equal(device.state, Device.State.Unregistered);
        });

        it(`should set Device edge to 'null'`, () => {
          pstream.emit('offline');
          assert.equal(device.edge, null);
        });

        it('should emit Device.EventName.Unregistered', () => {
          device.emit = sinon.spy();
          pstream.emit('offline');
          sinon.assert.calledOnce(device.emit as any);
          sinon.assert.calledWith(device.emit as any, Device.EventName.Unregistered);
        });
      });

      // TODO, do we want to get rid of this?
      describe.skip('on signaling.ready', () => {
        it('should emit Device.ready', () => {
          device.emit = sinon.spy();
          pstream.emit('ready');
          sinon.assert.calledOnce(device.emit as any);
          sinon.assert.calledWith(device.emit as any, 'ready');
        });
      });

      describe('on event subscriptions coming from connection', () => {
        let connection: any;

        beforeEach(async () => {
          const incomingPromise = new Promise(resolve =>
            device.once(Device.EventName.Incoming, () => {
              device.connections[0].parameters = { };
              connection = device.connections[0];
              resolve();
            }),
          );

          pstream.emit('invite', {
            callsid: 'CA1234',
            sdp: 'foobar',
          });

          await incomingPromise;
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

      describe('with a pending incoming call', () => {
        beforeEach(async () => {
          const incomingPromise = new Promise(resolve =>
            device.once(Device.EventName.Incoming, () => {
              device.emit = sinon.spy();
              device.connections[0].parameters = { };
              resolve();
            }),
          );

          pstream.emit('invite', {
            callsid: 'CA1234',
            sdp: 'foobar',
          });

          await incomingPromise;
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
          it('should reject if a connection is active and input stream is null', async () => {
            await device.connect();

            return updateInputStream(null).then(
              () => { throw new Error('Expected rejection'); },
              () => { });
          });

          it('should return a resolved Promise if there is no active connection', () => {
            return updateInputStream(null);
          });

          it('should call the connection._setInputTracksFromStream', async () => {
            const info = { id: 'default', label: 'default' };
            await device.connect();
            activeConnection._setInputTracksFromStream = sinon.spy(() => Promise.resolve());
            return updateInputStream(info).then(() => {
              sinon.assert.calledOnce(activeConnection._setInputTracksFromStream);
              sinon.assert.calledWith(activeConnection._setInputTracksFromStream, info);
            });
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

            it('should call _setSinkIds on the active connection', async () => {
              await device.connect();
              const sinkIds = ['default'];
              activeConnection._setSinkIds = sinon.spy(() => Promise.resolve());
              updateSinkIds('speaker', sinkIds);
              sinon.assert.calledOnce(activeConnection._setSinkIds);
              sinon.assert.calledWith(activeConnection._setSinkIds, sinkIds);
            });

            context('if successful', () => {
              let sinkIds: string[];
              beforeEach(async () => {
                await device.connect();
                sinkIds = ['default'];
                activeConnection._setSinkIds = sinon.spy(() => Promise.resolve());
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
              beforeEach(async () => {
                await device.connect();
                sinkIds = ['default'];
                activeConnection._setSinkIds = sinon.spy(() => Promise.reject(new Error('foo')));
                return updateSinkIds('speaker', sinkIds).then(
                  () => { throw Error('Expected a rejection'); },
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
              beforeEach(async () => {
                await device.connect();
                sinkIds = ['default'];
                activeConnection._setSinkIds = sinon.spy(() => Promise.resolve());
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

    describe('before the Device has been connected to signaling', () => {
      it('should lazy create a signaling connection', () => {
        assert.equal(device['_stream'], null);
      });

      describe('.connect(params?, audioConstraints?, iceServers?)', () => {
        it('should set up a signaling connection if necessary', () => {
          device.connect();
          sinon.assert.calledOnce(PStream);
          sinon.assert.calledWith(PStream, token);
        });

        it('should not set the active connection until the stream resolves', async () => {
          const connectPromise = device.connect();
          assert.equal(device.activeConnection, null);
          pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
          await connectPromise;
          assert(device.activeConnection);
        });
      });

      describe('.edge', () => {
        it(`should return 'null' if not connected`, () => {
          assert.equal(device.edge, null);
        });
      });

      describe('.register()', () => {
        it('should set up a signaling connection if necessary', () => {
          device.register();
          sinon.assert.calledOnce(PStream);
          sinon.assert.calledWith(PStream, token);
        });

        it('should set state to "registering" until the stream resolves', () => {
          device.register();
          assert.equal(device.state, Device.State.Registering);
        });

        it('should set state to "registered" after the stream resolves', async () => {
          const regPromise = device.register();
          pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
          await regPromise;
          assert.equal(device.state, Device.State.Registered);
        });
      });

      describe('.updateToken()', () => {
        it('should set the token', () => {
          const newToken = 'foobar-token';
          device.updateToken(newToken);
          assert.equal(device.token, newToken);
        });
      });
    });

    describe('when creating a signaling connection', () => {
      describe('should use chunderw regardless', () => {
        it('when it is a string', async () => {
          device = new Device(token, { ...setupOptions, chunderw: 'foo' });

          const setupPromise = device['_setupStream']();
          pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
          await setupPromise;

          sinon.assert.calledOnce(PStream);
          sinon.assert.calledWithExactly(PStream,
            token, ['wss://foo/signal'],
            { backoffMaxMs: undefined });
        });

        it('when it is an array', async () => {
          device = new Device(token, { ...setupOptions, chunderw: ['foo', 'bar'] });

          const setupPromise = device['_setupStream']();
          pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
          await setupPromise;

          sinon.assert.calledOnce(PStream);
          sinon.assert.calledWithExactly(PStream,
            token, ['wss://foo/signal', 'wss://bar/signal'],
            { backoffMaxMs: undefined });
        });
      });

      it('should use default chunder uri if no region or edge is passed in', async () => {
        device = new Device(token, setupOptions);

        const setupPromise = device['_setupStream']();
        pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
        await setupPromise;

        sinon.assert.calledOnce(PStream);
        sinon.assert.calledWithExactly(PStream,
          token, ['wss://chunderw-vpc-gll.twilio.com/signal'],
          { backoffMaxMs: undefined });
      });

      it('should use correct edge if only one is supplied', async () => {
        device = new Device(token, { ...setupOptions, edge: 'singapore' });

        const setupPromise = device['_setupStream']();
        pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
        await setupPromise;

        sinon.assert.calledOnce(PStream);
        sinon.assert.calledWithExactly(PStream,
          token, ['wss://chunderw-vpc-gll-sg1.twilio.com/signal'],
          { backoffMaxMs: undefined });
      });

      it('should use correct edges if more than one is supplied', async () => {
        device = new Device(token, { ...setupOptions, edge: ['singapore', 'sydney'] });

        const setupPromise = device['_setupStream']();
        pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
        await setupPromise;

        sinon.assert.calledOnce(PStream);
        sinon.assert.calledWithExactly(PStream, token, [
          'wss://chunderw-vpc-gll-sg1.twilio.com/signal',
          'wss://chunderw-vpc-gll-au1.twilio.com/signal',
        ], { backoffMaxMs: undefined });
      });

      describe('.updateOptions()', () => {
        it('should not create a stream', async () => {
          const setupSpy = device['_setupStream'] = sinon.spy(device['_setupStream']);
          device.updateOptions();
          await new Promise(resolve => {
            sinon.assert.notCalled(setupSpy);
            resolve();
          });
        });
      });
    });

    describe('signaling agnostic', () => {
      [{
        afterEachHook: () => async () => {
          sinon.assert.calledOnce(PStream);
        },
        beforeEachHook: () => async () => {
          const setupPromise = device['_setupStream']();
          pstream.emit('connected', { region: 'US_EAST_VIRGINIA' });
          await setupPromise;
        },
        title: 'signaling connected',
      }, {
        afterEachHook: async () => {},
        beforeEachHook: async () => {},
        title: 'signaling not connected',
      }].forEach(({ afterEachHook, beforeEachHook, title }) => {
        describe(title, () => {
          beforeEach(beforeEachHook);

          afterEach(afterEachHook);

          describe('._setupAudioHelper()', () => {
            it('should destroy an existing audio helper', () => {
              const spy = device['_destroyAudioHelper'] = sinon.spy(device['_destroyAudioHelper']);
              device['_setupAudioHelper']();
              sinon.assert.calledOnce(spy);
            });
          });

          describe('.state', () => {
            it('should return "unregistered" before registering', () => {
              assert.equal(device.state, Device.State.Unregistered);
            });
          });

          describe('on device change', () => {
            it('should publish a device-change event', () => {
              device.audio && device.audio.emit('deviceChange', [{ deviceId: 'foo' }]);
              sinon.assert.calledOnce(publisher.info);
              sinon.assert.calledWith(publisher.info, 'audio', 'device-change', {
                lost_active_device_ids: ['foo'],
              });
            });
          });

          describe('createDefaultPayload', () => {
            xit('should be tested', () => {
              // This should be moved somewhere that it can be tested. This is currently:
              // A) Internal to Device where it can't easily be tested and
              // B) Reaching into Connection, causing a weird coupling.
            });
          });

          describe('on unload or pagehide', () => {
            it('should call destroy once on pagehide', () => {
              stub = sinon.createStubInstance(Device);
              Device.prototype.constructor.call(stub, token);
              root.window.dispatchEvent('pagehide');
              sinon.assert.calledOnce(stub.destroy);
            });

            it('should call destroy once on unload', () => {
              stub = sinon.createStubInstance(Device);
              Device.prototype.constructor.call(stub, token);
              root.window.dispatchEvent('unload');
              sinon.assert.calledOnce(stub.destroy);
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
    authToken: 'authToken',
  });

  token.addScope(new ClientCapability.OutgoingClientScope({
    applicationSid: 'AP123',
    clientName: identity,
  }));

  token.addScope(new ClientCapability.IncomingClientScope(identity));
  return token.toJwt();
}
