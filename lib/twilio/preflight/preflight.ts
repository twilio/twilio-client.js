/**
 * @module Voice
 * @preferred
 * @publicapi
 */
import { EventEmitter } from 'events';
import Connection from '../connection';
import Device from '../device';
import { RTCSampleTotals } from '../rtc/sample';
import RTCSample from '../rtc/sample';
import RTCWarning from '../rtc/warning';
import { NetworkTiming, TimeMeasurement } from './timing';

/**
 * A {@link PreflightTest} runs some tests to identify issues, if any, prohibiting successful calling.
 * @publicapi
 */
class PreflightTest extends EventEmitter {
  /**
   * Callsid generated for this test call
   */
  private _callSid: string | undefined;

  /**
   * The {@link Connection} for this test call
   */
  private _connection: Connection;

  /**
   * The {@link Device} for this test call
   */
  private _device: Device;

  /**
   * End of test timestamp
   */
  private _endTime: number | undefined;

  /**
   * Non-fatal errors detected during this test
   */
  private _errors: PreflightTest.NonFatalError[];

  /**
   * Latest WebRTC sample collected for this test
   */
  private _latestSample: RTCSample | undefined;

  /**
   * Network related timing measurements for this test
   */
  private _networkTiming: NetworkTiming = {};

  /**
   * The options passed to {@link PreflightTest} constructor
   */
  private _options: PreflightTest.PreflightOptions = {
    codecPreferences: [Connection.Codec.PCMU, Connection.Codec.Opus],
  };

  /**
   * Results of this test
   */
  private _results: PreflightTest.TestResults | undefined;

  /**
   * WebRTC samples collected during this test
   */
  private _samples: RTCSample[];

  /**
   * Start of test timestamp
   */
  private _startTime: number;

  /**
   * Current status of this test
   */
  private _status: PreflightTest.TestStatus = PreflightTest.TestStatus.Connecting;

  /**
   * List of warning names and warning data detected during this test
   */
  private _warnings: PreflightTest.PreflightWarning[];

  /**
   * Construct a {@link PreflightTest} instance
   * @constructor
   * @param [token] - A Twilio JWT token string
   * @param [options]
   */
  constructor(token: string, options: PreflightTest.ExtendedPreflightOptions) {
    super();

    Object.assign(this._options, options);

    this._errors = [];
    this._samples = [];
    this._warnings = [];
    this._startTime = Date.now();

    try {
      this._device = new (options.deviceFactory || Device)(token, {
        codecPreferences: this._options.codecPreferences,
        debug: false,
      });
    } catch {
      // We want to return before failing so the consumer can capture the event
      setTimeout(() => {
        this._onFailed(PreflightTest.FatalError.UnsupportedBrowser);
      });
      return;
    }

    this._device.on('ready', () => {
      this._onDeviceReady();
    });

    this._device.on('error', (error: Device.Error) => {
      this._onDeviceError(error);
    });
  }

  /**
   * Cancels the current test and raises failed event
   */
  cancel(): void {
    this._device.once('offline', () => this._onFailed(PreflightTest.FatalError.CallCancelled));
    this._device.destroy();
  }

  /**
   * Returns the results of the test call
   */
  private _getResults(): PreflightTest.TestResults {
    const testTiming: TimeMeasurement = { start: this._startTime };
    if (this._endTime) {
      testTiming.end = this._endTime;
      testTiming.duration  = this._endTime - this._startTime;
    }
    return {
      callSid: this._callSid,
      errors: this._errors,
      networkTiming: this._networkTiming,
      samples: this._samples,
      stats: this._getRTCStats(),
      testTiming,
      totals: this._getRTCSampleTotals(),
      warnings: this._warnings,
    };
  }

  /**
   * Returns RTC stats totals for this test
   */
  private _getRTCSampleTotals(): RTCSampleTotals | undefined {
    if (!this._latestSample) {
      return;
    }

    return { ...this._latestSample.totals };
  }

