/**
 * @module Voice
 * @publicapi
 * @internal
 */
import { EventEmitter } from 'events';
import Device from './device';
import DialtonePlayer from './dialtonePlayer';
import { Region } from './regions';
import RTCMonitor from './rtc/monitor';
import RTCSample from './rtc/sample';
import RTCWarning from './rtc/warning';
import Log, { LogLevel } from './tslog';
import { average, Exception } from './util';

const C = require('./constants');
const PeerConnection = require('./rtc').PeerConnection;

// Placeholders until we convert the respective files to TypeScript.
/**
 * @private
 */
export type IAudioHelper = any;
/**
 * @private
 */
export type IPStream = any;
/**
 * @private
 */
export type IPeerConnection = any;
/**
 * @private
 */
export type IPublisher = any;
/**
 * @private
 */
export type ISound = any;

// Placeholder until we implement the error classes
/**
 * @private
 */
export interface TwilioError {
  /**
   * Error code
   */
  code?: number;

  /**
   * Error message
   */
  message: string;
}

const DTMF_INTER_TONE_GAP: number = 70;
const DTMF_PAUSE_DURATION: number = 500;
const DTMF_TONE_DURATION: number = 160;

const ICE_RESTART_INTERVAL = 3000;
const METRICS_BATCH_SIZE: number = 10;
const METRICS_DELAY: number = 5000;

const WARNING_NAMES: Record<string, string> = {
  audioInputLevel: 'audio-input-level',
  audioOutputLevel: 'audio-output-level',
  bytesReceived: 'bytes-received',
  bytesSent: 'bytes-sent',
  jitter: 'jitter',
  mos: 'mos',
  packetsLostFraction: 'packet-loss',
  rtt: 'rtt',
};

const WARNING_PREFIXES: Record<string, string> = {
  max: 'high-',
  maxDuration: 'constant-',
  min: 'low-',
};

const CallCancelledError: TwilioError = { message: 'Call cancelled.' };
const MediaFailedError: TwilioError = { code: 53405, message: 'Media connection failed.' };
const WebsocketClosedError: TwilioError = { message: 'Websocket closed.' };

let hasBeenWarnedHandlers = false;

/**
 * A {@link Connection} represents a media and signaling connection to a TwiML application.
 * @publicapi
 */
class Connection extends EventEmitter {
  /**
   * String representation of the {@link Connection} class.
   * @private
   */
  static toString = () => '[Twilio.Connection class]';

  /**
   * The custom parameters sent to (outgoing) or received by (incoming) the TwiML app.
   */
  readonly customParameters: Map<string, string>;

  /**
   * Whether this {@link Connection} is incoming or outgoing.
   */
  get direction(): Connection.CallDirection {
    return this._direction;
  }

  /**
   * Audio codec used for this {@link Connection}. Expecting {@link Connection.Codec} but
   * will copy whatever we get from RTC stats.
   */
  get codec(): string {
    return this._codec;
  }

  /**
   * The MediaStream (Twilio PeerConnection) this {@link Connection} is using for
   * media signaling.
   * @private
   */
  mediaStream: IPeerConnection;

  /**
   * The temporary CallSid for this call, if it's outbound.
   */
  readonly outboundConnectionId?: string;

  /**
   * Call parameters received from Twilio for an incoming call.
   */
  parameters: Record<string, string> = { };

  /**
   * Audio codec used for this {@link Connection}. Expecting {@link Connection.Codec} but
   * will copy whatever we get from RTC stats.
   */
  private _codec: string;

  /**
   * Whether this {@link Connection} is incoming or outgoing.
   */
  private readonly _direction: Connection.CallDirection;

  /**
   * Interval id for ICE restart loop
   */
  private _iceRestartIntervalId: NodeJS.Timer;

  /**
   * The number of times input volume has been the same consecutively.
   */
  private _inputVolumeStreak: number = 0;

  /**
   * Keeps track of internal input volumes in the last second
   */
  private _internalInputVolumes: number[] = [];

  /**
   * Keeps track of internal output volumes in the last second
   */
  private _internalOutputVolumes: number[] = [];

  /**
   * Whether the call has been answered.
   */
  private _isAnswered: boolean = false;

  /**
   * Whether or not the browser uses unified-plan SDP by default.
   */
  private readonly _isUnifiedPlanDefault: boolean | undefined;

  /**
   * The most recent public input volume value. 0 -> 1 representing -100 to -30 dB.
   */
  private _latestInputVolume: number = 0;

  /**
   * The most recent public output volume value. 0 -> 1 representing -100 to -30 dB.
   */
  private _latestOutputVolume: number = 0;

  /**
   * An instance of Log to use.
   */
  private readonly _log: Log = new Log(LogLevel.Off);

  /**
   * A batch of metrics samples to send to Insights. Gets cleared after
   * each send and appended to on each new sample.
   */
  private readonly _metricsSamples: Connection.CallMetrics[] = [];

  /**
   * An instance of RTCMonitor.
   */
  private readonly _monitor: RTCMonitor;

  /**
   * The number of times output volume has been the same consecutively.
   */
  private _outputVolumeStreak: number = 0;

  /**
   * An instance of EventPublisher.
   */
  private readonly _publisher: IPublisher;

  /**
   * A Map of Sounds to play.
   */
  private readonly _soundcache: Map<Device.SoundName, ISound> = new Map();

  /**
   * State of the {@link Connection}.
   */
  private _state: Connection.State = Connection.State.Pending;

  /**
   * TwiML params for the call. May be set for either outgoing or incoming calls.
   */
  private readonly message: Record<string, string>;

  /**
   * Options passed to this {@link Connection}.
   */
  private options: Connection.Options = {
    debug: false,
    enableRingingState: false,
    mediaStreamFactory: PeerConnection,
    offerSdp: null,
    shouldPlayDisconnect: () => true,
  };

  /**
   * The PStream instance to use for Twilio call signaling.
   */
  private readonly pstream: IPStream;

  /**
   * Whether the {@link Connection} should send a hangup on disconnect.
   */
  private sendHangup: boolean = true;

