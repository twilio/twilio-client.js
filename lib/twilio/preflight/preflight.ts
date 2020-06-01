/**
 * @packageDocumentation
 * @module Voice
 * @preferred
 * @publicapi
 */
import { EventEmitter } from 'events';
import Connection from '../connection';
import Device from '../device';
import { NotSupportedError } from '../errors';
import { RTCSampleTotals } from '../rtc/sample';
import RTCSample from '../rtc/sample';
import { getRTCIceCandidates } from '../rtc/stats';
import RTCWarning from '../rtc/warning';
import StatsMonitor from '../statsMonitor';
import { NetworkTiming, TimeMeasurement } from './timing';

const { COWBELL_AUDIO_URL, ECHO_TEST_DURATION } = require('../constants');

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
   * The timer when doing an echo test
   * The echo test is used when fakeMicInput is set to true
   */
  private _echoTimer: NodeJS.Timer;

  /**
   * The edge that the `Twilio.Device` connected to.
   */
  private _edge: string | undefined;

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
  private _options: PreflightTest.ExtendedOptions = {
    codecPreferences: [Connection.Codec.PCMU, Connection.Codec.Opus],
    debug: false,
    edge: 'roaming',
    fakeMicInput: false,
    signalingTimeoutMs: 10000,
  };

  /**
   * The report for this test.
   */
  private _report: PreflightTest.Report | undefined;

  /**
   * The WebRTC ICE candidates information collected during the test
   */
  private _rtcIceCandidates: PreflightTest.RTCIceCandidates;

  /**
   * WebRTC samples collected during this test
   */
  private _samples: RTCSample[];

  /**
   * Timer for setting up signaling connection
   */
  private _signalingTimeoutTimer: number;

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

    this._initDevice(token, {
      ...this._options,
      fileInputStream: this._options.fakeMicInput ?
        this._getStreamFromFile() : undefined,
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
    if (this._device) {
      this._device.once('offline', () => this._onFailed(error));
      this._device.destroy();
    } else {
      this._onFailed(error);
    }
  }

  /**
   * Emit a warning
   */
  private _emitWarning(name: string, data: RTCWarning): void {
    this._warnings.push({ name, data });
    this.emit(PreflightTest.Events.Warning, name, data);
  }

  /**
   * Returns call quality base on the RTC Stats
   */
  private _getCallQuality(mos: number): PreflightTest.CallQuality {
    if (mos > 4.2) {
      return PreflightTest.CallQuality.Excellent;
    } else if (mos >= 4.1 && mos <= 4.2) {
      return PreflightTest.CallQuality.Great;
    } else if (mos >= 3.7 && mos <= 4) {
      return PreflightTest.CallQuality.Good;
    } else if (mos >= 3.1 && mos <= 3.6) {
      return PreflightTest.CallQuality.Fair;
    } else {
      return PreflightTest.CallQuality.Degraded;
    }
  }

  /**
   * Returns the report for this test.
   */
  private _getReport(): PreflightTest.Report {
    const stats = this._getRTCStats();
    const testTiming: TimeMeasurement = { start: this._startTime };
    if (this._endTime) {
      testTiming.end = this._endTime;
      testTiming.duration  = this._endTime - this._startTime;
    }

    const selectedIceCandidatePair = this._rtcIceCandidates.selectedIceCandidatePair;
    const isTurnRequired = selectedIceCandidatePair.localCandidate.candidateType === 'relay'
      || selectedIceCandidatePair.remoteCandidate.candidateType === 'relay';

    const report: PreflightTest.Report = {
      callSid: this._callSid,
      edge: this._edge,
      iceCandidates: this._rtcIceCandidates.iceCandidates,
      isTurnRequired,
      networkTiming: this._networkTiming,
      samples: this._samples,
      selectedEdge: this._options.edge,
      selectedIceCandidatePair,
      stats,
      testTiming,
      totals: this._getRTCSampleTotals(),
      warnings: this._warnings,
    };

    if (stats) {
      report.callQuality = this._getCallQuality(stats.mos.average);
    }

    return report;
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
    const firstMosSampleIdx = this._samples.findIndex(
      sample => typeof sample.mos === 'number' && sample.mos > 0,
    );

    const samples = firstMosSampleIdx >= 0
      ? this._samples.slice(firstMosSampleIdx)
      : [];

    if (!samples || !samples.length) {
      return;
    }

    return ['jitter', 'mos', 'rtt'].reduce((statObj, stat) => {
      const values = samples.map(s => s[stat]);
      return {
        ...statObj,
        [stat]: {
          average: Number((values.reduce((total, value) => total + value) / values.length).toPrecision(5)),
          max: Math.max(...values),
          min: Math.min(...values),
        },
      };
    }, {} as any);
  }

  /**
   * Returns a MediaStream from a media file
   */
  private _getStreamFromFile(): MediaStream {
    const audioContext = this._options.audioContext;
    if (!audioContext) {
      throw new NotSupportedError('Cannot fake input audio stream: AudioContext is not supported by this browser.');
    }

    const audioEl: any = new Audio(COWBELL_AUDIO_URL);

    audioEl.addEventListener('canplaythrough', () => audioEl.play());
    if (typeof audioEl.setAttribute === 'function') {
      audioEl.setAttribute('crossorigin', 'anonymous');
    }

    const src = audioContext.createMediaElementSource(audioEl);
    const dest = audioContext.createMediaStreamDestination();
    src.connect(dest);

    return dest.stream;
  }

  /**
   * Initialize the device
   */
  private _initDevice(token: string, options: PreflightTest.ExtendedOptions): void {
    try {
      this._device = new (options.deviceFactory || Device)(token, {
        codecPreferences: options.codecPreferences,
        debug: options.debug,
        edge: options.edge,
        fileInputStream: options.fileInputStream,
        iceServers: options.iceServers,
        rtcConfiguration: options.rtcConfiguration,
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

    this._signalingTimeoutTimer = setTimeout(() => {
      this._onDeviceError({
        code: 31901,
        message: 'WebSocket - Connection Timeout',
      });
    }, options.signalingTimeoutMs);
  }

  /**
   * Mute the output audio for a given connection without affecting audio levels
   */
  private _muteAudioOutput(connection: Connection): void {
    // Muting just the output audio is not a public API
    // Let's access internals for preflight
    if (connection.mediaStream) {
      const stream = connection.mediaStream;
      if (stream._masterAudio) {
        stream._masterAudio.muted = true;
      }
      stream.__fallbackOnAddTrack = stream._fallbackOnAddTrack;
      stream._fallbackOnAddTrack = (...args: any[]) => {
        const rval = stream.__fallbackOnAddTrack(...args);
        stream.outputs.get('default').audio.muted = true;
        return rval;
      };
    }
  }

  /**
   * Called when the test has been completed
   */
  private _onCompleted(): void {
    clearTimeout(this._echoTimer);
    clearTimeout(this._signalingTimeoutTimer);

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
    clearTimeout(this._echoTimer);
    clearTimeout(this._signalingTimeoutTimer);

    this._connection = this._device.connect();
    this._setupConnectionHandlers(this._connection);

    this._edge = this._device.edge || undefined;
    if (this._options.fakeMicInput) {
      this._echoTimer = setTimeout(() => this._device.disconnectAll(), ECHO_TEST_DURATION);

      // Mute sounds
      const audio = this._device.audio as any;
      if (audio) {
        audio.disconnect(false);
        audio.outgoing(false);
      }
    }

    this._device.once('disconnect', () => {
      this._device.once('offline', () => this._onCompleted());
      this._device.destroy();
    });

    // Connection doesn't currently exposes this
    // Accessing the internals for now for preflight
    const monitor = this._connection['_monitor'] as StatsMonitor;
    monitor['_thresholds'].audioInputLevel!.maxDuration = 5;
    monitor['_thresholds'].audioOutputLevel!.maxDuration = 5;
    monitor.on('warning', (data: RTCWarning) => {
      let name = data.name;
      const threshold = data.threshold!.name;
      if (threshold === 'maxDuration' && (name === 'audioInputLevel' || name === 'audioOutputLevel')) {
        name = `constant-${name.split(/(?=[A-Z])/).join('-').toLowerCase()}`;
        this._emitWarning(name, data);
      }
    });
  }

  /**
   * Called when there is a fatal error
   * @param error
   */
  private _onFailed(error: Device.Error | DOMError): void {
    clearTimeout(this._echoTimer);
    clearTimeout(this._signalingTimeoutTimer);
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
      // Constant audio warnings are handled by StatsMonitor
      if (name.includes('constant-audio')) {
        return;
      }
      this._emitWarning(name, data);
    });

    connection.once('accept', () => {
      if (this._options.fakeMicInput) {
        this._muteAudioOutput(connection);
      }
      this._callSid = connection.mediaStream.callSid;
      this._status = PreflightTest.Status.Connected;
      this.emit(PreflightTest.Events.Connected);
    });

    connection.on('sample', async (sample) => {
      // RTC Stats are ready. We only need to get ICE candidate stats report once.
      if (!this._latestSample) {
        this._rtcIceCandidates = await (
          this._options.getRTCIceCandidates || getRTCIceCandidates
        )(connection.mediaStream.version.pc);
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
   * The quality of the call determined by different mos ranges.
   * Mos is calculated base on the WebRTC stats - rtt, jitter, and packet lost.
   */
  export enum CallQuality {
    /**
     * If the average mos is over 4.2.
     */
    Excellent = 'excellent',

    /**
     * If the average mos is between 4.1 and 4.2 both inclusive.
     */
    Great = 'great',

    /**
     * If the average mos is between 3.7 and 4.0 both inclusive.
     */
    Good = 'good',

    /**
     * If the average mos is between 3.1 and 3.6 both inclusive.
     */
    Fair = 'fair',

    /**
     * If the average mos is 3.0 or below.
     */
    Degraded = 'degraded',
  }

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
   * The WebRTC API's [RTCIceCandidateStats](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateStats)
   * dictionary which provides information related to an ICE candidate.
   */
  export type RTCIceCandidateStats = any;

  /**
   * Options that may be passed to {@link PreflightTest} constructor for internal testing.
   * @internalapi
   */
  export interface ExtendedOptions extends Options {
    /**
     * The AudioContext instance to use
     */
    audioContext?: AudioContext;

    /**
     * Device class to use.
     */
    deviceFactory?: new (token: string, options: Device.Options) => Device;

    /**
     * File input stream to use instead of reading from mic
     */
    fileInputStream?: MediaStream;

    /**
     * The getRTCIceCandidates to use for testing.
     */
    getRTCIceCandidates?: Function;

    /**
     * An RTCConfiguration to pass to the RTCPeerConnection constructor during `Device.setup`.
     */
    rtcConfiguration?: RTCConfiguration;
  }

  /**
   * A WebRTC stats report containing relevant information about selected and gathered ICE candidates
   */
  export interface RTCIceCandidates {
    /**
     * An array of ICE candidates gathered when connecting to media.
     */
    iceCandidates: RTCIceCandidateStats[];

    /**
     * The ICE candidate pair used to connect to media.
     */
    selectedIceCandidatePair: RTCSelectedIceCandidatePair;
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
     * [page](https://www.twilio.com/docs/voice/client/edges)
     * for the list of available edges.
     * @default roaming
     */
    edge?: string;

    /**
     * If set to `true`, the test call will ignore microphone input and will use a default audio file.
     * If set to `false`, the test call will capture the audio from the microphone.
     * Setting this to `true` is only supported on Chrome and will throw a fatal error on other browsers
     * @default false
     */
    fakeMicInput?: boolean;

    /**
     * An array of custom ICE servers to use to connect media. If you provide both STUN and TURN server configurations,
     * the test will detect whether a TURN server is required to establish a connection.
     *
     * The following example demonstrates how to use [Twilio's Network Traversal Service](https://www.twilio.com/stun-turn)
     * to generate STUN/TURN credentials and how to specify a specific [edge location](https://www.twilio.com/docs/global-infrastructure/edge-locations).
     *
     * ```ts
     * import Client from 'twilio';
     * import { Device } from 'twilio-client';
     *
     * // Generate the STUN and TURN server credentials with a ttl of 120 seconds
     * const client = Client(twilioAccountSid, authToken);
     * const token = await client.tokens.create({ ttl: 120 });
     *
     * let iceServers = token.iceServers;
     *
     * // By default, global will be used as the default edge location.
     * // You can replace global with a specific edge name for each of the iceServer configuration.
     * iceServers = iceServers.map(config => {
     *   let { url, urls, ...rest } = config;
     *   url = url.replace('global', 'ashburn');
     *   urls = urls.replace('global', 'ashburn');
     *
     *   return { url, urls, ...rest };
     * });
     *
     * // Use the TURN credentials using the iceServers parameter
     * const preflightTest = Device.testPreflight(token, { iceServers });
     *
     * // Read from the report object to determine whether TURN is required to connect to media
     * preflightTest.on('completed', (report) => {
     *   console.log(report.isTurnRequired);
     * });
     * ```
     *
     * @default null
     */
    iceServers?: RTCIceServer[];

    /**
     * Amount of time to wait for setting up signaling connection.
     * @default 10000
     */
    signalingTimeoutMs?: number;
  }

  /**
   * Represents the ICE candidate pair used to connect to media.
   */
  export interface RTCSelectedIceCandidatePair {
    /**
     * An [RTCIceCandidateStats](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateStats)
     * object which provides information related to the selected local ICE candidate.
     */
    localCandidate: RTCIceCandidateStats;

    /**
     * An [RTCIceCandidateStats](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateStats)
     * object which provides information related to the selected remote ICE candidate.
     */
    remoteCandidate: RTCIceCandidateStats;
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
     * The quality of the call determined by different mos ranges.
     */
    callQuality?: CallQuality;

    /**
     * CallSid generaged during the test.
     */
    callSid: string | undefined;

    /**
     * The edge that the test call was connected to.
     */
    edge?: string;

    /**
     * An array of ICE candidates gathered when connecting to media.
     */
    iceCandidates: RTCIceCandidateStats[];

    /**
     * Whether a TURN server is required to connect to media.
     * This is dependent on your ICE server configuration and is set to true if the selected ICE candidate is of type `relay`
     * See `PreflightTest.Options.iceServers` for more details.
     */
    isTurnRequired: boolean;

    /**
     * Network related time measurements.
     */
    networkTiming: NetworkTiming;

    /**
     * WebRTC samples collected during the test.
     */
    samples: RTCSample[];

    /**
     * The edge passed to `Device.testPreflight`.
     */
    selectedEdge?: string;

    /**
     * The ICE candidate pair used to connect to media.
     */
    selectedIceCandidatePair: RTCSelectedIceCandidatePair;

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