  /**
   * Returns RTC related stats captured during the test call
   */
  private _getRTCStats(): PreflightTest.RTCStats | undefined {
    if (!this._samples || !this._samples.length) {
      return;
    }

    return ['jitter', 'mos', 'rtt'].reduce((statObj, stat) => {
      const values = this._samples.map(s => s[stat]);
      return {
        ...statObj,
        [stat]: {
          average: values.reduce((total, value) => total + value) / values.length,
          max: Math.max(...values),
          min: Math.min(...values),
        },
      };
    }, {} as any);
  }

  /**
   * Called when the test has been completed
   */
  private _onCompleted(): void {
    this._releaseHandlers();
    this._endTime = Date.now();
    this._status = PreflightTest.TestStatus.Completed;
    this._results = this._getResults();
    this.emit('completed', this._results);
  }

  /**
   * Called on {@link Device} error event
   * @param error
   */
  private _onDeviceError(error: Device.Error): void {
    let fatalError: PreflightTest.FatalError = PreflightTest.FatalError.UnknownError;
    switch (error.code) {
      case 31400:
        this._errors.push(PreflightTest.NonFatalError.InsightsConnectionFailed);
        this.emit('error', PreflightTest.NonFatalError.InsightsConnectionFailed, error);
        return;
      case 31000:
        fatalError = PreflightTest.FatalError.SignalingConnectionFailed;
        break;
      case 31003:
        fatalError = PreflightTest.FatalError.IceConnectionFailed;
        break;
      case 20101:
        fatalError = PreflightTest.FatalError.InvalidToken;
        break;
      case 31208:
        fatalError = PreflightTest.FatalError.MediaPermissionsFailed;
        break;
      case 31201:
        fatalError = PreflightTest.FatalError.NoDevicesFound;
        break;
    }
    this._device.destroy();
    this._onFailed(fatalError, error);
  }

  /**
   * Called on {@link Device} ready event
   */
  private _onDeviceReady(): void {
    this._connection = this._device.connect();
    this._setupConnectionHandlers(this._connection);

    this._device.once('disconnect', () => {
      this._device.once('offline', () => this._onCompleted());
      this._device.destroy();
    });
  }

  /**
   * Called when there is a fatal error
   * @param error
   */
  private _onFailed(reason: PreflightTest.FatalError, error?: Device.Error): void {
    this._releaseHandlers();
    this._endTime = Date.now();
    this._status = PreflightTest.TestStatus.Failed;
    this.emit('failed', reason, error);
  }

  /**
   * Clean up all handlers for device and connection
   */
  private _releaseHandlers(): void {
    [this._device, this._connection].forEach((emitter: EventEmitter) => {
      if (emitter) {
        emitter.eventNames().forEach((name: string) => emitter.removeAllListeners(name));
      }
    });
  }

  /**
   * Setup the event handlers for the {@link Connection} of the test call
   * @param connection
   */
  private _setupConnectionHandlers(connection: Connection): void {
    connection.on('warning', (name: string, data: RTCWarning) => {
      this._warnings.push({ name, data });
      this.emit('warning', name, data);
    });

    connection.once('accept', () => {
      this._callSid = connection.mediaStream.callSid;
      this._status = PreflightTest.TestStatus.Connected;
      this.emit(PreflightTest.TestStatus.Connected);
    });

    connection.on('sample', (sample) => {
      // This is the first sample and no mos yet
      if (typeof sample.mos !== 'number') {
        return;
      }
      this._latestSample = sample;
      this._samples.push(sample);
      this.emit('sample', sample);
    });

    // TODO: Update the following once the SDK supports emitting these events
    // Let's shim for now
    [{
      reportLabel: 'peerConnection',
      type: 'pcconnection',
     }, {
      reportLabel: 'ice',
      type: 'iceconnection',
     }, {
      reportLabel: 'dtls',
      type: 'dtlstransport',
     }].forEach(({type, reportLabel}) => {

      const handlerName = `on${type}statechange`;
      const originalHandler = connection.mediaStream[handlerName];

      connection.mediaStream[handlerName] = (state: string) => {
        const timing = (this._networkTiming as any)[reportLabel]
          = (this._networkTiming as any)[reportLabel] || { start: 0 };

        if (state === 'connecting' || state === 'checking') {
          timing.start = Date.now();
        } else if (state === 'connected') {
          timing.end = Date.now();
          timing.duration = timing.end - timing.start;
        }

        originalHandler(state);
      };
    });
  }

