import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import * as assert from 'assert';
import { EventEmitter } from 'events';    

// (rrowland) The TwiML expected by these tests can be found in the README.md

describe('Device', function() {
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
    identity2 = 'id2-' + Date.now();
    token1 = generateAccessToken(identity1);
    token2 = generateAccessToken(identity2);
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
      (device1['connect'] as any)({ To: identity2, Custom1: 'foo + bar', Custom2: undefined, Custom3: '我不吃蛋' });
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

      it('should connect the call', (done) => {
        connection2.once('accept', () => done());
        connection2.accept();
      });

      it('should stay open 3 seconds', (done) => {
        function fail() {
          connection1.removeListener('disconnect', fail);
          connection2.removeListener('disconnect', fail);
          done(new Error('Expected the connection to stay open for 3 seconds'));
        }

        connection1.once('disconnect', fail);
        connection2.once('disconnect', fail);

        setTimeout(() => {
          connection1.removeListener('disconnect', fail);
          connection2.removeListener('disconnect', fail);
          done();
        }, 3000);
      });

      it('should be using the PCMU codec for both connections', (done) => {
        let codec1: string | null | undefined = null;

        function setCodec(sample: any) {
          if (codec1 === null) {
            codec1 = sample.codecName;
          } else {
            if (codec1 === 'opus' || sample.codecName === 'opus') {
              done(new Error('Codec is opus'));
            } else {
              done();
            }
          }
        }

        const monitor1: any = connection1['_monitor'];
        const monitor2: any = connection2['_monitor'];
        if (!monitor1 || !monitor2) {
          done(new Error('Missing monitor'));
        }
        monitor1.once('sample', setCodec);
        monitor2.once('sample', setCodec);
      });

      it('should update network priority to high if supported', () => {
        const conn = device2 && device2.activeConnection();
        if (!conn || !conn.mediaStream || !conn.mediaStream._sender) {
          throw new Error('Expected sender to be present');
        }
        const sender = conn.mediaStream._sender;
        const params = sender.getParameters();
        const encoding = params.encodings && params.encodings[0];

        if (!params.priority && !encoding) {
          // Not supported by browser.
          return;
        }

        assert(params.priority === 'high'
          || (encoding && encoding.priority === 'high')
          || (encoding && encoding.networkPriority === 'high'));
      });

      it('should receive the correct custom parameters from the TwiML app', () => {
        assert.deepEqual(Array.from(connection2.customParameters.entries()), [
          ['duplicate', '123456'],
          ['custom + param', '我不吃蛋'],
          ['foobar', 'some + value'],
          ['custom1', 'foo + bar'],
          ['custom2', 'undefined'],
          ['custom3', '我不吃蛋'],
        ]);
      });

      it('should post metrics', (done) => {
        const publisher = connection1['_publisher'];
        (publisher as any)['_request'] = { post: (params: any, err: Function) => {
          if (/EndpointMetrics$/.test(params.url)) {
            done();
          }
        }};
      });

      it('should hang up', (done) => {
        connection1.once('disconnect', () => done());
        connection2.disconnect();
      });
    });
  });
});

function expectEvent(eventName: string, emitter: EventEmitter) {
  return new Promise(resolve => {
    emitter.once(eventName, () => resolve());
  });
}
