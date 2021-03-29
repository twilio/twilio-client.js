import * as assert from 'assert';
import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import { expectEvent, isFirefox } from '../lib/util';

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

  let highDelayEdge: string;
  let lowDelayEdge: string;

  const setupDevices = () => {
    identity1 = 'id1-' + Date.now();
    identity2 = 'id2-' + Date.now();
    const token1 = generateAccessToken(identity1);
    const token2 = generateAccessToken(identity2);

    device1 = new Device(token1, device1Options);
    device2 = new Device(token2, device2Options);

    const devicePromises = Promise.all([
      expectEvent(Device.EventName.Registered, device1),
      expectEvent(Device.EventName.Registered, device2),
    ]);

    device1.register();
    device2.register();

    return devicePromises;
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

    // We don't currently expose ice connection state changes.
    // Let's hook to makeConnection and subscribe to events
    const makeConnection = device['_makeConnection'].bind(device);
    (device['_makeConnection'] as any) = (...params: any) => {
      const conn = makeConnection(...params);
      conn['_mediaHandler'].oniceconnectionstatechange = (state: string) => {
        if (state === 'checking') {
          start = Date.now();
        }
      };
      conn['_mediaHandler'].onpcconnectionstatechange = (state: string) => {
        if (state === 'connected') {
          const duration = Date.now() - start;
          resolve(duration);
        }
      };
      return conn;
    };

    device1.connect({ params: { To: identity2 } });
    const conn2 = await expectEvent('incoming', device2);

    conn2.accept();
  });

  before(async () => {
    console.log('Measuring delays for each region...');
    const durations: number[] = [];
    const edges = ['sydney', 'sao-paulo', 'dublin', 'tokyo', 'singapore', 'ashburn'];

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      device2Options.edge = edge;
      await setupDevices();

      const duration = await getConnectionDuration(Connection.CallDirection.Incoming);
      durations.push(duration);
      destroyDevices();

      console.log(`${edge}: ${duration}`);
    }
    delete device2Options.edge;

    lowDelayEdge = edges[durations.indexOf(Math.min(...durations))];
    highDelayEdge = edges[durations.indexOf(Math.max(...durations))];

    console.log(JSON.stringify({ lowDelayEdge, highDelayEdge }, null, 2));
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

      it('should not have a significant dtls handshake delay when using low-delay region and aggressive nomination is false', async () => {
        deviceOptions.edge = lowDelayEdge;
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration < CONNECTION_DELAY_THRESHOLD);
        });
      });

      it('should not have a significant dtls handshake delay when using low-delay region and aggressive nomination is true', async () => {
        deviceOptions.edge = lowDelayEdge;
        deviceOptions.forceAggressiveIceNomination = true;
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration < CONNECTION_DELAY_THRESHOLD);
        });
      });

      // These two tests are flaky. Disable for now. We need to re-run/update them once media server deploys a fix.
      it.skip('should have a significant dtls handshake delay when using high-delay region and aggressive nomination is false', async () => {
        deviceOptions.edge = highDelayEdge;
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration > CONNECTION_DELAY_THRESHOLD);
        });
      });
      it.skip('should not have a significant dtls handshake delay when using high-delay region and aggressive nomination is true', async () => {
        deviceOptions.edge = highDelayEdge;
        deviceOptions.forceAggressiveIceNomination = true;
        await setupDevices();
        await getConnectionDuration(direction).then(duration => {
          assert(duration < CONNECTION_DELAY_THRESHOLD);
        });
      });
    });
  });
});