  /**
   * Return the callsid generated for this test call
   */
  get callSid(): string | undefined {
    return this._callSid;
  }

  /**
   * Return the end of the test timestamp
   */
  get endTime(): number | undefined {
    return this._endTime;
  }

  /**
   * Returns the latest WebRTC sample collected
   */
  get latestSample(): RTCSample | undefined {
    return this._latestSample;
  }

  /**
   * Returns the results of the test
   */
  get results(): PreflightTest.TestResults | undefined {
    return this._results;
  }

  /**
   * Return the start of the test timestamp
   */
  get startTime(): number {
    return this._startTime;
  }

  /**
   * Returns the status of the current test
   */
  get status(): PreflightTest.TestStatus {
    return this._status;
  }
}

namespace PreflightTest {
  /**
   * Possible fatal errors
   */
  export enum FatalError {
    CallCancelled = 'CallCancelled',
    IceConnectionFailed = 'IceConnectionFailed',
    InvalidToken = 'InvalidToken',
    MediaPermissionsFailed = 'MediaPermissionsFailed',
    NoDevicesFound = 'NoDevicesFound',
    SignalingConnectionFailed = 'SignalingConnectionFailed',
    UnknownError = 'UnknownError',
    UnsupportedBrowser = 'UnsupportedBrowser',
  }

  /**
   * Possible non fatal errors
   */
  export enum NonFatalError {
    InsightsConnectionFailed = 'InsightsConnectionFailed',
  }

  /**
   * Possible status of the test
   */
  export enum TestStatus {
    Connecting = 'connecting',
    Connected = 'connected',
    Completed = 'completed',
    Failed = 'failed',
  }

  /**
   * Options that may be passed to {@link PreflightTest} constructor for internal testing
   * @private
   */
  export interface ExtendedPreflightOptions extends PreflightOptions {
    /**
     * Device class to use
     */
    deviceFactory?: new (token: string, options: Device.Options) => Device;
  }

  /**
   * Options passed to {@link PreflightTest} constructor
   */
  export interface PreflightOptions {
    /**
     * An ordered array of codec names that will be used during the test call,
     * from most to least preferred.
     */
    codecPreferences?: Connection.Codec[];
  }

  /**
   * Represents the warning emitted from Voice SDK
   */
  export interface PreflightWarning {
    /**
     * Warning data associated with the warning
     */
    data: RTCWarning;

    /**
     * Name of the warning
     */
    name: string;
  }

  /**
   * Represents RTC related stats that are extracted from RTC samples
   */
  export interface RTCStats {
    /**
     * Packets delay variation
     */
    jitter: Stats;

    /**
     * Mean opinion score, 1.0 through roughly 4.5
     */
    mos: Stats;

    /**
     * Round trip time, to the server back to the client.
     */
    rtt: Stats;
  }

  /**
   * Represents general stats for a specific metric
   */
  export interface Stats {
    /**
     * The average value for this metric
     */
    average: number;

    /**
     * The maximum value for this metric
     */
    max: number;

    /**
     * The minimum value for this metric
     */
    min: number;
  }

  /**
   * Represents the results of the {@link PreflightTest}
   */
  export interface TestResults {
    /**
     * CallSid generaged during the test
     */
    callSid: string | undefined;

    /**
     * Non-fatal errors detected during the test
     */
    errors: PreflightTest.NonFatalError[];

    /**
     * Network related timing measurements
     */
    networkTiming: NetworkTiming;

    /**
     * WebRTC samples collected during the test
     */
    samples: RTCSample[];

    /**
     * RTC related stats captured during the test
     */
    stats?: RTCStats;

    /**
     * Timing measurements of the test
     */
    testTiming: TimeMeasurement;

    /**
     * Totals in RTC statistics samples
     */
    totals?: RTCSampleTotals;

    /**
     * List of warning names and warning data detected during this test
     */
    warnings: PreflightWarning[];
  }
 }

export default PreflightTest;
