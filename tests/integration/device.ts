import * as assert from 'assert';
import { EventEmitter } from 'events';
import Call from '../../lib/twilio/call';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';

// (rrowland) The TwiML expected by these tests can be found in the README.md

describe('Device', function() {
  this.timeout(10000);

  let device1: Device;
  let device2: Device;
  let identity1: string;
  let identity2: string;
  let token1: string;
  let token2: string;

  before(() => {
    identity1 = 'id1-' + Date.now();
    identity2 = 'id2-' + Date.now();
    token1 = generateAccessToken(identity1);
    token2 = generateAccessToken(identity2);
    device1 = new Device(token1);
    device2 = new Device(token2);

    return Promise.all([
      device1.register(),
      device2.register(),
    ]);
  });

  after(() => {
    if (device1) {
      device1.disconnectAll();
      device1.destroy();
    }

    if (device2) {
      device2.disconnectAll();
      device2.destroy();
    }
  });

  describe('device 1 calls device 2', () => {
    before(done => {
      device2.once(Device.EventName.Incoming, () => done());
      (device1['connect'] as any)({
        params: { To: identity2, Custom1: 'foo + bar', Custom2: undefined, Custom3: '我不吃蛋' }
      });
    });

    describe('and device 2 accepts', () => {
      let call1: Call;
      let call2: Call;

      beforeEach(() => {
        const conn1: Call | undefined | null = device1.activeCall || device1.calls[0];
        const conn2: Call | undefined | null = device2.activeCall || device2.calls[0];

        if (!conn1 || !conn2) {
          throw new Error(`Calls weren't both open at beforeEach`);
        }

        call1 = conn1;
        call2 = conn2;
      });

      it('should connect the call', (done) => {
        call2.once('accept', () => done());
        call2.accept();
      });

      it('should stay open 3 seconds', (done) => {
        function fail() {
          call1.removeListener('disconnect', fail);
          call2.removeListener('disconnect', fail);
          done(new Error('Expected the call to stay open for 3 seconds'));
        }

        call1.once('disconnect', fail);
        call2.once('disconnect', fail);

        setTimeout(() => {
          call1.removeListener('disconnect', fail);
          call2.removeListener('disconnect', fail);
          done();
        }, 3000);
      });

      it('should set callerInfo to null on both calls', () => {
        assert.equal(call1!.callerInfo, null);
        assert.equal(call2!.callerInfo, null);
      });

      it('should be using the PCMU codec for both calls', (done) => {
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

        const monitor1: any = call1['_monitor'];
        const monitor2: any = call2['_monitor'];
        if (!monitor1 || !monitor2) {
          done(new Error('Missing monitor'));
        }
        monitor1.once('sample', setCodec);
        monitor2.once('sample', setCodec);
      });

      it('should update network priority to high if supported', () => {
        const conn = device2 && device2.activeCall;
        if (!conn || !conn['_mediaHandler'] || !conn['_mediaHandler']._sender) {
          throw new Error('Expected sender to be present');
        }
        const sender = conn['_mediaHandler']._sender;
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
        assert.deepEqual(Array.from(call2.customParameters.entries()), [
          ['duplicate', '123456'],
          ['custom + param', '我不吃蛋'],
          ['foobar', 'some + value'],
          ['custom1', 'foo + bar'],
          ['custom2', 'undefined'],
          ['custom3', '我不吃蛋'],
        ]);
      });

      it('should post metrics', (done) => {
        const publisher = call1['_publisher'];
        (publisher as any)['_request'] = { post: (params: any, err: Function) => {
          if (/EndpointMetrics$/.test(params.url)) {
            done();
          }
        }};
      });

      it('should hang up', (done) => {
        call1.once('disconnect', () => done());
        call2.disconnect();
      });
    });
  });
});

function expectEvent(eventName: string, emitter: EventEmitter) {
  return new Promise(resolve => {
    emitter.once(eventName, () => resolve());
  });
}
