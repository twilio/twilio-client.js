import * as assert from 'assert';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import { runDockerCommand, waitFor } from '../lib/util';

const MAX_TIMEOUT = 300000;

const expectFailure = (device: Device) => {
  device.on(Device.EventName.Error, (error: any) => {
    if (!(error.code && (error.code === 53000 || error.code === 53001))) {
      throw error;
    }
  });
};

describe('Edge Fallback', function() {
  this.timeout(MAX_TIMEOUT);

  let device: Device;
  let identity: string;
  let token: string;

  const pause = (delay = 0) => new Promise(r => setTimeout(r, delay));

  const defaultOptions: Device.Options = {};

  beforeEach(() => {
    identity = 'id1-' + Date.now();
    token = generateAccessToken(identity);
  });

  afterEach(() => {
    if (device) {
      device.disconnectAll();
      device.destroy();
    }
  });

  it('should connect to sg1 if edge param is a string and is equal to singapore', async () => {
    device = new Device(token, { ...defaultOptions, edge: 'singapore' });
    await device.register();
    assert.equal(device['_stream'].transport.uri, 'wss://chunderw-vpc-gll-sg1.twilio.com/signal');
  });

  it('should connect to the first edge if edge param is an array', async () => {
    device = new Device(token, { ...defaultOptions, edge: ['sydney', 'singapore'] });
    await device.register();
    assert.equal(device['_stream'].transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
  });

  it('should use new uri format if the edge supplied is not in the list of supported edges', async () => {
    device = new Device(token, { ...defaultOptions, edge: 'foo' });
    expectFailure(device);
    device.register();
    assert.equal(device['_stream'].transport.uri, 'wss://voice-js.foo.twilio.com/signal');
  });

  it('should fallback to the next edge value if the current region is down', async () => {
    device = new Device(token, { ...defaultOptions, edge: ['foo', 'bar', 'ashburn'] });
    expectFailure(device);
    await device.register();
    assert.equal(device['_stream'].transport.uri, 'wss://chunderw-vpc-gll-us1.twilio.com/signal');
  });

  it('should not fallback to the next edge if the transport error is not fallback-able', async () => {
    device = new Device(token, { ...defaultOptions, edge: ['sydney', 'singapore', 'ashburn'] });
    await device.register();
    assert.equal(device['_stream'].transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
    device.destroy();

    // A capability token with an invalid account sid triggers the server to close the connection.
    // This is not a 1006 nor 1015 error so sdk should not reconnect to fallback edges.
    const res = await runDockerCommand('getInvalidCapabilityToken');
    const invalidToken = (JSON.parse(res) as any).token;
    device = new Device(invalidToken, { ...defaultOptions, edge: ['sydney', 'singapore', 'ashburn'] });
    expectFailure(device);
    device.register();

    const usedUris: string[] = [];
    const timeout = 100000;
    await waitFor(new Promise((resolve) => {
      device['_stream'].transport.__WebSocket = device['_stream'].transport._WebSocket;
      device['_stream'].transport._WebSocket = function(uri: string) {
        usedUris.push(uri);
        // Check at least two reconnects and make sure the uri did not use a fallback
        if (usedUris.length >= 2) {
          setTimeout(resolve);
        }
        return new device['_stream'].transport.__WebSocket(uri);
      };
    }), timeout);

    assert.equal(usedUris[0], 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
    assert.equal(usedUris[1], 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
  });

  it('should not fallback to the next edge if the transport error is fallback-able while connected', async function() {
    this.timeout(MAX_TIMEOUT);
    const connectTimeout = 120000;

    device = new Device(token, { edge: ['sydney', 'singapore'] });
    expectFailure(device);
    const regPromise = device.register();

    assert.equal(device['_stream'].transport.uri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');
    device['_stream'].transport['_connectTimeoutMs'] = connectTimeout;

    await regPromise;

    // Trigger network error
    await runDockerCommand('disconnectFromAllNetworks');

    let usedUri: string = '';
    await waitFor(new Promise((resolve) => {
      device['_stream'].transport.__WebSocket = device['_stream'].transport._WebSocket;
      device['_stream'].transport._WebSocket = function(uri: string) {
        usedUri = uri;
        setTimeout(resolve);
        return new device['_stream'].transport.__WebSocket(uri);
      };
    }), connectTimeout);

    assert.equal(usedUri, 'wss://chunderw-vpc-gll-au1.twilio.com/signal');

    await runDockerCommand('resetNetwork');
    await pause(5000);
  });
});
