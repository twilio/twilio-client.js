import * as assert from 'assert';
import * as sinon from 'sinon';
import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';

function waitFor(n: number, reject?: boolean) {
  return new Promise((res, rej) => setTimeout(reject ? rej : res, n));
}

describe.only('mutable options', function() {
  let device: Device;
  let token: string;

  beforeEach(() => {
    const id = `device-id-${Date.now()}`;
    token = generateAccessToken(id);
    device = new Device();
  });

  it('should update edge', async function() {
    this.timeout(10000);

    const edge1 = await new Promise(resolve => {
      device.setup(token, { edge: 'sydney' });
      device.on(Device.EventName.Ready, d => resolve(d.edge));
    });

    assert.equal(edge1, 'sydney');

    const edge2 = await new Promise(resolve => {
      device.setup(token, { edge: 'ashburn' });
      device.on(Device.EventName.Ready, d => resolve(d.edge));
    });

    assert.equal(edge2, 'ashburn');
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
      ] = await Promise.all(
        ['caller', 'receiver'].map(n => new Promise<[Device, string, string]>(resolve => {
          const id = `device-${n}-${timestamp}`;
          const t = generateAccessToken(id);
          const dev = new Device();
          dev.once(Device.EventName.Ready, d => resolve([d, id, t]));
          dev.setup(t);
        })),
      );

      const receiverConnPromise = new Promise<Connection>(resolve => {
        receiver.once(Device.EventName.Incoming, resolve);
      });

      callerConnection = caller.connect({ params: { To: receiverId } });
      receiverConnection = await receiverConnPromise;
      receiverConnection.accept();

      await waitFor(1000);
    });

    afterEach(async function() {
      await waitFor(1000);

      caller.destroy();
      receiver.destroy();
    });

    it('should not allow updating options while connections are ongoing', function() {
      const logSpy = sinon.spy();
      caller['_log'].info = logSpy;

      caller.setup(callerToken, {});
      assert.equal(logSpy.args.filter(
        ([message]) => message === 'Existing Device has ongoing connections; using new token but ignoring options',
      ).length, 1);
    });

    it('should allow updating options after all connections have ended', function() {
      const logSpy = sinon.spy();
      caller['_log'].info = logSpy;

      callerConnection.disconnect();

      caller.setup(callerToken, {});
      assert.equal(logSpy.args.filter(
        ([message]) => message === 'Existing Device has ongoing connections; using new token but ignoring options',
      ).length, 0);
    });
  });
});