  /**
   * @constructor
   * @private
   * @param config - Mandatory configuration options
   * @param [options] - Optional settings
   */
  constructor(config: Connection.Config, options?: Connection.Options) {
    super();

    this._isUnifiedPlanDefault = config.isUnifiedPlanDefault;
    this._soundcache = config.soundcache;
    this.message = options && options.twimlParams || { };
    this.customParameters = new Map(
      Object.entries(this.message).map(([key, val]: [string, any]): [string, string] => [key, String(val)]));

    Object.assign(this.options, options);

    if (this.options.callParameters) {
      this.parameters = this.options.callParameters;
    }

    this._direction = this.parameters.CallSid ? Connection.CallDirection.Incoming : Connection.CallDirection.Outgoing;

    this._log.setLogLevel(this.options.debug ? LogLevel.Debug
      : this.options.warnings ? LogLevel.Warn
      : LogLevel.Off);

    const publisher = this._publisher = config.publisher;

    if (this._direction === Connection.CallDirection.Incoming) {
      publisher.info('connection', 'incoming', null, this);
    }

    const monitor = this._monitor = new (this.options.RTCMonitor || RTCMonitor)();
    monitor.on('sample', this._onRTCSample);

    // First 20 seconds or so are choppy, so let's not bother with these warnings.
    monitor.disableWarnings();
    setTimeout(() => monitor.enableWarnings(), METRICS_DELAY);

    monitor.on('warning', (data: RTCWarning, wasCleared?: boolean) => {
      const { samples, name } = data;
      if (name === 'bytesSent' || name === 'bytesReceived') {

        if (samples && samples.every(sample => sample.totals[name] === 0)) {
          // We don't have relevant samples yet, usually at the start of a call.
          // This also may mean the browser does not support the required fields.
          return;
        }

        this._onIceDisconnected();
      }
      this._reemitWarning(data, wasCleared);
    });
    monitor.on('warning-cleared', (data: RTCWarning) => {
      const { samples, name } = data;
      if (name === 'bytesSent' || name === 'bytesReceived') {

        if (samples && samples.every(sample => sample.totals[name] === 0)) {
          // We don't have relevant samples yet, usually at the start of a call.
          // This also may mean the browser does not support the required fields.
          return;
        }

        this._onIceRestored();
      }
      this._reemitWarningCleared(data);
    });

    this.mediaStream = new (this.options.MediaStream || this.options.mediaStreamFactory)
      (config.audioHelper, config.pstream, config.getUserMedia, {
        codecPreferences: this.options.codecPreferences,
        debug: this.options.debug,
        dscp: this.options.dscp,
        isUnifiedPlan: this._isUnifiedPlanDefault,
        warnings: this.options.warnings,
      });

    this.on('volume', (inputVolume: number, outputVolume: number): void => {
      this._inputVolumeStreak = this._checkVolume(
        inputVolume, this._inputVolumeStreak, this._latestInputVolume, 'input');
      this._outputVolumeStreak = this._checkVolume(
        outputVolume, this._outputVolumeStreak, this._latestOutputVolume, 'output');
      this._latestInputVolume = inputVolume;
      this._latestOutputVolume = outputVolume;
    });

    this.mediaStream.onvolume = (inputVolume: number, outputVolume: number,
                                 internalInputVolume: number, internalOutputVolume: number) => {
      // (rrowland) These values mock the 0 -> 32767 format used by legacy getStats. We should look into
      // migrating to a newer standard, either 0.0 -> linear or -127 to 0 in dB, matching the range
      // chosen below.

      this._internalInputVolumes.push((internalInputVolume / 255) * 32767);
      this._internalOutputVolumes.push((internalOutputVolume / 255) * 32767);

      // (rrowland) 0.0 -> 1.0 linear
      this.emit('volume', inputVolume, outputVolume);
    };

    this.mediaStream.oniceconnectionstatechange = (state: string): void => {
      const level = state === 'failed' ? 'error' : 'debug';
      this._publisher.post(level, 'ice-connection-state', state, null, this);
    };

    this.mediaStream.onicegatheringstatechange = (state: string): void => {
      this._publisher.debug('ice-gathering-state', state, null, this);
    };

    this.mediaStream.onsignalingstatechange = (state: string): void => {
      this._publisher.debug('signaling-state', state, null, this);
    };

    this.mediaStream.ondisconnect = (msg: string): void => {
      this._log.info(msg);
      this._publisher.warn('network-quality-warning-raised', 'ice-connectivity-lost', {
        message: msg,
      }, this);
      this.emit('warning', 'ice-connectivity-lost');
    };

    this.mediaStream.onreconnect = (msg: string): void => {
      this._log.info(msg);
      this._publisher.info('network-quality-warning-cleared', 'ice-connectivity-lost', {
        message: msg,
      }, this);
      this.emit('warning-cleared', 'ice-connectivity-lost');
    };

    this.mediaStream.onerror = (e: any): void => {
      const error: Connection.Error = {
        code: e.info.code,
        connection: this,
        info: e.info,
        message: e.info.message || 'Error with mediastream',
      };

      if (e.disconnect === true) {
        this._disconnect(error.code, error.message);
      }

      this._log.error('Received an error from MediaStream:', e);
      this.emit('error', error);
    };

    this.mediaStream.onopen = () => {
      // NOTE(mroberts): While this may have been happening in previous
      // versions of Chrome, since Chrome 45 we have seen the
      // PeerConnection's onsignalingstatechange handler invoked multiple
      // times in the same signalingState 'stable'. When this happens, we
      // invoke this onopen function. If we invoke it twice without checking
      // for _state 'open', we'd accidentally close the PeerConnection.
      //
      // See <https://code.google.com/p/webrtc/issues/detail?id=4996>.
      if (this.state() === Connection.State.Connected || this.state() === Connection.State.Reconnecting) {
        return;
      } else if (this.state() === Connection.State.Ringing || this.state() === Connection.State.Connecting) {
        this.mute(false);
        this._maybeTransitionToOpen();
      } else {
        // call was probably canceled sometime before this
        this.mediaStream.close(CallCancelledError);
      }
    };

    this.mediaStream.onclose = (reason?: any) => {
      if (this.options.shouldPlayDisconnect && this.options.shouldPlayDisconnect()) {
        this._soundcache.get(Device.SoundName.Disconnect).play();
      }

      monitor.disable();
      this._stopIceRestarts();
      this._publishMetrics();
      this._cleanupEventListeners();

      this._setState(Connection.State.Disconnected, this, reason);
    };

    // temporary call sid to be used for outgoing calls
    this.outboundConnectionId = generateTempCallSid();

    this.pstream = config.pstream;
    this.pstream.on('cancel', this._onCancel);
    this.pstream.on('ringing', this._onRinging);

    // When websocket gets disconnected
    // There's no way to retry this session so we disconnect
    this.pstream.on('transportClosed', this._disconnect.bind(this, WebsocketClosedError));

    this.on('error', error => {
      this._publisher.error('connection', 'error', {
        code: error.code, message: error.message,
      }, this);

      if (this.pstream && this.pstream.status === 'disconnected') {
        this._cleanupEventListeners();
      }
    });
  }

