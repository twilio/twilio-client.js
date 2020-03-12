import Connection from '../../lib/twilio/connection';
import PreflightTest from '../../lib/twilio/preflight/preflight';
import { EventEmitter } from 'events';
import { SinonFakeTimers } from 'sinon';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { inherits } from 'util';

describe('PreflightTest', () => {
  const wait = () => Promise.resolve();
  const FATAL_ERRORS = [{
    code: 31000,
    name: PreflightTest.FatalError.SignalingConnectionFailed
  },{
    code: 31003,
    name: PreflightTest.FatalError.IceConnectionFailed
  },{
    code: 20101,
    name: PreflightTest.FatalError.InvalidToken
  },{
    code: 31208,
    name: PreflightTest.FatalError.MediaPermissionsFailed
  },{
    code: 31201,
    name: PreflightTest.FatalError.NoDevicesFound
  }]

  let clock: SinonFakeTimers;
  let connection: any;
  let connectionContext: any;
  let device: any;
  let deviceFactory: any;
  let deviceContext: any;
  let options: any;
  let testSamples: any;

  const getDeviceFactory = (context: any) => {
    const factory = function(this: any, token: string, options: PreflightTest.PreflightOptions) {
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
        callSid: 'test_callsid',
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
    };
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
        debug: false
      });
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

    it('should not emit samples if mos is not available', () => {
      const onSample = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('sample', onSample);
      device.emit('ready');

      const count = 10;
      const sample = {foo: 'foo', bar: 'bar'};
      for (let i = 1; i <= count; i++) {
        const data = {...sample, count: i};
        connection.emit('sample', data);
        sinon.assert.notCalled(onSample);
        assert.equal(preflight.latestSample, undefined)
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

  describe('on error', () => {
    it('should emit error for non fatal error', () => {
      const onError = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('error', onError);
      device.emit('ready');

      device.emit('error', { code: 31400 });

      sinon.assert.calledOnce(onError);
      sinon.assert.calledWithExactly(onError, PreflightTest.NonFatalError.InsightsConnectionFailed, { code: 31400 });
    });

    it('should not emit error for unknown code', () => {
      const onError = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('error', onError);
      device.emit('ready');

      device.emit('error', { code: 123 });

      sinon.assert.notCalled(onError);
    });

    FATAL_ERRORS.forEach((error: any) => {
      it(`should not emit error for code ${error.code}`, () => {
        const onError = sinon.stub();
        const preflight = new PreflightTest('foo', options);
        preflight.on('error', onError);
        device.emit('ready');

        device.emit('error', { code: error.code });

        sinon.assert.notCalled(onError);
      });
    });
  });

  describe('on connected', () => {
    it('should emit connected', () => {
      const onConnected = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      
      preflight.on('connected', onConnected);
      device.emit('ready');

      connection.emit('accept');
      assert.equal(preflight.status, PreflightTest.TestStatus.Connected);
      sinon.assert.calledOnce(onConnected);
    });
  });

  describe('on completed and destroy device', () => {
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

    it('should provide results', (done) => {
      clock.reset();
      const warningData = {foo: 'foo', bar: 'bar'};
      const preflight = new PreflightTest('foo', options);

      assert.equal(preflight.status, PreflightTest.TestStatus.Connecting);

      const onCompleted = (results: PreflightTest.TestResults) => {
        // This is derived from testSamples
        const expected = {
          callSid: 'test_callsid',
          errors: ['InsightsConnectionFailed'],
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
        assert.equal(preflight.status, PreflightTest.TestStatus.Completed);
        assert.deepEqual(results, expected);
        assert.deepEqual(preflight.results, expected);
        done();
      };

      preflight.on('completed', onCompleted);
      preflight.on('error', sinon.stub());
      device.emit('ready');

      // Populate error
      device.emit('error', { code: 31400 });
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
    it('should emit failed on UnsupportedBrowser', () => {
      deviceContext.setup = () => {
        throw new Error();
      };

      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('failed', onFailed);
      clock.tick(1);
      assert.equal(preflight.status, PreflightTest.TestStatus.Failed);
      sinon.assert.calledOnce(onFailed);
      sinon.assert.calledWithExactly(onFailed, PreflightTest.FatalError.UnsupportedBrowser, undefined);
    });

    it('should emit failed on CallCancelled and destroy device', () => {
      const onFailed = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('failed', onFailed);
      device.emit('ready');

      preflight.cancel();
      device.emit('offline');

      assert.equal(preflight.status, PreflightTest.TestStatus.Failed);
      sinon.assert.calledOnce(deviceContext.destroy);
      sinon.assert.calledOnce(onFailed);
      sinon.assert.calledWithExactly(onFailed, PreflightTest.FatalError.CallCancelled, undefined);
    });

    FATAL_ERRORS.forEach((error: any) => {
      it(`should emit failed on ${error.name} and destroy device`, () => {
        const onFailed = sinon.stub();
        const preflight = new PreflightTest('foo', options);
        preflight.on('failed', onFailed);
        device.emit('ready');

        device.emit('error', { code: error.code });

        assert.equal(preflight.status, PreflightTest.TestStatus.Failed);
        sinon.assert.calledOnce(deviceContext.destroy);
        sinon.assert.calledOnce(onFailed);
        sinon.assert.calledWithExactly(onFailed, (PreflightTest.FatalError as any)[error.name], { code: error.code });
      });
    });

    it('should stop test', () => {
      const onCompleted = sinon.stub();
      const preflight = new PreflightTest('foo', options);
      preflight.on('completed', onCompleted);
      device.emit('ready');

      clock.tick(5000);
      preflight.cancel();
      device.emit('offline');

      clock.tick(15000);
      device.emit('offline');
      assert.equal(preflight.status, PreflightTest.TestStatus.Failed);
      sinon.assert.notCalled(onCompleted);
    });

    it('should release all handlers', () => {
      const preflight = new PreflightTest('foo', options);
      device.emit('ready');

      preflight.cancel();
      device.emit('offline');

      assert.equal(device.eventNames().length, 0);
      assert.equal(connection.eventNames().length, 0);
    });
  });
});
