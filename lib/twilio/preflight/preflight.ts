/**
 * @packageDocumentation
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

export declare interface PreflightTest {
  /**
   * Raised when [[PreflightTest.status]] has transitioned to [[PreflightTest.Status.Completed]].
   * During this time, [[PreflightTest.report]] is available and ready to be inspected.
   * In some cases, this will not trigger if the test encounters a fatal error prior connecting to Twilio.
   * See [[PreflightTest.failedEvent]].
   * @param report
   * @example `preflight.on('completed', report => console.log(report))`
   * @event
   */
  completedEvent(report: PreflightTest.Report): void;

  /**
   * Raised when [[PreflightTest.status]] has transitioned to [[PreflightTest.Status.Connected]].
   * @example `preflight.on('connected', () => console.log('Test connected'))`
   * @event
   */
  connectedEvent(): void;

  /**
   * Raised when [[PreflightTest.status]] has transitioned to [[PreflightTest.Status.Failed]].
   * This happens when establishing a connection to Twilio has failed or when a test call has encountered a fatal error.
   * This is also raised if [[PreflightTest.stop]] is called while the test is in progress.
   * @param error
   * @example `preflight.on('failed', error => console.log(error))`
   * @event
   */
  failedEvent(error: Device.Error | DOMError): void;

  /**
   * Raised when the [[Connection]] gets a webrtc sample object. This event is published every second.
   * @param sample
   * @example `preflight.on('sample', sample => console.log(sample))`
   * @event
   */
  sampleEvent(sample: RTCSample): void;

  /**
   * Raised whenever the [[Connection]] encounters a warning.
   * @param name - The name of the warning.
   * @example `preflight.on('warning', (name, data) => console.log({ name, data }))`
   * @event
   */
  warningEvent(name: string, data: RTCWarning): void;
}

/**
 * Runs some tests to identify issues, if any, prohibiting successful calling.
 */
export class PreflightTest extends EventEmitter {
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
  private _options: PreflightTest.Options = {
    codecPreferences: [Connection.Codec.PCMU, Connection.Codec.Opus],
    debug: false,
    region: 'gll',
  };

  /**
   * The region that the `Twilio.Device` connected to.
   */
  private _region: string | undefined;

  /**
   * The report for this test.
   */
  private _report: PreflightTest.Report | undefined;

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
  private _status: PreflightTest.Status = PreflightTest.Status.Connecting;

  /**
   * List of warning names and warning data detected during this test
   */
  private _warnings: PreflightTest.Warning[];