  /**
   * Get the real CallSid. Returns null if not present or is a temporary call sid.
   * @deprecated
   * @private
   */
  _getRealCallSid(): string | null {
    this._log.warn('_getRealCallSid is deprecated and will be removed in 2.0.');
    return /^TJ/.test(this.parameters.CallSid) ? null : this.parameters.CallSid;
  }

  /**
   * Get the temporary CallSid.
   * @deprecated
   * @private
   */
  _getTempCallSid(): string | undefined {
    this._log.warn('_getTempCallSid is deprecated and will be removed in 2.0. \
                    Please use outboundConnectionId instead.');
    return this.outboundConnectionId;
  }

  /**
   * Set the audio input tracks from a given stream.
   * @param stream
   * @private
   */
  _setInputTracksFromStream(stream: MediaStream | null): Promise<void> {
    return this.mediaStream.setInputTracksFromStream(stream);
  }

  /**
   * Set the audio output sink IDs.
   * @param sinkIds
   * @private
   */
  _setSinkIds(sinkIds: string[]): Promise<void> {
    return this.mediaStream._setSinkIds(sinkIds);
  }

  /**
   * Accept the incoming {@link Connection}.
   * @param [audioConstraints]
   */
  accept(audioConstraints?: MediaTrackConstraints | boolean): void;
  /**
   * @deprecated - Set a handler for the {@link acceptEvent}
   * @param handler
   */
  accept(handler: (connection: this) => void): void;
  accept(handlerOrConstraints?: ((connection: this) => void) | MediaTrackConstraints | boolean): void {
    if (typeof handlerOrConstraints === 'function') {
      this._addHandler('accept', handlerOrConstraints);
      return;
    }

    if (this.state() !== Connection.State.Pending) {
      return;
    }

    const audioConstraints = handlerOrConstraints || this.options.audioConstraints;
    this._setState(Connection.State.Connecting);

    const connect = () => {
      if (this.state() !== Connection.State.Connecting) {
        // call must have been canceled
        this._cleanupEventListeners();
        this.mediaStream.close(CallCancelledError);
        return;
      }

      const onLocalAnswer = (pc: RTCPeerConnection) => {
        this._publisher.info('connection', 'accepted-by-local', null, this);
        this._monitor.enable(pc);
      };

      const onRemoteAnswer = (pc: RTCPeerConnection) => {
        this._publisher.info('connection', 'accepted-by-remote', null, this);
        this._monitor.enable(pc);
      };

      const sinkIds = typeof this.options.getSinkIds === 'function' && this.options.getSinkIds();
      if (Array.isArray(sinkIds)) {
        this.mediaStream._setSinkIds(sinkIds).catch(() => {
          // (rrowland) We don't want this to throw to console since the customer
          // can't control this. This will most commonly be rejected on browsers
          // that don't support setting sink IDs.
        });
      }

      this.pstream.addListener('hangup', this._onHangup);

      if (this._direction === Connection.CallDirection.Incoming) {
        this._isAnswered = true;
        this.mediaStream.answerIncomingCall(this.parameters.CallSid, this.options.offerSdp,
          this.options.rtcConstraints, this.options.rtcConfiguration, onLocalAnswer);
      } else {
        const params = Array.from(this.customParameters.entries()).map(pair =>
         `${encodeURIComponent(pair[0])}=${encodeURIComponent(pair[1])}`).join('&');
        this.pstream.once('answer', this._onAnswer.bind(this));

        this._publisher.info('connection', 'outgoing', null, this);

        this.mediaStream.makeOutgoingCall(this.pstream.token, params, this.outboundConnectionId,
          this.options.rtcConstraints, this.options.rtcConfiguration, onRemoteAnswer);
      }
    };

    if (this.options.beforeAccept) {
      this.options.beforeAccept(this);
    }

    const inputStream = typeof this.options.getInputStream === 'function' && this.options.getInputStream();

    const promise = inputStream
      ? this.mediaStream.setInputTracksFromStream(inputStream)
      : this.mediaStream.openWithConstraints(audioConstraints);

    promise.then(() => {
      this._publisher.info('get-user-media', 'succeeded', {
        data: { audioConstraints },
      }, this);

      connect();
    }, (error: Record<string, any>) => {
      let message;
      let code;

      if (error.code && error.code === 31208
        || error.name && error.name === 'PermissionDeniedError') {
        code = 31208;
        message = 'User denied access to microphone, or the web browser did not allow microphone '
          + 'access at this address.';
        this._publisher.error('get-user-media', 'denied', {
          data: {
            audioConstraints,
            error,
          },
        }, this);
      } else {
        code = 31201;
        message = `Error occurred while accessing microphone: ${error.name}${error.message
          ? ` (${error.message})`
          : ''}`;

        this._publisher.error('get-user-media', 'failed', {
          data: {
            audioConstraints,
            error,
          },
        }, this);
      }

      this._disconnect(code, message);
      this.emit('error', { code, message });
    });
  }

  /**
   * @deprecated - Ignore the incoming {@link Connection}.
   */
  cancel(): void;
  /**
   * @deprecated - Set a handler for the {@link cancelEvent}
   */
  cancel(handler: () => void): void;
  cancel(handler?: () => void): void {
    this._log.warn('.cancel() is deprecated. Please use .ignore() instead.');

    if (handler) {
      this.ignore(handler);
    } else {
      this.ignore();
    }
  }

