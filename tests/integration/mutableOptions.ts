import * as assert from 'assert';
import * as sinon from 'sinon';
import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';

function waitFor(n: number, reject?: boolean) {
  return new Promise((res, rej) => setTimeout(reject ? rej : res, n));
}

describe('mutable options', function() {
  let device: Device;
  let token: string;

  beforeEach(() => {
    const id = `device-id-${Date.now()}`;
    token = generateAccessToken(id);
  });

  afterEach(() => {
    if (device) {
      device.disconnectAll();
      device.destroy();
    }
  });

  it('should update edge', async function() {
    this.timeout(10000);

    device = new Device(token, { edge: 'sydney' });

    await device.register();
    assert.equal(device.edge, 'sydney');

    await device.updateOptions({ edge: 'ashburn' });
    assert.equal(device.edge, 'ashburn');
  });

  context('ongoing connections', function() {
    this.timeout(30000);

    let caller: Device;
    let callerId: string;
    let callerToken: string;
    let callerConnection: Connection;

    let receiver: Device;
    let receiverId: string;
    let receiverToken: string;
    let receiverConnection: Connection;

    beforeEach(async function() {
      const timestamp = Date.now();

      [
        [caller, callerId, callerToken],
        [receiver, receiverId, receiverToken],
      ] = await Promise.all(['caller', 'receiver'].map(async (n): Promise<[Device, string, string]> => {
        const id = `device-${n}-${timestamp}`;
        const t = generateAccessToken(id);
        const dev = new Device(t);
        await dev.register();
        return [dev, id, t];
      }));

      const receiverConnPromise = new Promise<Connection>(resolve => {
        receiver.once(Device.EventName.Incoming, resolve);
      });

      callerConnection = await caller.connect({ params: { To: receiverId } });
      receiverConnection = await receiverConnPromise;
      receiverConnection.accept();

      await waitFor(1000);
    });

    afterEach(async function() {
      await waitFor(1000);

      caller.disconnectAll();
      caller.destroy();

      receiver.disconnectAll();
      receiver.destroy();
    });

    it('should not allow updating options while connections are ongoing', function() {
      const logSpy = sinon.spy();
      caller['_log'].warn = logSpy;

      caller.updateOptions();
      assert.equal(logSpy.args.filter(
        ([message]) => message === 'Existing Device has ongoing connections; ignoring new options.',
      ).length, 1);
    });

    it('should allow updating options after all connections have ended', function() {
      const logSpy = sinon.spy();
      caller['_log'].warn = logSpy;

      callerConnection.disconnect();

      caller.updateOptions();
      assert.equal(logSpy.args.filter(
        ([message]) => message === 'Existing Device has ongoing connections; ignoring new options.',
      ).length, 0);
    });
  });
});
