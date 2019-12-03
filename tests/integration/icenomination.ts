import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import { expectEvent, isFirefox } from '../lib/util';
import * as assert from 'assert';

const CONNECTION_DELAY_THRESHOLD = 1000;
const SUITE_TIMEOUT = 20000;
const MAX_TIMEOUT = 300000;

const maybeSkip = isFirefox() ? describe.skip : describe;

maybeSkip('ICE Nomination', function() {
  this.timeout(MAX_TIMEOUT);

  let device1: Device;
  let device2: Device;
  let identity1: string;
  let identity2: string;
  let device1Options: Device.Options = {};
  let device2Options: Device.Options = {};

  const defaultOptions: Device.Options = {
    warnings: false,
    debug: false,
  };

  const setupDevices = () => {
    identity1 = 'id1-' + Date.now();
    identity2 = 'id2-' + Date.now();
    const token1 = generateAccessToken(identity1);
    const token2 = generateAccessToken(identity2);
    device1 = new Device();
    device2 = new Device();

    return Promise.all([
      expectEvent('ready', device1.setup(token1, Object.assign({}, defaultOptions, device1Options))),
      expectEvent('ready', device2.setup(token2, Object.assign({}, defaultOptions, device2Options))),
    ]);
  };

  const destroyDevices = () => {
    if (device1) {
      device1.disconnectAll();
      device1.destroy();
    }

    if (device2) {
      device2.disconnectAll();
      device2.destroy();
    }
  };

  const getConnectionDuration = (direction: Connection.CallDirection): Promise<number> => new Promise(async (resolve) => {
    let start: number;
    let device = device1;

    if (direction === Connection.CallDirection.Incoming) {
      device = device2;
    }
    
    // We don't currently expose icegathering state changes.
    // Let's hook to makeConnection and subscribe to events
    const makeConnection = device['_makeConnection'].bind(device);
    (device['_makeConnection'] as any) = (...params: any) => {
      const conn = makeConnection(...params);
      conn.mediaStream.onicegatheringstatechange = (state: string) => {
        if (state === 'gathering') {
          start = Date.now();
        }
      };
      conn.mediaStream.onpcconnectionstatechange = (state: string) => {
        if (state === 'connected') {
          const duration = Date.now() - start;
          resolve(duration);
        }
      };
      return conn;
    };

    device1.connect({ To: identity2 });
    const conn2 = await expectEvent('incoming', device2);

    conn2.accept();
  });

  [Connection.CallDirection.Incoming, Connection.CallDirection.Outgoing].forEach(direction => {
    describe(`for ${direction} calls`, function() {
      this.timeout(SUITE_TIMEOUT);
  
      let deviceOptions: Device.Options;
  
      beforeEach(() => {
        deviceOptions = direction === Connection.CallDirection.Outgoing ? device1Options : device2Options;
      });
  
      afterEach(() => {
        device1Options = {};
        device2Options = {};
        destroyDevices();
      });
  
      it('should not have dtls handshake delay if region is us1 and aggressive nomination is false', async () => {
        deviceOptions.region = 'us1';
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration < CONNECTION_DELAY_THRESHOLD);
        });
      });
  
      it('should not have dtls handshake delay if region is us1 and aggressive nomination is true', async () => {
        deviceOptions.region = 'us1';
        deviceOptions.forceAggressiveIceNomination = true;
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration < CONNECTION_DELAY_THRESHOLD);
        });
      });
  
      it('should have dtls handshake delay if region is sg1 and aggressive nomination is false', async () => {
        deviceOptions.region = 'sg1';
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration > CONNECTION_DELAY_THRESHOLD);
        });
      });
  
      it('should not have dtls handshake delay if region is sg1 and aggressive nomination is true', async () => {
        deviceOptions.region = 'sg1';
        deviceOptions.forceAggressiveIceNomination = true;
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration < CONNECTION_DELAY_THRESHOLD);
        });
      });
    });
  });
});