  /**
   * Disconnect from the {@link Connection}.
   */
  disconnect(): void;
  /**
   * @deprecated - Set a handler for the {@link disconnectEvent}
   */
  disconnect(handler: (connection: this) => void): void;
  disconnect(handler?: (connection: this) => void): void {
    if (typeof handler === 'function') {
      this._addHandler(Connection.State.Disconnected, handler);
      return;
    }
    this._publisher.info('connection', 'disconnect-called', null, this);
    this._disconnect();
  }

  /**
   * @deprecated - Set a handler for the {@link errorEvent}
   */
  error(handler: (error: Connection.Error) => void): void {
    if (typeof handler === 'function') {
      this._addHandler('error', handler);
    }
  }

  /**
   * Get the local MediaStream, if set.
   */
  getLocalStream(): MediaStream | undefined {
    return this.mediaStream && this.mediaStream.stream;
  }

  /**
   * Get the remote MediaStream, if set.
   */
  getRemoteStream(): MediaStream | undefined {
    return this.mediaStream && this.mediaStream._remoteStream;
  }

  /**
   * Ignore the incoming {@link Connection}.
   */
  ignore(): void;
  /**
   * @deprecated - Set a handler for the {@link cancelEvent}
   */
  ignore(handler: () => void): void;
  ignore(handler?: () => void): void {
    if (typeof handler === 'function') {
      this._addHandler('cancel', handler);
      return;
    }

    if (this.state() !== Connection.State.Pending) {
      return;
    }

    this._setState(Connection.State.Disconnected, this, CallCancelledError);
    this.emit('cancel');
    this.mediaStream.ignore(this.parameters.CallSid);
    this._publisher.info('connection', 'ignored-by-local', null, this);
  }

  /**
   * Check if connection is muted
   */
  isMuted(): boolean {
    return this.mediaStream.isMuted;
  }

  /**
   * Mute incoming audio.
   * @param shouldMute - Whether the incoming audio should be muted. Defaults to true.
   */
  mute(shouldMute?: boolean): void;
  /**
   * @deprecated - Set a handler for the {@link muteEvent}
   */
  mute(handler: (isMuted: boolean, connection: this) => void): void;
  mute(shouldMute: boolean | ((isMuted: boolean, connection: this) => void) = true): void {
    if (typeof shouldMute === 'function') {
      this._addHandler('mute', shouldMute);
      return;
    }

    const wasMuted = this.mediaStream.isMuted;
    this.mediaStream.mute(shouldMute);

    const isMuted = this.mediaStream.isMuted;
    if (wasMuted !== isMuted) {
      this._publisher.info('connection', isMuted ? 'muted' : 'unmuted', null, this);
      this.emit('mute', isMuted, this);
    }
  }

  /**
   * Post an event to Endpoint Analytics indicating that the end user
   *   has given call quality feedback. Called without a score, this
   *   will report that the customer declined to give feedback.
   * @param score - The end-user's rating of the call; an
   *   integer 1 through 5. Or undefined if the user declined to give
   *   feedback.
   * @param issue - The primary issue the end user
   *   experienced on the call. Can be: ['one-way-audio', 'choppy-audio',
   *   'dropped-call', 'audio-latency', 'noisy-call', 'echo']
   */
  postFeedback(score?: Connection.FeedbackScore, issue?: Connection.FeedbackIssue): Promise<void> {
    if (typeof score === 'undefined' || score === null) {
      return this._postFeedbackDeclined();
    }

    if (!Object.values(Connection.FeedbackScore).includes(score)) {
      throw new Error(`Feedback score must be one of: ${Object.values(Connection.FeedbackScore)}`);
    }

    if (typeof issue !== 'undefined' && issue !== null && !Object.values(Connection.FeedbackIssue).includes(issue)) {
      throw new Error(`Feedback issue must be one of: ${Object.values(Connection.FeedbackIssue)}`);
    }

    return this._publisher.info('feedback', 'received', {
      issue_name: issue,
      quality_score: score,
    }, this, true);
  }

  /**
   * Reject the incoming {@link Connection}.
   */
  reject(): void;
  /**
   * @deprecated - Set a handler for the {@link rejectEvent}
   */
  reject(handler: () => void): void;
  reject(handler?: () => void): void {
    if (typeof handler === 'function') {
      this._addHandler('reject', handler);
      return;
    }

    if (this.state() !== Connection.State.Pending) {
      return;
    }

    const payload = { callsid: this.parameters.CallSid };
    this.pstream.publish('reject', payload);
    this.emit('reject');
    this.mediaStream.reject(this.parameters.CallSid);
    this._publisher.info('connection', 'rejected-by-local', null, this);
  }

