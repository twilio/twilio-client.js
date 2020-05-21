import Connection from '../../lib/twilio/connection';
import { PreflightTest } from '../../lib/twilio/preflight/preflight';
import { EventEmitter } from 'events';
import { SinonFakeTimers } from 'sinon';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { inherits } from 'util';
import RTCSample from '../../lib/twilio/rtc/sample';

describe('PreflightTest', () => {
  const CALL_SID = 'foo-bar';

  let clock: SinonFakeTimers;
  let connection: any;
  let connectionContext: any;
  let device: any;
  let deviceFactory: any;
  let deviceContext: any;
  let options: any;
  let testSamples: any;
  let edgeStub: any;

  const getDeviceFactory = (context: any) => {
    const factory = function(this: any, token: string, options: PreflightTest.Options) {
      Object.assign(this, context);
      if (token) {
        this.setup(token, options);
      }
      device = this;
    };
    inherits(factory, EventEmitter);
    return factory;
  };

  const getTestSamples = () => {
    const totalSampleCount = 15;
    const samples = [];
    let total = 0;

    for (let i = 0; i < totalSampleCount; i++) {
      const val = i+1;
      total += val;
      samples.push({
        mos: val,
        jitter: val,
        rtt: val,
        totals: {
          foo: total
        }
      });
    }

    return samples;
  };

  beforeEach(() => {
    clock = sinon.useFakeTimers();

    connectionContext = {
      mediaStream: {
        callSid: CALL_SID,
        onpcconnectionstatechange: sinon.stub(),
        oniceconnectionstatechange: sinon.stub(),
        ondtlstransportstatechange: sinon.stub(),
      }
    };
    connection = new EventEmitter();
    Object.assign(connection, connectionContext);

    deviceContext = {
      setup: sinon.stub(),
      connect: sinon.stub().returns(connection),
      destroy: sinon.stub(),
      region: sinon.stub().returns('foobar-region'),
      edge: null,
    };
    edgeStub = sinon.stub().returns('foobar-edge');
    sinon.stub(deviceContext, 'edge').get(edgeStub);
    deviceFactory = getDeviceFactory(deviceContext)

    options = {
      deviceFactory
    };

    testSamples = getTestSamples();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('constructor', () => {
    it('should pass codecPreferences to device', () => {
      options.codecPreferences = [Connection.Codec.PCMU, Connection.Codec.Opus];
      const preflight = new PreflightTest('foo', options);
      sinon.assert.calledWith(deviceContext.setup, 'foo', {
        codecPreferences: options.codecPreferences,
        debug: false,
        edge: 'roaming',
      });
    });

    it('should pass edge to device', () => {
      options.edge = 'ashburn';
      const preflight = new PreflightTest('foo', options);
      sinon.assert.calledWith(deviceContext.setup, 'foo', {
        codecPreferences: [Connection.Codec.PCMU, Connection.Codec.Opus],
        debug: false,
        edge: options.edge,
      });
      sinon.assert.calledOnce(edgeStub);
    });
  });

  describe('on sample', () => {
    it('should emit samples', () => {
      const onSample = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('sample', onSample);
      device.emit('ready');

      const count = 10;
      const sample = {foo: 'foo', bar: 'bar', mos: 1};
      for (let i = 1; i <= count; i++) {
        const data = {...sample, count: i};
        connection.emit('sample', data);
        sinon.assert.callCount(onSample, i);
        sinon.assert.calledWithExactly(onSample, data);
        assert.deepEqual(preflight.latestSample, data)
      }
    });
  });

  describe('on warning', () => {
    it('should emit warning', () => {
      const onWarning = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('warning', onWarning);
      device.emit('ready');

      const data = {foo: 'foo', bar: 'bar'};

      connection.emit('warning', 'foo', data);

      sinon.assert.calledOnce(onWarning);
      sinon.assert.calledWithExactly(onWarning, 'foo', data);
    });
  });

  describe('on connected', () => {
    it('should emit connected', () => {
      const onConnected = sinon.stub();
      const preflight = new PreflightTest('foo', options);

      preflight.on('connected', onConnected);
      device.emit('ready');

      connection.emit('accept');
      assert.equal(preflight.status, PreflightTest.Status.Connected);
      sinon.assert.calledOnce(onConnected);
    });

    it('should populate callsid', () => {
      const preflight = new PreflightTest('foo', options);
      device.emit('ready');
      connection.emit('accept');

      assert.equal(preflight.callSid, CALL_SID);
    });

    it('should clear singaling timeout timer', () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);

      preflight.on('failed', onFailed);
      device.emit('ready');

      clock.tick(15000);

      sinon.assert.notCalled(onFailed);
    });
  });

  describe('on completed and destroy device', () => {
    it('should clear signaling timeout timer', () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('failed', onFailed);

      device.emit('ready');
      clock.tick(5000);
      device.emit('disconnect');
      clock.tick(1000);
      device.emit('offline');

      clock.tick(15000);
      sinon.assert.notCalled(onFailed);
    });

    it('should end call after device disconnects', () => {
      const onCompleted = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('completed', onCompleted);
      device.emit('ready');
      clock.tick(14000);
      device.emit('disconnect');
      clock.tick(1000);
      device.emit('offline');
      assert(preflight.endTime! - preflight.startTime === 15000);
      sinon.assert.calledOnce(deviceContext.destroy);
      sinon.assert.called(onCompleted);
    });

    it('should release all handlers', () => {
      const onCompleted = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('completed', onCompleted);
      device.emit('ready');
      clock.tick(14000);
      device.emit('disconnect');
      clock.tick(1000);
      device.emit('offline');

      assert.equal(device.eventNames().length, 0);
      assert.equal(connection.eventNames().length, 0);
    });

    it('should provide report', (done) => {
      clock.reset();
      const warningData = {foo: 'foo', bar: 'bar'};
      const preflight = new PreflightTest('foo', options);

      assert.equal(preflight.status, PreflightTest.Status.Connecting);

      const onCompleted = (results: PreflightTest.Report) => {
        // This is derived from testSamples
        const expected = {
          callSid: CALL_SID,
          edge: 'foobar-edge',
          networkTiming: {
            dtls: {
              duration: 1000,
              end: 1000,
              start: 0
            },
            ice: {
              duration: 1000,
              end: 1000,
              start: 0
            },
            peerConnection: {
              duration: 1000,
              end: 1000,
              start: 0
            }
          },
          samples: testSamples,
          selectedEdge: 'roaming',
          stats: {
            jitter: {
              average: 8,
              max: 15,
              min: 1
            },
            mos: {
              average: 8,
              max: 15,
              min: 1
            },
            rtt: {
              average: 8,
              max: 15,
              min: 1
            }
          },
          testTiming: {
            start: 0,
            end: 15000,
            duration: 15000
          },
          totals: testSamples[testSamples.length - 1].totals,
          warnings: [{name: 'foo', data: warningData}],
        };
        assert.equal(preflight.status, PreflightTest.Status.Completed);
        assert.deepEqual(results, expected);
        assert.deepEqual(preflight.report, expected);
        done();
      };

      preflight.on('completed', onCompleted);
      device.emit('ready');

      // Populate samples
      for (let i = 0; i < testSamples.length; i++) {
        const sample = testSamples[i];
        const data = {...sample};
        connection.emit('sample', data);
      }
      // Populate warnings
      connection.emit('warning', 'foo', warningData);
      // Populate callsid
      connection.emit('accept');

      // Populate network timings
      connection.mediaStream.onpcconnectionstatechange('connecting');
      connection.mediaStream.ondtlstransportstatechange('connecting');
      connection.mediaStream.oniceconnectionstatechange('checking');
      clock.tick(1000);

      connection.mediaStream.onpcconnectionstatechange('connected');
      connection.mediaStream.ondtlstransportstatechange('connected');
      connection.mediaStream.oniceconnectionstatechange('connected');

      clock.tick(13000);
      device.emit('disconnect');
      clock.tick(1000);
      device.emit('offline');
    });
  });

  describe('on failed', () => {
    it('should clear signaling timeout timer', () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);

      preflight.on('failed', onFailed);
      device.emit('ready');
      clock.tick(5000);

      preflight.stop();
      device.emit('offline');

      clock.tick(15000);

      sinon.assert.calledOnce(onFailed);
    });

    it('should timeout after 10s by default', () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('failed', onFailed);

      clock.tick(9999);
      sinon.assert.notCalled(onFailed);
      clock.tick(1);
      sinon.assert.calledOnce(onFailed);
      sinon.assert.calledWithExactly(onFailed, { code: 31901, message: "WebSocket - Connection Timeout" });
    });

    it('should use timeout param', () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', Object.assign({ signalingTimeoutMs: 3000 }, options));
      preflight.on('failed', onFailed);

      clock.tick(2999);
      sinon.assert.notCalled(onFailed);
      clock.tick(1);
      sinon.assert.calledOnce(onFailed);
      sinon.assert.calledWithExactly(onFailed, { code: 31901, message: "WebSocket - Connection Timeout" });
    });

    it('should emit failed if Device failed to initialized', () => {
      deviceContext.setup = () => {
        throw 'foo';
      };

      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('failed', onFailed);
      clock.tick(1);
      assert.equal(preflight.status, PreflightTest.Status.Failed);
      sinon.assert.calledOnce(onFailed);
      sinon.assert.calledWithExactly(onFailed, 'foo');
    });

    it('should emit failed when test is stopped and destroy device', () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('failed', onFailed);
      device.emit('ready');

      preflight.stop();
      device.emit('offline');

      assert.equal(preflight.status, PreflightTest.Status.Failed);
      sinon.assert.calledOnce(deviceContext.destroy);
      sinon.assert.calledOnce(onFailed);
      sinon.assert.calledWithExactly(onFailed, {
        code: 31008,
        message: 'Call cancelled',
      });
    });

    it(`should emit failed on fatal device errors and destroy device`, () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('failed', onFailed);
      device.emit('ready');

      device.emit('error', { code: 123 });

      assert.equal(preflight.status, PreflightTest.Status.Failed);
      sinon.assert.calledOnce(deviceContext.destroy);
      sinon.assert.calledOnce(onFailed);
      sinon.assert.calledWithExactly(onFailed, { code: 123 });
    });

    it('should stop test', () => {
      const onCompleted = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('completed', onCompleted);
      device.emit('ready');

      clock.tick(5000);
      preflight.stop();
      device.emit('offline');

      clock.tick(15000);
      device.emit('offline');
      assert.equal(preflight.status, PreflightTest.Status.Failed);
      sinon.assert.notCalled(onCompleted);
    });

    it('should release all handlers', () => {
      const preflight = new PreflightTest('foo', options);
      device.emit('ready');

      preflight.stop();
      device.emit('offline');

      assert.equal(device.eventNames().length, 0);
      assert.equal(connection.eventNames().length, 0);
    });
  });

  describe('_getRTCStats', () => {
    describe('should trim leading null mos valued samples', () => {
      const createSample = ({
        jitter,
        mos,
        rtt,
      }: {
        jitter: any,
        mos: any,
        rtt: any,
      }): RTCSample => ({
        audioInputLevel: 0,
        audioOutputLevel: 0,
        bytesReceived: 0,
        bytesSent: 0,
        codecName: 'foobar-codec',
        jitter,
        mos,
        packetsLost: 0,
        packetsLostFraction: 0,
        packetsReceived: 0,
        packetsSent: 0,
        rtt,
        timestamp: 0,
        totals: {
          bytesReceived: 0,
          bytesSent: 0,
          packetsLost: 0,
          packetsLostFraction: 0,
          packetsReceived: 0,
          packetsSent: 0,
        },
      });

      it('should return an object if there are mos samples', () => {
        const preflight = new PreflightTest('foo', options);

        device.emit('ready');
        [{
          jitter: 100, mos: null, rtt: 1,
        }, {
          jitter: 0, mos: null, rtt: 0,
        }, {
          jitter: 0, mos: null, rtt: 0,
        }, {
          jitter: 1, mos: 5, rtt: 0.01,
        }, {
          jitter: 2, mos: 4, rtt: 0.03,
        }, {
          jitter: 3, mos: 3, rtt: 0.02,
        }].map(createSample).forEach(
          (sample: RTCSample) => connection.emit('sample', sample),
        );

        const rtcStats = preflight['_getRTCStats']();
        assert.deepEqual(rtcStats, {
          jitter: {
            average: 2,
            max: 3,
            min: 1,
          },
          mos: {
            average: 4,
            max: 5,
            min: 3,
          },
          rtt: {
            average: 0.02,
            max: 0.03,
            min: 0.01,
          },
        });
      });

      it('should return undefined if there are no mos samples', () => {
        const preflight = new PreflightTest('foo', options);

        device.emit('ready');
        [{
          jitter: 100, mos: null, rtt: 1,
        }, {
          jitter: 0, mos: null, rtt: 0,
        }, {
          jitter: 0, mos: null, rtt: 0,
        }].map(createSample).forEach(
          (sample: RTCSample) => connection.emit('sample', sample),
        );

        const rtcStats = preflight['_getRTCStats']();
        assert.equal(rtcStats, undefined);
      });
    });
  });
});
