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

/**
 * A {@link PreflightTest} runs some tests to identify issues, if any, prohibiting successful calling.
 * @publicapi
 */
class PreflightTest extends EventEmitter {
  /**
   * Timeout id for when to end this test call
   */
  private _callTimeoutId: NodeJS.Timer;

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
   * The options passed to {@link PreflightTest} constructor
   */
  private _options: PreflightTest.PreflightOptions = {
    callSeconds: 15,
    codecPreferences: [Connection.Codec.PCMU, Connection.Codec.Opus],
    connectParams: {},
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
      this._onDeviceReady(this._options.connectParams);
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
   * Get the average values of the WebRTC samples collected during the call
   */
  private _getAverageSample(): RTCSample | null {
    if (!this._latestSample) {
      return null;
    }

    return this._samples.reduce((cumulativeAverage: RTCSample, currentSample: RTCSample, index: number) => {
      Object.keys(cumulativeAverage)
        .filter((key: string) => typeof cumulativeAverage[key] === 'number')
        .forEach((key: string) => {
          const currentAverage = index === 0 ? 0 : cumulativeAverage[key];
          // Cumulative average formula: avg = (x + n * avg) / (n + 1)
          cumulativeAverage[key] = (currentSample[key] + index * currentAverage) / (index + 1);
        });
      return cumulativeAverage;
    }, { ...this._latestSample });
  }

  /**
   * Returns the results of the test call
   */
  private _getResults(): PreflightTest.TestResults {
    return {
      averageSample: this._getAverageSample(),
      errors: this._errors,
      samples: this._samples,
      warnings: this._warnings,
    };
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
        this.emit('error', PreflightTest.NonFatalError.InsightsConnectionFailed);
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
    this._onFailed(fatalError);
  }

  /**
   * Called on {@link Device} ready event
   * @param connectParams - Parameters that will be sent to your Twilio Application via {@link Device.connect}
   */
  private _onDeviceReady(connectParams: Record<string, string>): void {
    this._connection = this._device.connect(connectParams);
    this._setupConnectionHandlers(this._connection);

    this._callTimeoutId = setTimeout(() => {
      this._device.once('offline', () => this._onCompleted());
      this._device.destroy();
    }, (this._options.callSeconds! * 1000));
  }

  /**
   * Called when there is a fatal error
   * @param error
   */
  private _onFailed(error: PreflightTest.FatalError): void {
    clearTimeout(this._callTimeoutId);
    this._releaseHandlers();
    this._endTime = Date.now();
    this._status = PreflightTest.TestStatus.Failed;
    this.emit('failed', error);
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
      this._status = PreflightTest.TestStatus.Connected;
      this.emit(PreflightTest.TestStatus.Connected);
    });

    connection.on('sample', (sample) => {
      this._latestSample = sample;
      this._samples.push(sample);
      this.emit('sample', sample);
    });
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
     * Maximum duration of the test call
     */
    callSeconds?: number;

    /**
     * An ordered array of codec names that will be used during the test call,
     * from most to least preferred.
     */
    codecPreferences?: Connection.Codec[];

    /**
     * Parameters that will be sent to your Twilio Application via {@link Device.connect}
     */
    connectParams: Record<string, string>;
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
   * Represents the results of the {@link PreflightTest}
   */
  export interface TestResults {
    /**
     * An RTCSample object containing average values of each RTC statistics
     */

    averageSample: RTCSample | null;

    /**
     * Non-fatal errors detected during the test
     */
    errors: PreflightTest.NonFatalError[];

    /**
     * WebRTC samples collected during the test
     */
    samples: RTCSample[];

    /**
     * List of warning names and warning data detected during this test
     */
    warnings: PreflightWarning[];
  }
 }

export default PreflightTest;