  /**
   * Send a string of digits.
   * @param digits
   */
  sendDigits(digits: string): void {
    if (digits.match(/[^0-9*#w]/)) {
      throw new Exception('Illegal character passed into sendDigits');
    }

    const sequence: string[] = [];
    digits.split('').forEach((digit: string) => {
      let dtmf = (digit !== 'w') ? `dtmf${digit}` : '';
      if (dtmf === 'dtmf*') { dtmf = 'dtmfs'; }
      if (dtmf === 'dtmf#') { dtmf = 'dtmfh'; }
      sequence.push(dtmf);
    });

    // Binds soundCache to be used in recursion until all digits have been played.
    (function playNextDigit(soundCache, dialtonePlayer) {
      const digit: string | undefined = sequence.shift();

      if (digit) {
        if (dialtonePlayer) {
          dialtonePlayer.play(digit);
        } else {
          soundCache.get(digit as Device.SoundName).play();
        }
      }

      if (sequence.length) {
        setTimeout(playNextDigit.bind(null, soundCache), 200);
      }
    })(this._soundcache, this.options.dialtonePlayer);

    const dtmfSender = this.mediaStream.getOrCreateDTMFSender();

    function insertDTMF(dtmfs: string[]) {
      if (!dtmfs.length) { return; }
      const dtmf: string | undefined = dtmfs.shift();

      if (dtmf && dtmf.length) {
        dtmfSender.insertDTMF(dtmf, DTMF_TONE_DURATION, DTMF_INTER_TONE_GAP);
      }

      setTimeout(insertDTMF.bind(null, dtmfs), DTMF_PAUSE_DURATION);
    }

    if (dtmfSender) {
      if (!('canInsertDTMF' in dtmfSender) || dtmfSender.canInsertDTMF) {
        this._log.info('Sending digits using RTCDTMFSender');
        // NOTE(mroberts): We can't just map 'w' to ',' since
        // RTCDTMFSender's pause duration is 2 s and Twilio's is more
        // like 500 ms. Instead, we will fudge it with setTimeout.
        insertDTMF(digits.split('w'));
        return;
      }

      this._log.info('RTCDTMFSender cannot insert DTMF');
    }

    // send pstream message to send DTMF
    this._log.info('Sending digits over PStream');

    if (this.pstream !== null && this.pstream.status !== 'disconnected') {
      this.pstream.publish('dtmf', {
        callsid: this.parameters.CallSid,
        dtmf: digits,
      });
    } else {
      const error = {
        code: 31000,
        connection: this,
        message: 'Could not send DTMF: Signaling channel is disconnected',
      };
      this.emit('error', error);
    }
  }

  /**
   * Get the current {@link Connection} state.
   */
  state(): Connection.State {
    return this._state;
  }

  /**
   * String representation of {@link Connection} instance.
   * @private
   */
  toString = () => '[Twilio.Connection instance]';

  /**
   * @deprecated - Unmute the {@link Connection}.
   */
  unmute(): void {
    this._log.warn('.unmute() is deprecated. Please use .mute(false) to unmute a call instead.');
    this.mute(false);
  }

  /**
   * @deprecated - Set a handler for the {@link volumeEvent}
   * @param handler
   */
  volume(handler: (inputVolume: number, outputVolume: number) => void): void {
    if (!window || (!(window as any).AudioContext && !(window as any).webkitAudioContext)) {
      this._log.warn('This browser does not support Connection.volume');
    }

    this._addHandler('volume', handler);
  }

  /**
   * Add a handler for an EventEmitter and emit a deprecation warning on first call.
   * @param eventName - Name of the event
   * @param handler - A handler to call when the event is emitted
   */
  private _addHandler(eventName: string, handler: (...args: any[]) => any): this {
    if (!hasBeenWarnedHandlers) {
      this._log.warn(`Connection callback handlers (accept, cancel, disconnect, error, ignore, mute, reject,
        volume) have been deprecated and will be removed in the next breaking release. Instead, the EventEmitter \
        interface can be used to set event listeners. Example: connection.on('${eventName}', handler)`);
      hasBeenWarnedHandlers = true;
    }

    this.addListener(eventName, handler);
    return this;
  }

  /**
   * Check the volume passed, emitting a warning if one way audio is detected or cleared.
   * @param currentVolume - The current volume for this direction
   * @param streakFieldName - The name of the field on the {@link Connection} object that tracks how many times the
   *   current value has been repeated consecutively.
   * @param lastValueFieldName - The name of the field on the {@link Connection} object that tracks the most recent
   *   volume for this direction
   * @param direction - The directionality of this audio track, either 'input' or 'output'
   * @returns The current streak; how many times in a row the same value has been polled.
   */
  private _checkVolume(currentVolume: number, currentStreak: number,
                       lastValue: number, direction: 'input'|'output'): number {
    const wasWarningRaised: boolean = currentStreak >= 10;
    let newStreak: number = 0;

    if (lastValue === currentVolume) {
      newStreak = currentStreak;
    }

    if (newStreak >= 10) {
      this._emitWarning('audio-level-', `constant-audio-${direction}-level`, 10, newStreak, false);
    } else if (wasWarningRaised) {
      this._emitWarning('audio-level-', `constant-audio-${direction}-level`, 10, newStreak, true);
    }

    return newStreak;
  }

  /**
   * Clean up event listeners.
   */
  private _cleanupEventListeners(): void {
    const cleanup = () => {
      if (!this.pstream) { return; }

      this.pstream.removeListener('answer', this._onAnswer);
      this.pstream.removeListener('cancel', this._onCancel);
      this.pstream.removeListener('hangup', this._onHangup);
      this.pstream.removeListener('ringing', this._onRinging);
    };

    // This is kind of a hack, but it lets us avoid rewriting more code.
    // Basically, there's a sequencing problem with the way PeerConnection raises
    // the
    //
    //   Cannot establish connection. Client is disconnected
    //
    // error in Connection#accept. It calls PeerConnection#onerror, which emits
    // the error event on Connection. An error handler on Connection then calls
    // cleanupEventListeners, but then control returns to Connection#accept. It's
    // at this point that we add a listener for the answer event that never gets
    // removed. setTimeout will allow us to rerun cleanup again, _after_
    // Connection#accept returns.
    cleanup();
    setTimeout(cleanup, 0);
  }

  /**
   * Create the payload wrapper for a batch of metrics to be sent to Insights.
   */
  private _createMetricPayload(): Partial<Record<string, string|boolean>> {
    const payload: Partial<Record<string, string|boolean>> = {
      call_sid: this.parameters.CallSid,
      dscp: !!this.options.dscp,
      sdk_version: C.RELEASE_VERSION,
      selected_region: this.options.selectedRegion,
    };

    if (this.options.gateway) {
      payload.gateway = this.options.gateway;
    }

    if (this.options.region) {
      payload.region = this.options.region;
    }

    payload.direction = this._direction;
    return payload;
  }

  /**
   * Disconnect the {@link Connection}.
   * @param code - Error code
   * @param message - A message explaining why the {@link Connection} is being disconnected.
   * @param wasRemote - Whether the disconnect was triggered locally or remotely.
   */
  private _disconnect(code?: number, message?: string | null, wasRemote?: boolean): void {
    message = typeof message === 'string' ? message : null;
    this._stopIceRestarts();

    if (this.state() !== Connection.State.Connected
        && this.state() !== Connection.State.Reconnecting
        && this.state() !== Connection.State.Connecting
        && this.state() !== Connection.State.Ringing) {
      return;
    }

    this._log.info('Disconnecting...');

    // send pstream hangup message
    if (this.pstream !== null && this.pstream.status !== 'disconnected' && this.sendHangup) {
      const callsid: string | undefined = this.parameters.CallSid || this.outboundConnectionId;
      if (callsid) {
        const payload: Partial<Record<string, string>> = { callsid };
        if (message) {
          payload.message = message;
        }
        this.pstream.publish('hangup', payload);
      }
    }

    this._cleanupEventListeners();
    this.mediaStream.close({ code, message });

    if (!wasRemote) {
      this._publisher.info('connection', 'disconnected-by-local', null, this);
    }
  }

  private _emitWarning = (groupPrefix: string, warningName: string, threshold: number,
                          value: number|number[], wasCleared?: boolean): void => {
    const groupSuffix = wasCleared ? '-cleared' : '-raised';
    const groupName = `${groupPrefix}warning${groupSuffix}`;

    // Ignore constant input if the Connection is muted (Expected)
    if (warningName === 'constant-audio-input-level' && this.isMuted()) {
      return;
    }

    let level = wasCleared ? 'info' : 'warning';

    // Avoid throwing false positives as warnings until we refactor volume metrics
    if (warningName === 'constant-audio-output-level') {
      level = 'info';
    }

    const payloadData: Record<string, any> = { threshold };

    if (value) {
      if (value instanceof Array) {
        payloadData.values = value.map((val: any) => {
          if (typeof val === 'number') {
            return Math.round(val * 100) / 100;
          }

          return value;
        });
      } else {
        payloadData.value = value;
      }
    }

    this._publisher.post(level, groupName, warningName, { data: payloadData }, this);

    if (warningName !== 'constant-audio-output-level') {
      const emitName = wasCleared ? 'warning-cleared' : 'warning';
      this.emit(emitName, warningName);
    }
  }

  /**
   * Transition to {@link Connection.State.Open} if criteria is met.
   */
  private _maybeTransitionToOpen(): void {
    if (this.mediaStream && this.mediaStream.status === 'open' && this._isAnswered) {
      this._publisher.info('connection', 'connected', null, this);
      this._setState(Connection.State.Connected, this);
      this.emit('accept', this);
    }
  }

  /**
   * Called when the {@link Connection} is answered.
   * @param payload
   */
  private _onAnswer = (payload: Record<string, any>): void => {
    // answerOnBridge=false will send a 183 which we need to catch in _onRinging when
    // the enableRingingState flag is disabled. In that case, we will receive a 200 after
    // the callee accepts the call firing a second `accept` event if we don't
    // short circuit here.
    if (this._isAnswered) {
      return;
    }

    this._setCallSid(payload);
    this._isAnswered = true;
    this._maybeTransitionToOpen();
  }

  /**
   * Called when the {@link Connection} is cancelled.
   * @param payload
   */
  private _onCancel = (payload: Record<string, any>): void => {
    // (rrowland) Is this check necessary? Verify, and if so move to pstream / VSP module.
    const callsid = payload.callsid;
    if (this.parameters.CallSid === callsid) {
      this._setState(Connection.State.Disconnected, this, CallCancelledError);
      this.emit('cancel');
      this.pstream.removeListener('cancel', this._onCancel);
    }
  }

  /**
   * Called when the {@link Connection} is hung up.
   * @param payload
   */
  private _onHangup = (payload: Record<string, any>): void => {
    /**
     *  see if callsid passed in message matches either callsid or outbound id
     *  connection should always have either callsid or outbound id
     *  if no callsid passed hangup anyways
     */
    if (payload.callsid && (this.parameters.CallSid || this.outboundConnectionId)) {
      if (payload.callsid !== this.parameters.CallSid
          && payload.callsid !== this.outboundConnectionId) {
        return;
      }
    } else if (payload.callsid) {
      // hangup is for another connection
      return;
    }

    this._log.info('Received HANGUP from gateway');
    const error = {
      code: 31000,
      connection: this,
      message: 'Error sent from gateway in HANGUP',
    };

    if (payload.error) {
      error.code = payload.error.code || error.code;
      error.message = payload.error.message || error.message;

      this._log.error('Received an error from the gateway:', error);
      this.emit('error', error);
    }

    this.sendHangup = false;
    this._publisher.info('connection', 'disconnected-by-remote', null, this);
    this._disconnect(error.code, error.message, true);
    this._cleanupEventListeners();
  }

  /**
   * Called when {@link RTCMonitor} raises a warning where bytesReceived or bytesSent is zero
   */
  private _onIceDisconnected(): void {
    if (this.state() === Connection.State.Reconnecting) {
      return;
    }

    this._log.warn('ICE Connection disconnected.');
    this._publisher.info('connection', 'reconnecting', null, this);
    this._publisher.warn('connection', 'error', MediaFailedError, this);

    // Stop existing loops if this warning is emitted multiple times
    this._stopIceRestarts();

    this._iceRestartIntervalId = setInterval(() => {
      this.mediaStream.iceRestart().catch((canRetry: boolean) => {
        if (!canRetry) {
          this._log.info('Received hangup from the server. Stopping attempts to restart ICE.');
          this._stopIceRestarts();
        }
      });
    }, ICE_RESTART_INTERVAL);

    this._setState(Connection.State.Reconnecting, this, MediaFailedError);
  }

  /**
   * Called when {@link RTCMonitor} clears a warning for bytesReceived or bytesSent
   */
  private _onIceRestored(): void {
    this._log.info('ICE Connection reestablished.');
    this._publisher.info('connection', 'reconnected', null, this);
    this._stopIceRestarts();
    this._setState(Connection.State.Connected, this);
  }

  /**
   * When we get a RINGING signal from PStream, update the {@link Connection} state.
   * @param payload
   */
  private _onRinging = (payload: Record<string, any>): void => {
    this._setCallSid(payload);

    // If we're not in 'connecting' or 'ringing' state, this event was received out of order.
    if (this.state() !== Connection.State.Connecting && this.state() !== Connection.State.Ringing) {
      return;
    }

    const hasEarlyMedia = !!payload.sdp;
    if (this.options.enableRingingState) {
      this._publisher.info('connection', 'outgoing-ringing', { hasEarlyMedia }, this);
      this._setState(Connection.State.Ringing, this, hasEarlyMedia);
    // answerOnBridge=false will send a 183, which we need to interpret as `answer` when
    // the enableRingingState flag is disabled in order to maintain a non-breaking API from 1.4.24
    } else if (hasEarlyMedia) {
      this._onAnswer(payload);
    }
  }

  /**
   * Called each time RTCMonitor emits a sample.
   * Emits stats event and batches the call stats metrics and sends them to Insights.
   * @param sample
   */
  private _onRTCSample = (sample: RTCSample): void => {
    const callMetrics: Connection.CallMetrics = {
      ...sample,
      audioInputLevel: Math.round(average(this._internalInputVolumes)),
      audioOutputLevel: Math.round(average(this._internalOutputVolumes)),
      inputVolume: this._latestInputVolume,
      outputVolume: this._latestOutputVolume,
    };

    this._internalInputVolumes.splice(0);
    this._internalOutputVolumes.splice(0);
    this._codec = callMetrics.codecName;

    this._metricsSamples.push(callMetrics);
    if (this._metricsSamples.length >= METRICS_BATCH_SIZE) {
      this._publishMetrics();
    }

    this.emit('sample', sample);
  }

  /**
   * Post an event to Endpoint Analytics indicating that the end user
   *   has ignored a request for feedback.
   */
  private _postFeedbackDeclined(): Promise<void> {
    return this._publisher.info('feedback', 'received-none', null, this, true);
  }

  /**
   * Publish the current set of queued metrics samples to Insights.
   */
  private _publishMetrics(): void {
    if (this._metricsSamples.length === 0) {
      return;
    }

    this._publisher.postMetrics(
      'quality-metrics-samples', 'metrics-sample', this._metricsSamples.splice(0), this._createMetricPayload(), this,
    ).catch((e: any) => {
      this._log.warn('Unable to post metrics to Insights. Received error:', e);
    });
  }

  /**
   * Re-emit an RTCMonitor warning as a {@link Connection}.warning or .warning-cleared event.
   * @param warningData
   * @param wasCleared - Whether this is a -cleared or -raised event.
   */
  private _reemitWarning = (warningData: Record<string, any>, wasCleared?: boolean): void => {
    const groupPrefix = /^audio/.test(warningData.name) ?
      'audio-level-' : 'network-quality-';

    const warningPrefix = WARNING_PREFIXES[warningData.threshold.name];
    const warningName = warningPrefix + WARNING_NAMES[warningData.name];

    this._emitWarning(groupPrefix, warningName, warningData.threshold.value,
                      warningData.values || warningData.value, wasCleared);
  }

  /**
   * Re-emit an RTCMonitor warning-cleared as a .warning-cleared event.
   * @param warningData
   */
  private _reemitWarningCleared = (warningData: Record<string, any>): void => {
    this._reemitWarning(warningData, true);
  }

  /**
   * Set the CallSid
   * @param payload
   */
  private _setCallSid(payload: Record<string, string>): void {
    const callSid = payload.callsid;
    if (!callSid) { return; }

    this.parameters.CallSid = callSid;
    this.mediaStream.callSid = callSid;
  }

  /**
   * Set a new state and emit the correct event
   * @param newState
   */
  private _setState(newState: Connection.State, ...eventParams: any[]): void {
    const previousState = this.state();
    const { Connected, Disconnected, Reconnecting, Ringing } = Connection.State;

    if (newState === previousState) {
      return;
    }

    this._state = newState;

    if (newState === Connected && previousState === Reconnecting) {
      this.emit('reconnected', ...eventParams);
    } else if (newState === Connected
      || newState === Disconnected
      || newState === Reconnecting
      || newState === Ringing) {
      this.emit(newState, ...eventParams);
    }
  }

  /**
   * Stop ice restart loop
   */
  private _stopIceRestarts(): void {
    clearInterval(this._iceRestartIntervalId);
  }
}

namespace Connection {
  /**
   * Emitted when the {@link Connection} is accepted.
   * @param connection - The {@link Connection}.
   * @example `connection.on('accept', connection => { })`
   * @event
   */
  declare function acceptEvent(connection: Connection): void;

  /**
   * Emitted when the {@link Connection} is canceled.
   * @example `connection.on('cancel', () => { })`
   * @event
   */
  declare function cancelEvent(): void;

  /**
   * Emitted when the {@link Connection} is disconnected.
   * @param connection - The {@link Connection}.
   * @example `connection.on('disconnected', connection => { })`
   * @event
   */
  declare function disconnectEvent(connection: Connection): void;

  /**
   * Emitted when the {@link Connection} receives an error.
   * @param error
   * @example `connection.on('error', error => { })`
   * @event
   */
  declare function errorEvent(error: Connection.Error): void;

  /**
   * Emitted when the {@link Connection} is muted or unmuted.
   * @param isMuted - Whether the {@link Connection} is muted.
   * @param connection - The {@link Connection}.
   * @example `connection.on('mute', (isMuted, connection) => { })`
   * @event
   */
  declare function muteEvent(isMuted: boolean, connection: Connection): void;

  /**
   * Emitted when the {@link Connection} is rejected.
   * @param connection - The {@link Connection}.
   * @example `connection.on('reject', connection => { })`
   * @event
   */
  declare function rejectEvent(connection: Connection): void;

  /**
   * Emitted on `requestAnimationFrame` (up to 60fps, depending on browser) with
   *   the current input and output volumes, as a percentage of maximum
   *   volume, between -100dB and -30dB. Represented by a floating point
   *   number.
   * @param inputVolume - A floating point number between 0.0 and 1.0 inclusive.
   * @param outputVolume - A floating point number between 0.0 and 1.0 inclusive.
   * @example `connection.on('volume', (inputVolume, outputVolume) => { })`
   * @event
   */
  declare function volumeEvent(inputVolume: number, outputVolume: number): void;

  /**
   * Emitted when the {@link Connection} gets a webrtc sample object.
   * This event is published every second.
   * @param sample
   * @example `connection.on('sample', sample => { })`
   * @event
   */
  declare function sampleEvent(sample: RTCSample): void;

  /**
   * Possible states of the {@link Connection}.
   */
  export enum State {
    /**
     * The {@link Connection} is connected.
     */
    Connected = 'connected',

    /**
     * The {@link Connection} is created and in the process of connecting.
     */
    Connecting = 'connecting',

    /**
     * The {@link Connection} was disconnected.
     */
    Disconnected = 'disconnected',

    /**
     * The {@link Connection} is ready to connect.
     */
    Pending = 'pending',

    /**
     * The {@link Connection} is in the process of reconnecting
     */
    Reconnecting = 'reconnecting',

    /**
     * The call is ringing
     */
    Ringing = 'ringing',
  }

  /**
   * Different issues that may have been experienced during a call, that can be
   * reported to Twilio Insights via {@link Connection}.postFeedback().
   */
  export enum FeedbackIssue {
    AudioLatency = 'audio-latency',
    ChoppyAudio = 'choppy-audio',
    DroppedCall = 'dropped-call',
    Echo = 'echo',
    NoisyCall = 'noisy-call',
    OneWayAudio = 'one-way-audio',
  }

  /**
   * A rating of call quality experienced during a call, to be reported to Twilio Insights
   * via {@link Connection}.postFeedback().
   */
  export enum FeedbackScore {
    One = 1,
    Two,
    Three,
    Four,
    Five,
  }

  /**
   * The directionality of the {@link Connection}, whether incoming or outgoing.
   */
  export enum CallDirection {
    Incoming = 'INCOMING',
    Outgoing = 'OUTGOING',
  }

  /**
   * Valid audio codecs to use for the media connection.
   */
  export enum Codec {
    Opus = 'opus',
    PCMU = 'pcmu',
  }

  /**
   * The error format used by errors emitted from {@link Connection}.
   */
  export interface Error {
    /**
     * Error code
     */
    code: number;

    /**
     * Reference to the {@link Connection}
     */
    connection: Connection;

    /**
     * The info object from rtc/peerconnection. May contain code and message (duplicated here).
     */
    info: { code?: number, message?: string };

    /**
     * Error message
     */
    message: string;
  }

  /**
   * Mandatory config options to be passed to the {@link Connection} constructor.
   * @private
   */
  export interface Config {
    /**
     * An AudioHelper instance to be used for input/output devices.
     */
    audioHelper: IAudioHelper;

    /**
     * A method to use for getUserMedia.
     */
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;

    /**
     * Whether or not the browser uses unified-plan SDP by default.
     */
    isUnifiedPlanDefault: boolean;

    /**
     * The PStream instance to use for Twilio call signaling.
     */
    pstream: IPStream;

    /**
     * An EventPublisher instance to use for publishing events
     */
    publisher: IPublisher;

    /**
     * A Map of Sounds to play.
     */
    soundcache: Map<Device.SoundName, ISound>;
  }

  /**
   * Options to be passed to the {@link Connection} constructor.
   * @private
   */
  export interface Options {
    /**
     * Audio Constraints to pass to getUserMedia when making or accepting a Call.
     * This is placed directly under `audio` of the MediaStreamConstraints object.
     */
    audioConstraints?: MediaTrackConstraints | boolean;

    /**
     * A method to call before Connection.accept is processed.
     */
    beforeAccept?: (connection: Connection) => void;

    /**
     * Custom format context parameters associated with this call.
     */
    callParameters?: Record<string, string>;

    /**
     * An ordered array of codec names, from most to least preferred.
     */
    codecPreferences?: Codec[];

    /**
     * Whether to enable debug level logging.
     */
    debug?: boolean;

    /**
     * A DialTone player, to play mock DTMF sounds.
     */
    dialtonePlayer?: DialtonePlayer;

    /**
     * Whether or not to enable DSCP.
     */
    dscp?: boolean;

    /**
     * Whether the ringing state should be enabled.
     */
    enableRingingState?: boolean;

    /**
     * The gateway currently connected to.
     */
    gateway?: string;

    /**
     * A method that returns the current input MediaStream set on {@link Device}.
     */
    getInputStream?: () => MediaStream;

    /**
     * A method that returns the current SinkIDs set on {@link Device}.
     */
    getSinkIds?: () => string[];

    /**
     * Custom MediaStream (PeerConnection) constructor. Overrides mediaStreamFactory (deprecated).
     */
    MediaStream?: IPeerConnection;

    /**
     * Custom MediaStream (PeerConnection) constructor (deprecated)
     */
    mediaStreamFactory?: IPeerConnection;

    /**
     * The offer SDP, if this is an incoming call.
     */
    offerSdp?: string | null;

    /**
     * The Region currently connected to.
     */
    region?: Region;

    /**
     * An RTCConfiguration to pass to the RTCPeerConnection constructor.
     */
    rtcConfiguration?: RTCConfiguration;

    /**
     * RTC Constraints to pass to getUserMedia when making or accepting a Call.
     * The format of this object depends on browser.
     */
    rtcConstraints?: MediaStreamConstraints;

    /**
     * An override for the RTCMonitor dependency.
     */
    RTCMonitor?: new () => RTCMonitor;

    /**
     * The region passed to {@link Device} on setup.
     */
    selectedRegion?: string;

    /**
     * Whether the disconnect sound should be played.
     */
    shouldPlayDisconnect?: () => boolean;

    /**
     * TwiML params for the call. May be set for either outgoing or incoming calls.
     */
    twimlParams?: Record<string, any>;

    /**
     * Whether to enable warn level logging.
     */
    warnings?: boolean;
  }

  /**
   * Call metrics published to Insight Metrics.
   * This include rtc samples and audio information.
   * @private
   */
  export interface CallMetrics extends RTCSample {
    /**
     * Audio input level between 0 and 32767, representing -100 to -30 dB.
     */
    audioInputLevel: number;

    /**
     * Audio output level between 0 and 32767, representing -100 to -30 dB.
     */
    audioOutputLevel: number;
    /**
     * Percentage of maximum volume, between 0.0 to 1.0, representing -100 to -30 dB.
     */
    inputVolume: number;

    /**
     * Percentage of maximum volume, between 0.0 to 1.0, representing -100 to -30 dB.
     */
    outputVolume: number;
  }
}

function generateTempCallSid() {
  return 'TJSxxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    /* tslint:disable:no-bitwise */
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    /* tslint:enable:no-bitwise */
    return v.toString(16);
  });
}

export default Connection;
