import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PreflightTest } from '../../lib/twilio/preflight/preflight';
import Connection from '../../lib/twilio/connection';

const DURATION_PADDING = 1000;
const EVENT_TIMEOUT = 20000;
const MAX_TIMEOUT = 300000;

describe('Preflight Test', function() {
  this.timeout(MAX_TIMEOUT);

  let callerIdentity: string;
  let callerToken: string;
  let callerDevice: any;
  let callerConnection: Connection;
  let receiverIdentity: string;
  let receiverDevice: any;
  let preflight: PreflightTest;

  const expectEvent = (eventName: string, emitter: EventEmitter) => {
    return new Promise((resolve) => emitter.once(eventName, (res) => resolve(res)));
  };

  const waitFor = (promiseOrArray: Promise<any> | Promise<any>[], timeoutMS: number) => {
    let timer: NodeJS.Timer;
    const promise = Array.isArray(promiseOrArray) ? Promise.all(promiseOrArray) : promiseOrArray;
    const timeoutPromise = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out`)), timeoutMS);
    });

    return Promise.race([promise, timeoutPromise]).then(() => clearTimeout(timer));
  };

  const setupDevices = () => {
    receiverIdentity = 'id1-' + Date.now();
    callerIdentity = 'id2-' + Date.now();

    const receiverToken = generateAccessToken(receiverIdentity);
    callerToken = generateAccessToken(callerIdentity);
    receiverDevice = new Device();

    return expectEvent('ready', receiverDevice.setup(receiverToken, { debug: false }));
  };

  const destroyReceiver = () => {
    if (receiverDevice) {
      receiverDevice.disconnectAll();
      receiverDevice.destroy();
    }
  };

  describe('when test finishes', function() {
    before(async () => {
      await setupDevices();
      receiverDevice.on('incoming', (conn: Connection) => {
        conn.accept();
      });
      preflight = Device.testPreflight(callerToken);
      callerDevice = preflight['_device'];

      (callerDevice as any).connectOverride = callerDevice.connect;
      callerDevice.connect = () => {
        return (callerDevice as any).connectOverride({ To: receiverIdentity });
      };
    });

    after(() => {
      destroyReceiver();
    });

    it('should set status to connecting', () => {
      assert.equal(preflight.status, PreflightTest.Status.Connecting);
    });

    it('should emit connected event', () => {
      return waitFor(expectEvent('connected', preflight).then(() => {
        callerConnection = preflight['_connection'];
      }), EVENT_TIMEOUT);
    });

    it('should set status to connected', () => {
      assert.equal(preflight.status, PreflightTest.Status.Connected);
    });

    it('should set default codePreferences', () => {
      assert.deepEqual(callerDevice['options'].codecPreferences, [Connection.Codec.PCMU, Connection.Codec.Opus]);
    });

    it('should emit warning event', () => {
      const name = 'constant-audio-input-level';
      setTimeout(() => {
        callerConnection.emit('warning', name, {});
      }, 5);

      return waitFor(expectEvent('warning', preflight).then(warning => {
        assert.equal(warning, name);
      }), EVENT_TIMEOUT);
    });

    it('should emit sample event', () => {
      return waitFor(expectEvent('sample', preflight), EVENT_TIMEOUT);
    });

    it('should emit completed event', () => {
      setTimeout(() => receiverDevice.disconnectAll(), 10000);
      return waitFor(expectEvent('completed', preflight).then((report: PreflightTest.Report) => {
        assert(!!report);
        assert(!!report.samples.length);
        assert(!!report.warnings.length);
        assert.deepEqual(report, preflight.report);
      }), EVENT_TIMEOUT);
    });

    it('should set status to completed', () => {
      assert.equal(preflight.status, PreflightTest.Status.Completed);
    });
  });

  describe('when using non-default codec options', () => {
    before(async () => {
      await setupDevices();
      receiverDevice.on('incoming', (conn: Connection) => {
        conn.accept();
      });
      preflight = Device.testPreflight(callerToken, {
        codecPreferences: [Connection.Codec.PCMU],
      });
      callerDevice = preflight['_device'];

      (callerDevice as any).connectOverride = callerDevice.connect;
      callerDevice.connect = () => {
        return (callerDevice as any).connectOverride({ To: receiverIdentity });
      };
    });

    after(() => {
      destroyReceiver();
    });

    it('should use codecPreferences passed in', () => {
      assert.deepEqual(callerDevice['options'].codecPreferences, [Connection.Codec.PCMU]);
    });
  });

  describe('when using non-default region options', () => {
    [
      ['gll', 'us1'],
      ['us1', 'us1'],
      ['ie1', 'ie1'],
    ].forEach(([selectedRegion, region]) => {
      describe(selectedRegion, () => {
        let report: PreflightTest.Report | undefined;

        before(async () => {
          await setupDevices();
          receiverDevice.on('incoming', (conn: Connection) => {
            conn.accept();
          });
          preflight = Device.testPreflight(callerToken, {
            region: selectedRegion,
          });
          const waitForReport: Promise<PreflightTest.Report> =
            new Promise(resolve => {
              preflight.on(PreflightTest.Events.Completed, resolve);
            });
          callerDevice = preflight['_device'];

          (callerDevice as any).connectOverride = callerDevice.connect;
          callerDevice.connect = () => {
            return (callerDevice as any).connectOverride({ To: receiverIdentity });
          };

          setTimeout(() => receiverDevice.disconnectAll(), 5000);
          report = await waitForReport;
        });

        after(() => {
          destroyReceiver();
        });

        it('should use region passed in', () => {
          assert.equal(report?.selectedRegion, selectedRegion);
          assert.equal(report?.region, region);
        });
      });
    });
  });

  describe('when test is cancelled', function() {
    const FAIL_DELAY = 1000;
    before(async () => {
      await setupDevices();
      receiverDevice.on('incoming', (conn: Connection) => {
        conn.accept();
      });
      preflight = Device.testPreflight(callerToken);
      callerDevice = preflight['_device'];

      (callerDevice as any).connectOverride = callerDevice.connect;
      callerDevice.connect = () => {
        return (callerDevice as any).connectOverride({ To: receiverIdentity });
      };
    });

    after(() => {
      destroyReceiver();
    });

    it('should emit connected event', () => {
      return waitFor(expectEvent('connected', preflight), EVENT_TIMEOUT);
    });

    it('should emit failed event on cancelled', () => {
      setTimeout(() => {
        preflight.stop();
      }, FAIL_DELAY);
      return waitFor(expectEvent('failed', preflight).then(error => {
        assert.deepEqual(error, {
          code: 31008,
          message: 'Call cancelled',
        });
      }), EVENT_TIMEOUT);
    });

    it('should populate call duration correctly', () => {
      const delta = preflight.endTime! - preflight.startTime;
      console.log(preflight.endTime, preflight.startTime);
      assert(delta >= FAIL_DELAY && delta <= FAIL_DELAY + DURATION_PADDING);
    });
  });

  describe('when fatal error happens', function() {
    const FAIL_DELAY = 500;
    [{
      code: 31000,
      message: 'Signaling disconnected',
    },{
      code: 31003,
      message: 'Ice connection failed'
    }].forEach(error => {
      describe(`code: ${error.code}`, () => {
        before(async () => {
          await setupDevices();
          receiverDevice.on('incoming', (conn: Connection) => {
            conn.accept();
          });
          preflight = Device.testPreflight(callerToken);
          callerDevice = preflight['_device'];

          (callerDevice as any).connectOverride = callerDevice.connect;
          callerDevice.connect = () => {
            return (callerDevice as any).connectOverride({ To: receiverIdentity });
          };
        });

        after(() => {
          destroyReceiver();
        });

        it('should emit connected event', () => {
          return waitFor(expectEvent('connected', preflight), EVENT_TIMEOUT);
        });

        it('should emit failed event on fatal error', () => {
          setTimeout(() => {
            callerDevice.emit('error', error);
          }, FAIL_DELAY);
          return waitFor(expectEvent('failed', preflight).then(emittedError => {
            assert.equal(emittedError, error);
          }), EVENT_TIMEOUT);
        });

        it('should populate call duration correctly', () => {
          const delta = preflight.endTime! - preflight.startTime;
          assert(delta >= FAIL_DELAY && delta <= FAIL_DELAY + DURATION_PADDING);
        });
      });
    });
  });
});
