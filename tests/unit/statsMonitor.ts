import StatsMonitor from '../../lib/twilio/statsMonitor';
import { SinonFakeTimers } from 'sinon';
import * as assert from 'assert';
import * as sinon from 'sinon';

describe('StatsMonitor', () => {
  const SAMPLE_COUNT_RAISE = 3;
  const STAT_NAME = 'jitter';

  let clock: SinonFakeTimers;
  let getRTCStats: () => any;
  let monitor: StatsMonitor;
  let Mos: any;
  let stats: any;
  let thresholds: any;
  let wait: () => Promise<any>;

  beforeEach(() => {
    clock = sinon.useFakeTimers(Date.now());
    getRTCStats = () => Promise.resolve({...stats});
    Mos = { calculate: () => 1 };
    stats = { [STAT_NAME]: 30 };
    thresholds = { [STAT_NAME]: { max: 30, min: 10, maxDuration: 20 }};
    wait = () => new Promise(r => setTimeout(r, 0));
  });

  afterEach(() => {
    clock.restore();
  });

  describe('StatsMonitor.enable', () => {
    it(`Should throw an error without a PeerConnection in both 'constructor' and 'enable'`, () => {
      monitor = new StatsMonitor();
      assert.throws(() => monitor.enable(null));
    });

    it(`Should throw an error when trying to replace the existing PeerConnection`, () => {
      monitor = new StatsMonitor({ peerConnection: {} });
      assert.throws(() => monitor.enable({}));
    });

    it(`Should start fetching samples if PeerConnection is passed in`, () => {
      const onSample = sinon.stub();

      monitor = new StatsMonitor({ getRTCStats });
      monitor.on('sample', onSample);
      monitor.enable({});

      clock.tick(1050);
      clock.restore();

      return wait().then(() => sinon.assert.calledOnce(onSample));
    });
  });

  describe('StatsMonitor.disable', () => {
    it(`Should stop fetching samples`, () => {
      const onSample = sinon.stub();

      monitor = new StatsMonitor({ getRTCStats });
      monitor.on('sample', onSample);
      monitor.enable({});

      clock.tick(2050);
      monitor.disable();
      clock.tick(2050);
      clock.restore();

      return wait().then(() => sinon.assert.callCount(onSample, 2));
    });
  });

  describe('StatsMonitor.disableWarnings', () => {
    it(`Should NOT raise warnings when thresholds reached and warnings are disabled`, () => {
      const onWarning = sinon.stub();
      thresholds[STAT_NAME].maxDuration = 2;
      monitor = new StatsMonitor({ getRTCStats, thresholds });
      monitor.enable({});

      monitor.on('warning', onWarning);
      monitor.disableWarnings();

      clock.tick(3000);
      clock.restore();

      return wait().then(() => sinon.assert.notCalled(onWarning));
    });
  });

  describe('StatsMonitor.enableWarnings', () => {
    it(`Should raise warning after re-enabling warnings`, () => {
      const onWarning = sinon.stub();
      thresholds[STAT_NAME].maxDuration = 2;
      monitor = new StatsMonitor({ getRTCStats, thresholds });
      monitor.enable({});

      monitor.on('warning', onWarning);
      monitor.disableWarnings();
      clock.tick(3000);
      monitor.enableWarnings();
      clock.tick(3000);
      clock.restore();

      return wait().then(() => sinon.assert.calledOnce(onWarning));
    });
  });

  describe(`StatsMonitor on 'sample'`, () => {
    const REQUIRED_FIELDS = [
      'audioInputLevel',
      'audioOutputLevel',
      'bytesReceived',
      'bytesSent',
      'codecName',
      'jitter',
      'mos',
      'packetsLost',
      'packetsLostFraction',
      'packetsReceived',
      'packetsSent',
      'rtt',
      'timestamp',
      {
        'totals': [
          'bytesReceived',
          'bytesSent',
          'packetsLost',
          'packetsLostFraction',
          'packetsReceived',
          'packetsSent',
        ]
      },
    ];

    let stats: any;

    beforeEach(() => {
      stats = {
        bytesReceived: 200,
        bytesSent: 300,
        codecName: 'testcodec',
        jitter: 3,
        packetsLost: 5,
        packetsReceived: 15,
        packetsSent: 20,
        rtt: 30,
        timestamp: Date.now(),
      }
    });

    it(`Should emit 'sample' without missing values`, (done) => {
      const checkNotEmpty = (val: any) => {
        assert.notEqual(val, null);
        assert.notEqual(val, undefined);
        assert.notEqual(val, NaN);
        assert.notEqual(val, '');
      };

      getRTCStats = () => Promise.resolve(stats);
      monitor = new StatsMonitor({ getRTCStats, Mos });
      monitor.addVolumes(123, 123);
      monitor.on('sample', (sample: any) => {
        REQUIRED_FIELDS.forEach((field: any) => {
          if (typeof field === 'string') {
            checkNotEmpty(sample[field]);
          } else if (typeof field === 'object') {
            Object.keys(field).forEach((key: string) => {
              checkNotEmpty(sample[key]);
              field[key].forEach((subField: string) => checkNotEmpty(sample[key][subField]));
            });
          }
        });
        done();
      });

      monitor.enable({});
      clock.tick(1050);
    });

    it('Should emit average volume in the last second', (done) => {
      getRTCStats = () => Promise.resolve(stats);
      monitor = new StatsMonitor({ getRTCStats, Mos });
      monitor.addVolumes(100, 150);
      monitor.addVolumes(200, 250);
      monitor.addVolumes(300, 350);
      monitor.on('sample', (sample: any) => {
        assert.equal(sample.audioInputLevel, 200);
        assert.equal(sample.audioOutputLevel, 250);
        done();
      });

      monitor.enable({});
      clock.tick(1050);
    });

    it('Should not use previously emitted volumes when averaging', (done) => {
      let sampleCount = 0;
      getRTCStats = () => Promise.resolve(stats);
      monitor = new StatsMonitor({ getRTCStats, Mos });
      monitor.enable({});

      monitor.on('sample', (sample: any) => {
        sampleCount++;
        if (sampleCount === 1) {
          assert.equal(sample.audioInputLevel, 200);
          assert.equal(sample.audioOutputLevel, 250);
          monitor.addVolumes(400, 450);
          monitor.addVolumes(500, 550);
          monitor.addVolumes(600, 650);

          clock.tick(1050);
        } else if (sampleCount === 2) {
          assert.equal(sample.audioInputLevel, 500);
          assert.equal(sample.audioOutputLevel, 550);
          done();
        }
      });

      monitor.addVolumes(100, 150);
      monitor.addVolumes(200, 250);
      monitor.addVolumes(300, 350);
      clock.tick(1050);
    });
  });

  describe(`StatsMonitor on 'warning'`, () => {
    context(`'maxDuration' threshold`, () => {
      it(`Should raise warning when 'maxDuration' threshold is reached`, (done) => {
        thresholds[STAT_NAME].maxDuration = 2;
        monitor = new StatsMonitor({ getRTCStats, thresholds });
        monitor.enable({});

        monitor.on('warning', warning => {
          assert.equal(warning.name, STAT_NAME);
          assert.equal(warning.value, thresholds[STAT_NAME].maxDuration);
          done();
        });

        clock.tick(SAMPLE_COUNT_RAISE * 1000);
      });

      it(`Should NOT raise warning when 'maxDuration' threshold is reached but with different stat values`, () => {
        const onWarning = sinon.stub();
        thresholds[STAT_NAME].maxDuration = 2;
        monitor = new StatsMonitor({ getRTCStats, thresholds });
        monitor.enable({});

        monitor.on('warning', (warning) => {
          console.log(warning);
          onWarning();
        });

        clock.tick(1000);
        stats[STAT_NAME]--;

        clock.tick(1000);
        stats[STAT_NAME]--;

        clock.tick(1000);
        stats[STAT_NAME]--;

        clock.restore();

        return wait().then(() => sinon.assert.notCalled(onWarning));
      });
    });

    context(`'min' and 'max' thresholds`, () => {
      [{
        // Used to go outside max boundary
        outOfBoundModifier: 1,
        thresholdName: 'max',
      }, {
        // Used to go outside min boundary
        outOfBoundModifier: -1,
        thresholdName: 'min',
      }].forEach((item: any) => {
        it(`Should raise warning when '${item.thresholdName}' threshold is reached`, (done) => {
          stats[STAT_NAME] = thresholds[STAT_NAME][item.thresholdName] + item.outOfBoundModifier;
          monitor = new StatsMonitor({ getRTCStats, thresholds });
          monitor.enable({});

          monitor.on('warning', warning => {
            assert.equal(warning.name, STAT_NAME);
            assert.equal(warning.values.length, SAMPLE_COUNT_RAISE);
            warning.values.forEach((v: number) => assert.equal(stats[STAT_NAME], v));
            done();
          });

          clock.tick(SAMPLE_COUNT_RAISE * 1000);
        });

        it(`Should NOT raise warning when '${item.thresholdName}' threshold is NOT reached`, () => {
          const onWarning = sinon.stub();
          stats[STAT_NAME] = thresholds[STAT_NAME][item.thresholdName];
          monitor = new StatsMonitor({ getRTCStats, thresholds });
          monitor.enable({});

          monitor.on('warning', onWarning);

          clock.tick(SAMPLE_COUNT_RAISE * 1000);
          clock.restore();

          return wait().then(() => sinon.assert.notCalled(onWarning));
        });

        it(`Should NOT raise warning when '${item.thresholdName}' raise count is NOT reached`, () => {
          const onWarning = sinon.stub();
          stats[STAT_NAME] = thresholds[STAT_NAME][item.thresholdName] + item.outOfBoundModifier;
          monitor = new StatsMonitor({ getRTCStats, thresholds });
          monitor.enable({});

          monitor.on('warning', onWarning);

          clock.tick((SAMPLE_COUNT_RAISE - 1) * 1000);
          clock.restore();

          return wait().then(() => sinon.assert.notCalled(onWarning));
        });

        it(`Should use raise count parameter if passed in ('${item.thresholdName}' threshold)`, () => {
          const onWarning = sinon.stub();
          thresholds[STAT_NAME].raiseCount = SAMPLE_COUNT_RAISE - 1;
          stats[STAT_NAME] = thresholds[STAT_NAME][item.thresholdName] + item.outOfBoundModifier;
          monitor = new StatsMonitor({ getRTCStats, thresholds });
          monitor.enable({});

          monitor.on('warning', onWarning);

          clock.tick((SAMPLE_COUNT_RAISE - 1) * 1000);
          clock.restore();

          return wait().then(() => sinon.assert.calledOnce(onWarning));
        });

        it(`Should use sample count parameter if passed in ('${item.thresholdName}' threshold)`, () => {
          const onWarning = sinon.stub();
          thresholds[STAT_NAME].sampleCount = 3;
          thresholds[STAT_NAME].raiseCount = 4;
          stats[STAT_NAME] = thresholds[STAT_NAME][item.thresholdName] + item.outOfBoundModifier;
          monitor = new StatsMonitor({ getRTCStats, thresholds });
          monitor.enable({});

          monitor.on('warning', onWarning);

          clock.tick(4000);
          clock.restore();

          return wait().then(() => sinon.assert.notCalled(onWarning));
        });
      });
    });
  });

  describe(`StatsMonitor on 'error'`, () => {
    it(`Should emit 'error'`, () => {
      const onSample = sinon.stub();
      const onError = sinon.stub();

      getRTCStats = () => Promise.reject({});
      monitor = new StatsMonitor({ getRTCStats });
      monitor.on('sample', onSample);
      monitor.on('error', onError);
      monitor.enable({});

      clock.tick(1050);
      clock.restore();

      return wait().then(() => {
        sinon.assert.notCalled(onSample);
        sinon.assert.calledOnce(onError);
      });
    });
  });
});
