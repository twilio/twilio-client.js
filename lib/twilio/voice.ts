/**
 * @module Voice
 * @preferred
 * @publicapi
 */
import { EventEmitter } from 'events';
import Connection from './connection';
import Device from './device';
import RTCSample from './rtc/sample';
import RTCWarning from './rtc/warning';

 namespace Voice {

  export class PreflightTest extends EventEmitter {

    private _connection: Connection;
    private _device: Device;
    private _errors: NonFatalError[];
    private _samples: RTCSample[];
    private _warnings: RTCWarning[];

    private _startTime: number | undefined;
    private _endTime: number | undefined;
    private _latestSample: RTCSample | undefined;
    private _results: TestResults | undefined;
    private _status: TestStatus = TestStatus.Connecting;

    constructor(token: string, options: PreflightOptions) {
      super();

      const codecPreferences = options.codecPreferences && options.codecPreferences.length ?
        options.codecPreferences : [Connection.Codec.Opus, Connection.Codec.PCMU];

      this._samples = [];
      this._startTime = Date.now();
      this._device = new Device(token, {
        codecPreferences,
        debug: true
      });

      this._device.on('ready', () => {
        this._connection = this._device.connect({ To: options.dialTo });
        this._setupHandlers(this._connection);
      });
    }

    private _getResults(): TestResults {
      return {
        averageSample: this._getAverageSample(),
        errors: this._errors,
        samples: this._samples,
        warnings: this._warnings,
      };
    }

    private _getAverageSample(): RTCSample | null {
      if (!this._latestSample) {
        return null;
      }

      const keys = Object.keys(this._latestSample)
        .filter((key) => this._latestSample && typeof this._latestSample[key] === 'number');

      // Get the totals for each key
      const sampleTotals = this._samples.reduce((totals: any, currentSample: RTCSample) => {
        keys.forEach((key: string) => {
          if (!totals[key]) {
            totals[key] = 0;
          }
          totals[key] += currentSample[key];
        });
        return totals;
      }, {});

      // Make a copy of a sample, along with the totals
      const sample = Object.assign({}, this._latestSample, sampleTotals);

      // Calculate the average
      keys.forEach((key: string) => {
        sample[key] = sample[key] / this._samples.length;
      });

      return sample;
    }

    private _onComplete(): void {
      this._endTime = Date.now();
      this._status = TestStatus.Completed;
      this._results = this._getResults();
      this.emit('completed', this._results);
    }

    private _setupHandlers(conn: Connection): void {
      this._status = TestStatus.Connected;
      
      conn.once('accept', () => this.emit(TestStatus.Connected));

      conn.on('sample', (sample) => {
        this._latestSample = sample;
        this._samples.push(sample);
        this.emit('sample', sample);
      });

      // TODO: Re-think this
      // For getting RTCWarning directly
      conn.on('warning', (warning: RTCWarning) => {
        if (typeof warning !== 'string' && warning) {
          this._warnings.push(warning);
          this.emit('warning', warning);
        }
      });
    }

    get startTime(): number | undefined {
      return this._startTime;
    }

    get endTime(): number | undefined {
      return this._endTime;
    }

    get latestSample(): RTCSample | undefined {
      return this._latestSample;
    }

    get results(): TestResults | undefined {
      return this._results;
    }

    get status(): TestStatus {
      return this._status;
    }

    cancel(): void {
      this._device.once('offline', () => this._onComplete());
      this._device.destroy();
    }
  }

  export enum FatalError {
    IceConnectionFailed,
    InvalidToken,
    MediaPermissionsDenied,
    MediaPermissionsFailed,
    NoDevicesFound,
    SignalingConnectionFailed,
    UnsupportedBrowser,
  }

  export enum NonFatalError {
    InsightsConnectionFailed,
  }

  export enum TestStatus {
    Connecting = 'connecting',
    Connected = 'connected',
    Completed = 'completed',
    Failed = 'failed',
  }

  export interface PreflightOptions {
    callSeconds?: number;
    codecPreferences?: Connection.Codec[];
    dialTo: string;
  }

  export interface TestResults {
    averageSample: RTCSample | null;
    errors: NonFatalError[];
    samples: RTCSample[];
    warnings: RTCWarning[];
  }

 }

export default Voice;
