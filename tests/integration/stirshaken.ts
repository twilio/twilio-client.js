import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import * as assert from 'assert';
import { EventEmitter } from 'events';    
import * as env from '../env';

describe('STIR/Shaken', function() {
  this.timeout(10000);

  let device1: Device;
  let device2: Device;
  let identity1: string;
  let identity2: string;
  let options;
  let token1: string;
  let token2: string;

  before(() => {
    identity1 = 'id1-' + Date.now();
    identity2 = 'aliceStir';
    token1 = generateAccessToken(identity1, undefined, (env as any).appSidStir);
    token2 = generateAccessToken(identity2, undefined, (env as any).appSidStir);
    device1 = new Device();
    device2 = new Device();

    options = {
      warnings: false,
    };

    return Promise.all([
      expectEvent('ready', device1.setup(token1, options)),
      expectEvent('ready', device2.setup(token2, options)),
    ]);
  });

  describe('device 1 calls device 2', () => {
    before(done => {
      device2.once(Device.EventName.Incoming, () => done());
      (device1['connect'] as any)({ CallerId: (env as any).callerId });
    });

    describe('and device 2 accepts', () => {
      let connection1: Connection;
      let connection2: Connection;

      beforeEach(() => {
        const conn1: Connection | undefined | null = device1.activeConnection();
        const conn2: Connection | undefined | null = device2.activeConnection();

        if (!conn1 || !conn2) {
          throw new Error(`Connections weren't both open at beforeEach`);
        }

        connection1 = conn1;
        connection2 = conn2;
      });

      it('should set callerInfo to null on origin connection', () => {
        assert.equal(connection1!.callerInfo, null);
      });

      it('should show isVerified on aliceStir connection', () => {
        assert.equal(connection2!.callerInfo!.isVerified, true);
      });

      it('should reject the call', (done) => {
        connection1.once('disconnect', () => done());
        connection2.reject();
      });
    });
  });
});

function expectEvent(eventName: string, emitter: EventEmitter) {
  return new Promise(resolve => {
    emitter.once(eventName, () => resolve());
  });
}
