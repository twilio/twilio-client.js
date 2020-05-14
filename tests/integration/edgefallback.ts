import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import { expectEvent, runDockerCommand, waitFor } from '../lib/util';
import * as assert from 'assert';

const MAX_TIMEOUT = 300000;
const EVENT_TIMEOUT = 50000;

describe('Edge Fallback', function() {
  this.timeout(MAX_TIMEOUT);

  let device: any;
  let identity: string;
  let token: string;

  const pause = (delay = 0) => new Promise(r => setTimeout(r, delay));

  const defaultOptions: Device.Options = {
    warnings: false,
    debug: false,
  };

  const deviceReady = async () => {
    await waitFor(expectEvent('ready', device), EVENT_TIMEOUT);
  };

  beforeEach(() => {
    identity = 'id1-' + Date.now();
    token = generateAccessToken(identity);
    device = new Device();
  });

  afterEach(() => {
    if (device) {
      device.disconnectAll();
      device.destroy();
    }
  });

  it('should connect to sg1 if region param is sg1', async () => {
    device.setup(token, Object.assign({}, defaultOptions, { region: 'sg1' }));
    await deviceReady();
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-sg1.twilio.com/signal');
  });

  it('should connect to sg1 if edge param is a string and is equal to singapore', async () => {
    device.setup(token, Object.assign({}, defaultOptions, { edge: 'singapore' }));
    await deviceReady();
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-sg1.twilio.com/signal');
  });

  it('should connect to the first edge if edge param is an array', async () => {
    device.setup(token, Object.assign({}, defaultOptions, { edge: ['sydney', 'singapore'] }));
    await deviceReady();
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
  });

  it('should use new uri format if the edge supplied is not in the list of supported edges', async () => {
    device.setup(token, Object.assign({}, defaultOptions, { edge: 'foo' }));
    await pause(1000);
    assert.equal(device.stream.transport.uri, 'wss://voice-js.foo.twilio.com/signal');
  });

  it('should fallback to the next edge value if the current region is down', async () => {
    device.setup(token, Object.assign({}, defaultOptions, { edge: ['foo', 'bar', 'ashburn'] }));
    await deviceReady();
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-us1.twilio.com/signal');
  });

  it('should not fallback to the next edge if the transport error is not fallback-able', async () => {
    device.setup(token, Object.assign({}, defaultOptions, { edge: ['sydney', 'singapore', 'ashburn'] }));
    await deviceReady();
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');

    // A capability token with an invalid account sid triggers the server to close the connection.
    // This is not a 1006 nor 1015 error so sdk should not reconnect to fallback edges.
    const res = await runDockerCommand('getInvalidCapabilityToken');
    const invalidToken = (JSON.parse(res) as any).token;
    device.updateToken(invalidToken);

    // Check at least two reconnects and make sure the uri did not use a fallback
    await waitFor(expectEvent('error', device), EVENT_TIMEOUT);
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');

    await waitFor(expectEvent('error', device), EVENT_TIMEOUT);
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
  });

  it('should fallback to the next edge if the transport error is fallback-able while connected', async () => {
    const timeout = 100000;
    device.setup(token, Object.assign({}, defaultOptions, { edge: ['sydney', 'singapore'] }));
    await deviceReady();
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
    device.stream.transport['_connectTimeoutMs'] = timeout;

    // Trigger network error
    await runDockerCommand('disconnectFromAllNetworks');

    // Check the reconnect and make sure the uri used is a fallback
    await waitFor(new Promise((resolve) => {
      device.on('error', (error: any) => {
        if (error.code === 31005) {
          resolve();
        }
      });
    }), timeout);
    assert.equal(device.stream.transport.uri, 'wss://chunderw-vpc-gll-sg1.twilio.com/signal');

    await runDockerCommand('resetNetwork');
    await pause(5000);
  });
});