  /**
   * Construct a {@link PreflightTest} instance.
   * @constructor
   * @param token - A Twilio JWT token string.
   * @param options
   */
  constructor(token: string, options: PreflightTest.ExtendedOptions) {
    super();

    Object.assign(this._options, options);

    this._samples = [];
    this._warnings = [];
    this._startTime = Date.now();

    try {
      this._device = new (options.deviceFactory || Device)(token, {
        codecPreferences: this._options.codecPreferences,
        debug: this._options.debug,
        region: this._options.region,
      });
    } catch (error) {
      // We want to return before failing so the consumer can capture the event
      setTimeout(() => {
        this._onFailed(error);
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
   * Stops the current test and raises a failed event.
   */
  stop(): void {
    const error: Device.Error = {
      code: 31008,
      message: 'Call cancelled',
    };
    this._device.once('offline', () => this._onFailed(error));
    this._device.destroy();
  }

  /**
   * Returns the report for this test.
   */
  private _getReport(): PreflightTest.Report {
    const testTiming: TimeMeasurement = { start: this._startTime };
    if (this._endTime) {
      testTiming.end = this._endTime;
      testTiming.duration  = this._endTime - this._startTime;
    }
    return {
      callSid: this._callSid,
      networkTiming: this._networkTiming,
      region: this._region,
      samples: this._samples,
      selectedRegion: this._options.region,
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
    this._status = PreflightTest.Status.Completed;
    this._report = this._getReport();
    this.emit(PreflightTest.Events.Completed, this._report);
  }

  /**
   * Called on {@link Device} error event
   * @param error
   */
  private _onDeviceError(error: Device.Error): void {
    this._device.destroy();
    this._onFailed(error);
  }

  /**
   * Called on {@link Device} ready event
   */
  private _onDeviceReady(): void {
    this._connection = this._device.connect();
    this._setupConnectionHandlers(this._connection);
    this._region = this._device.region();

    this._device.once('disconnect', () => {
      this._device.once('offline', () => this._onCompleted());
      this._device.destroy();
    });
  }

  /**
   * Called when there is a fatal error
   * @param error
   */
  private _onFailed(error: Device.Error | DOMError): void {
    this._releaseHandlers();
    this._endTime = Date.now();
    this._status = PreflightTest.Status.Failed;
    this.emit(PreflightTest.Events.Failed, error);
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
      this.emit(PreflightTest.Events.Warning, name, data);
    });

    connection.once('accept', () => {
      this._callSid = connection.mediaStream.callSid;
      this._status = PreflightTest.Status.Connected;
      this.emit(PreflightTest.Events.Connected);
    });

    connection.on('sample', (sample) => {
      // This is the first sample and no mos yet
      if (typeof sample.mos !== 'number' && !this._samples.length) {
        return;
      }
      this._latestSample = sample;
      this._samples.push(sample);
      this.emit(PreflightTest.Events.Sample, sample);
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
   * The callsid generated for the test call.
   */
  get callSid(): string | undefined {
    return this._callSid;
  }

  /**
   * A timestamp in milliseconds of when the test ended.
   */
  get endTime(): number | undefined {
    return this._endTime;
  }

  /**
   * The latest WebRTC sample collected.
   */
  get latestSample(): RTCSample | undefined {
    return this._latestSample;
  }

  /**
   * The report for this test.
   */
  get report(): PreflightTest.Report | undefined {
    return this._report;
  }

  /**
   * A timestamp in milliseconds of when the test started.
   */
  get startTime(): number {
    return this._startTime;
  }

  /**
   * The status of the test.
   */
  get status(): PreflightTest.Status {
    return this._status;
  }
}

export namespace PreflightTest {
  /**
   * Possible events that a [[PreflightTest]] might emit.
   */
  export enum Events {
    /**
     * See [[PreflightTest.completedEvent]]
     */
    Completed = 'completed',

    /**
     * See [[PreflightTest.connectedEvent]]
     */
    Connected = 'connected',

    /**
     * See [[PreflightTest.failedEvent]]
     */
    Failed = 'failed',

    /**
     * See [[PreflightTest.sampleEvent]]
     */
    Sample = 'sample',

    /**
     * See [[PreflightTest.warningEvent]]
     */
    Warning = 'warning',
  }

  /**
   * Possible status of the test.
   */
  export enum Status {
    /**
     * Connection to Twilio has initiated.
     */
    Connecting = 'connecting',

    /**
     * Connection to Twilio has been established.
     */
    Connected = 'connected',

    /**
     * The connection to Twilio has been disconnected and the test call has completed.
     */
    Completed = 'completed',

    /**
     * The test has stopped and failed.
     */
    Failed = 'failed',
  }

  /**
   * Options that may be passed to {@link PreflightTest} constructor for internal testing.
   * @internalapi
   */
  export interface ExtendedOptions extends Options {
    /**
     * Device class to use.
     */
    deviceFactory?: new (token: string, options: Device.Options) => Device;
  }

  /**
   * Options passed to {@link PreflightTest} constructor.
   */
  export interface Options {
    /**
     * An ordered array of codec names that will be used during the test call,
     * from most to least preferred.
     * @default ['pcmu','opus']
     */
    codecPreferences?: Connection.Codec[];

    /**
     * Whether to enable debug logging.
     * @default false
     */
    debug?: boolean;

    /**
     * Specifies which Twilio Data Center to use when initiating the test call.
     * Please see this
     * [page](https://www.twilio.com/docs/voice/client/regions#twilio-js-regions)
     * for the list of available regions.
     */
    region?: string;
  }

  /**
   * Represents the warning emitted from VoiceJS SDK.
   */
  export interface Warning {
    /**
     * Data coming from VoiceJS SDK associated with the warning.
     */
    data: RTCWarning;

    /**
     * Name of the warning.
     */
    name: string;
  }

  /**
   * Represents RTC related stats that are extracted from RTC samples.
   */
  export interface RTCStats {
    /**
     * Packets delay variation.
     */
    jitter: Stats;

    /**
     * Mean opinion score, 1.0 through roughly 4.5.
     */
    mos: Stats;

    /**
     * Round trip time, to the server back to the client.
     */
    rtt: Stats;
  }

  /**
   * Represents general stats for a specific metric.
   */
  export interface Stats {
    /**
     * The average value for this metric.
     */
    average: number;

    /**
     * The maximum value for this metric.
     */
    max: number;

    /**
     * The minimum value for this metric.
     */
    min: number;
  }

  /**
   * Represents the report generated from a {@link PreflightTest}.
   */
  export interface Report {
    /**
     * CallSid generaged during the test.
     */
    callSid: string | undefined;

    /**
     * Network related time measurements.
     */
    networkTiming: NetworkTiming;

    /**
     * The region that the test call was connected to.
     */
    region?: string;

    /**
     * WebRTC samples collected during the test.
     */
    samples: RTCSample[];

    /**
     * The region passed to `Device.testPreflight`.
     */
    selectedRegion?: string;

    /**
     * RTC related stats captured during the test.
     */
    stats?: RTCStats;

    /**
     * Time measurements of test run time.
     */
    testTiming: TimeMeasurement;

    /**
     * Calculated totals in RTC statistics samples.
     */
    totals?: RTCSampleTotals;

    /**
     * List of warning names and warning data detected during this test.
     */
    warnings: Warning[];
  }
 }
