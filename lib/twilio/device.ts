/**
 * @packageDocumentation
 * @module Voice
 * @preferred
 * @publicapi
 */
import { EventEmitter } from 'events';
import { levels as LogLevels, LogLevelDesc } from 'loglevel';
import AudioHelper from './audiohelper';
import Connection from './connection';
import DialtonePlayer from './dialtonePlayer';
import {
  AuthorizationErrors,
  ClientErrors,
  GeneralErrors,
  getErrorByCode,
  hasErrorByCode,
  InvalidArgumentError,
  InvalidStateError,
  NotSupportedError,
  TwilioError,
} from './errors';
import Log from './log';
import { PreflightTest } from './preflight/preflight';
import {
  getChunderURIs,
  getRegionShortcode,
  Region,
  regionToEdge,
} from './regions';
import {
  isLegacyEdge,
  isUnifiedPlanDefault,
  queryToJson,
} from './util';

const C = require('./constants');
const Publisher = require('./eventpublisher');
const PStream = require('./pstream');
const rtc = require('./rtc');
const getUserMedia = require('./rtc/getusermedia');
const Sound = require('./sound');

// Placeholders until we convert the respective files to TypeScript.
/**
 * @private
 */
export type IPStream = any;
/**
 * @private
 */
export type IPublisher = any;
/**
 * @private
 */
export type ISound = any;

const REGISTRATION_INTERVAL = 30000;
const RINGTONE_PLAY_TIMEOUT = 2000;
const PUBLISHER_PRODUCT_NAME = 'twilio-js-sdk';
const INVALID_TOKEN_MESSAGE = 'Parameter "token" must be of type "string".';

declare const RTCRtpTransceiver: any;
declare const webkitAudioContext: typeof AudioContext;

/**
 * Options that may be passed to the {@link Device} constructor for internal testing.
 * @private
 */
export interface IExtendedDeviceOptions extends Device.Options {
  /**
   * Custom {@link AudioHelper} constructor
   */
  AudioHelper?: typeof AudioHelper;

  /**
   * The max amount of time in milliseconds to allow stream (re)-connect
   * backoffs.
   */
  backoffMaxMs?: number;

  /**
   * Hostname of the signaling gateway to connect to.
   */
  chunderw?: string | string[];

  /**
   * Custom {@link Connection} constructor
   */
  Connection?: typeof Connection;

  /**
   * Hostname of the event gateway to connect to.
   */
  eventgw?: string;

  /**
   * File input stream to use instead of reading from mic
   */
  fileInputStream?: MediaStream;

  /**
   * Ignore browser support, disabling the exception that is thrown when neither WebRTC nor
   * ORTC are supported.
   */
  ignoreBrowserSupport?: boolean;

  /**
   * MediaStream constructor.
   */
  MediaStream?: typeof MediaStream;

  /**
   * Whether this is a preflight call or not
   */
  preflight?: boolean;

  /**
   * Custom PStream constructor
   */
  PStream?: IPStream;

  /**
   * Custom Publisher constructor
   */
  Publisher?: IPublisher;

  /**
   * Whether or not to publish events to insights using {@link Device._publisher}.
   */
  publishEvents?: boolean;

  /**
   * MediaStreamConstraints to pass to getUserMedia when making or accepting a Call.
   */
  rtcConstraints?: Connection.AcceptOptions['rtcConstraints'];

  /**
   * Custom Sound constructor
   */
  Sound?: ISound;
}

/**
 * A sound definition used to initialize a Sound file.
 * @private
 */
export interface ISoundDefinition {
  /**
   * Name of the sound file.
   */
  filename: string;

  /**
   * The amount of time this sound file should play before being stopped automatically.
   */
  maxDuration?: number;

  /**
   * Whether or not this sound should loop after playthrough finishes.
   */
  shouldLoop?: boolean;
}

/**
 * Twilio Device. Allows registration for incoming calls, and placing outgoing calls.
 * @publicapi
 */
class Device extends EventEmitter {
  /**
   * The AudioContext to be used by {@link Device} instances.
   * @private
   */
  static get audioContext(): AudioContext | undefined {
    return Device._audioContext;
  }

  /**
   * Which sound file extension is supported.
   * @private
   */
  static get extension(): 'mp3' | 'ogg' {
    // NOTE(mroberts): Node workaround.
    const a: any = typeof document !== 'undefined'
      ? document.createElement('audio') : { canPlayType: false };

    let canPlayMp3;
    try {
      canPlayMp3 = a.canPlayType && !!a.canPlayType('audio/mpeg').replace(/no/, '');
    } catch (e) {
      canPlayMp3 = false;
    }

    let canPlayVorbis;
    try {
      canPlayVorbis = a.canPlayType && !!a.canPlayType('audio/ogg;codecs=\'vorbis\'').replace(/no/, '');
    } catch (e) {
      canPlayVorbis = false;
    }

    return (canPlayVorbis && !canPlayMp3) ? 'ogg' : 'mp3';
  }

  /**
   * Whether or not this SDK is supported by the current browser.
   */
  static get isSupported(): boolean { return rtc.enabled(); }

  /**
   * Package name of the SDK.
   */
  static get packageName(): string { return C.PACKAGE_NAME; }

  /**
   * Run some tests to identify issues, if any, prohibiting successful calling.
   * @param token - A Twilio JWT token string
   * @param options
   */
  static runPreflight(token: string, options?: PreflightTest.Options): PreflightTest {
    return new PreflightTest(token, { audioContext: Device._getOrCreateAudioContext(), ...options });
  }

  /**
   * String representation of {@link Device} class.
   * @private
   */
  static toString(): string {
    return '[Twilio.Device class]';
  }

  /**
   * Current SDK version.
   */
  static get version(): string { return C.RELEASE_VERSION; }

  /**
   * An AudioContext to share between {@link Device}s.
   */
  private static _audioContext?: AudioContext;

  private static _defaultSounds: Record<string, ISoundDefinition> = {
    disconnect: { filename: 'disconnect', maxDuration: 3000 },
    dtmf0: { filename: 'dtmf-0', maxDuration: 1000 },
    dtmf1: { filename: 'dtmf-1', maxDuration: 1000 },
    dtmf2: { filename: 'dtmf-2', maxDuration: 1000 },
    dtmf3: { filename: 'dtmf-3', maxDuration: 1000 },
    dtmf4: { filename: 'dtmf-4', maxDuration: 1000 },
    dtmf5: { filename: 'dtmf-5', maxDuration: 1000 },
    dtmf6: { filename: 'dtmf-6', maxDuration: 1000 },
    dtmf7: { filename: 'dtmf-7', maxDuration: 1000 },
    dtmf8: { filename: 'dtmf-8', maxDuration: 1000 },
    dtmf9: { filename: 'dtmf-9', maxDuration: 1000 },
    dtmfh: { filename: 'dtmf-hash', maxDuration: 1000 },
    dtmfs: { filename: 'dtmf-star', maxDuration: 1000 },
    incoming: { filename: 'incoming', shouldLoop: true },
    outgoing: { filename: 'outgoing', maxDuration: 3000 },
  };

  /**
   * A DialtonePlayer to play mock DTMF sounds through.
   */
  private static _dialtonePlayer?: DialtonePlayer;

  /**
   * Whether or not the browser uses unified-plan SDP by default.
   */
  private static _isUnifiedPlanDefault: boolean | undefined;

  /**
   * Initializes the AudioContext instance shared across the Client SDK,
   * or returns the existing instance if one has already been initialized.
   */
  private static _getOrCreateAudioContext(): AudioContext | undefined {
    if (!Device._audioContext) {
      if (typeof AudioContext !== 'undefined') {
        Device._audioContext = new AudioContext();
      } else if (typeof webkitAudioContext !== 'undefined') {
        Device._audioContext = new webkitAudioContext();
      }
    }
    return Device._audioContext;
  }

  /**
   * The currently active {@link Connection}, if there is one.
   */
  private _activeConnection: Connection | null = null;

  /**
   * The AudioHelper instance associated with this {@link Device}.
   */
  private _audio: AudioHelper | null = null;

  /**
   * {@link Device._confirmClose} bound to the specific {@link Device} instance.
   */
  private _boundConfirmClose: typeof Device.prototype._confirmClose;

  /**
   * {@link Device.destroy} bound to the specific {@link Device} instance.
   */
  private _boundDestroy: typeof Device.prototype.destroy;

  /**
   * The list of chunder URIs that will be passed to PStream
   */
  private _chunderURIs: string[] = [];

  /**
   * An audio input MediaStream to pass to new {@link Connection} instances.
   */
  private _connectionInputStream: MediaStream | null = null;

  /**
   * An array of {@link Connection}s. Though only one can be active, multiple may exist when there
   * are multiple incoming, unanswered {@link Connection}s.
   */
  private _connections: Connection[] = [];

  /**
   * An array of {@link Device} IDs to be used to play sounds through, to be passed to
   * new {@link Connection} instances.
   */
  private _connectionSinkIds: string[] = ['default'];

  /**
   * Default options used by {@link Device}.
   */
  private readonly _defaultOptions: IExtendedDeviceOptions = {
    allowIncomingWhileBusy: false,
    closeProtection: false,
    codecPreferences: [Connection.Codec.PCMU, Connection.Codec.Opus],
    dscp: true,
    eventgw: 'eventgw.twilio.com',
    forceAggressiveIceNomination: false,
    logLevel: LogLevels.ERROR,
    preflight: false,
    sounds: { },
  };

  /**
   * The name of the edge the {@link Device} is connected to.
   */
  private _edge: string | null = null;

  /**
   * Whether each sound is enabled.
   */
  private _enabledSounds: Record<Device.ToggleableSound, boolean> = {
    [Device.SoundName.Disconnect]: true,
    [Device.SoundName.Incoming]: true,
    [Device.SoundName.Outgoing]: true,
  };

  /**
   * Whether SDK is run as a browser extension
   */
  private _isBrowserExtension: boolean;

  /**
   * An instance of Logger to use.
   */
  private _log: Log = Log.getInstance();

  /**
   * Network related information
   * See https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
   */
  private _networkInformation: any;

  /**
   * The options passed to {@link Device} constructor or {@link Device.updateOptions}.
   */
  private _options: IExtendedDeviceOptions = { };

  /**
   * An Insights Event Publisher.
   */
  private _publisher: IPublisher | null = null;

  /**
   * The region the {@link Device} is connected to.
   */
  private _region: string | null = null;

  /**
   * A timeout ID for a setTimeout schedule to re-register the {@link Device}.
   */
  private _regTimer: NodeJS.Timer | null = null;

  /**
   * Boolean representing whether or not the {@link Device} was registered when
   * receiving a signaling `offline`. Determines if the {@link Device} attempts
   * a `re-register` once signaling is re-established when receiving a
   * `connected` event from the stream.
   */
  private _shouldReRegister: boolean = false;

  /**
   * A Map of Sounds to play.
   */
  private _soundcache: Map<Device.SoundName, ISound> = new Map();

  /**
   * The current status of the {@link Device}.
   */
  private _state: Device.State = Device.State.Unregistered;

  /**
   * A map from {@link Device.State} to {@link Device.EventName}.
   */
  private readonly _stateEventMapping: Record<Device.State, Device.EventName> = {
    [Device.State.Unregistered]: Device.EventName.Unregistered,
    [Device.State.Registering]: Device.EventName.Registering,
    [Device.State.Registered]: Device.EventName.Registered,
  };

  /**
   * The Signaling stream.
   */
  private _stream: IPStream | null = null;

  /**
   * A promise that will resolve when the Signaling stream is ready.
   */
  private _streamConnectedPromise: Promise<IPStream> | null = null;

  /**
   * The JWT string currently being used to authenticate this {@link Device}.
   */
  private _token: string;

  /**
   * Construct a {@link Device} instance. The {@link Device} can be registered
   * to make and listen for calls using {@link Device.register}.
   * @constructor
   * @param options
   */
  constructor(token: string, options: Device.Options = { }) {
    super();

    this.updateToken(token);

    if (isLegacyEdge()) {
      throw new NotSupportedError(
        'Microsoft Edge Legacy (https://support.microsoft.com/en-us/help/4533505/what-is-microsoft-edge-legacy) ' +
        'is deprecated and will not be able to connect to Twilio to make or receive calls after September 1st, 2020. ' +
        'Please see this documentation for a list of supported browsers ' +
        'https://www.twilio.com/docs/voice/client/javascript#supported-browsers',
      );
    }

    if (!Device.isSupported && (options as IExtendedDeviceOptions).ignoreBrowserSupport) {
      if (window && window.location && window.location.protocol === 'http:') {
        throw new NotSupportedError(`twilio.js wasn't able to find WebRTC browser support. \
          This is most likely because this page is served over http rather than https, \
          which does not support WebRTC in many browsers. Please load this page over https and \
          try again.`);
      }

      throw new NotSupportedError(`twilio.js 1.3+ SDKs require WebRTC browser support. \
        For more information, see <https://www.twilio.com/docs/api/client/twilio-js>. \
        If you have any questions about this announcement, please contact \
        Twilio Support at <help@twilio.com>.`);
    }

    if (window) {
      const root: any = window as any;
      const browser: any = root.msBrowser || root.browser || root.chrome;

      this._isBrowserExtension = (!!browser && !!browser.runtime && !!browser.runtime.id)
        || (!!root.safari && !!root.safari.extension);
    }

    if (this._isBrowserExtension) {
      this._log.info('Running as browser extension.');
    }

    if (navigator) {
      const n = navigator as any;
      this._networkInformation = n.connection
        || n.mozConnection
        || n.webkitConnection;
    }

    if (this._networkInformation && typeof this._networkInformation.addEventListener === 'function') {
      this._networkInformation.addEventListener('change', this._publishNetworkChange);
    }

    Device._getOrCreateAudioContext();

    if (Device._audioContext) {
      if (!Device._dialtonePlayer) {
        Device._dialtonePlayer = new DialtonePlayer(Device._audioContext);
      }
    }

    if (typeof Device._isUnifiedPlanDefault === 'undefined') {
      Device._isUnifiedPlanDefault = typeof window !== 'undefined'
        && typeof RTCPeerConnection !== 'undefined'
        && typeof RTCRtpTransceiver !== 'undefined'
      ? isUnifiedPlanDefault(window, window.navigator, RTCPeerConnection, RTCRtpTransceiver)
      : false;
    }

    this._boundDestroy = this.destroy.bind(this);
    this._boundConfirmClose = this._confirmClose.bind(this);

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('unload', this._boundDestroy);
      window.addEventListener('pagehide', this._boundDestroy);
    }

    this.updateOptions(options);
  }

  /**
   * Return the active {@link Connection}.
   */
  get activeConnection(): Connection | null {
    return this._activeConnection;
  }

  /**
   * Return the {@link AudioHelper} used by this {@link Device}.
   */
  get audio(): AudioHelper | null {
    return this._audio;
  }

  /**
   * Make an outgoing Call.
   * @param options
   */
  async connect(options: Device.ConnectOptions = { }): Promise<Connection> {
    if (this._activeConnection) {
      throw new InvalidStateError('A Connection is already active');
    }

    const connection = this._activeConnection = await this._makeConnection(options.params || { }, {
      rtcConfiguration: options.rtcConfiguration,
    });

    // Make sure any incoming connections are ignored
    this._connections.splice(0).forEach(conn => conn.ignore());

    // Stop the incoming sound if it's playing
    this._soundcache.get(Device.SoundName.Incoming).stop();

    connection.accept({ rtcConstraints: options.rtcConstraints });
    this._publishNetworkChange();
    return connection;
  }

  /**
   * Return the connections that this {@link Device} is maintaining.
   */
  get connections(): Connection[] {
    return this._connections;
  }

  /**
   * Destroy the {@link Device}, freeing references to be garbage collected.
   */
  destroy(): void {
    this.disconnectAll();
    this._stopRegistrationTimer();

    if (this._audio) {
      this._audio._unbind();
    }

    this._destroyStream();
    this._destroyPublisher();
    this._destroyAudioHelper();

    if (this._networkInformation && typeof this._networkInformation.removeEventListener === 'function') {
      this._networkInformation.removeEventListener('change', this._publishNetworkChange);
    }

    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('beforeunload', this._boundConfirmClose);
      window.removeEventListener('unload', this._boundDestroy);
      window.removeEventListener('pagehide', this._boundDestroy);
    }
  }

  /**
   * Disconnect all {@link Connection}s.
   */
  disconnectAll(): void {
    const connections = this._connections.splice(0);
    connections.forEach((conn: Connection) => conn.disconnect());

    if (this._activeConnection) {
      this._activeConnection.disconnect();
    }
  }

  /**
   * Returns the {@link Edge} value the {@link Device} is currently connected
   * to. The value will be `null` when the {@link Device} is offline.
   */
  get edge(): string | null {
    return this._edge;
  }

  /**
   * Register the `Device` to the Twilio backend, allowing it to receive calls.
   */
  async register(): Promise<void> {
    if (this.state !== Device.State.Unregistered) {
      this._log.error(
        `Attempt to register when device is in state "${this.state}". ` +
        `Must be "${Device.State.Unregistered}".`,
      );
      return;
    }

    this._setState(Device.State.Registering);

    const stream = await (this._streamConnectedPromise || this._setupStream());
    const streamReadyPromise = new Promise(resolve => {
      stream.on('ready', resolve);
    });
    await this._sendPresence(true);
    await streamReadyPromise;
  }

  /**
   * Get the state of this {@link Device} instance
   */
  get state(): Device.State {
    return this._state;
  }

  /**
   * Get the token used by this {@link Device}.
   */
  get token(): string | null {
    return this._token;
  }

  /**
   * String representation of {@link Device} instance.
   * @private
   */
  toString() {
    return '[Twilio.Device instance]';
  }

  /**
   * Unregister the `Device` to the Twilio backend, disallowing it to receive
   * calls.
   */
  async unregister(): Promise<void> {
    if (this.state !== Device.State.Registered) {
      this._log.error(
        `Attempt to unregister when device is in state "${this.state}". ` +
        `Must be "${Device.State.Registered}".`,
      );
      return;
    }

    this._shouldReRegister = false;

    const stream = await this._streamConnectedPromise;
    const streamOfflinePromise = new Promise(resolve => {
      stream.on('offline', resolve);
    });
    await this._sendPresence(false);
    await streamOfflinePromise;
  }

  /**
   * Set the options used within the {@link Device}.
   * @param options
   */
  async updateOptions(options: Device.Options = { }): Promise<void> {
    if (this._connections.length > 0 || this.activeConnection) {
      this._log.warn('Existing Device has ongoing connections; ignoring new options.');
      return;
    }

    this._options = { ...this._defaultOptions, ...options };

    this._log.setDefaultLevel(
      typeof this._options.logLevel === 'number'
        ? this._options.logLevel
        : LogLevels.ERROR,
    );

    if (this._options.dscp) {
      if (!this._options.rtcConstraints) {
        this._options.rtcConstraints = { };
      }
      (this._options.rtcConstraints as any).optional = [{ googDscp: true }];
    }

    for (const name of Object.keys(Device._defaultSounds)) {
      const soundDef: ISoundDefinition = Device._defaultSounds[name];

      const defaultUrl: string = `${C.SOUNDS_BASE_URL}/${soundDef.filename}.${Device.extension}`
        + `?cache=${C.RELEASE_VERSION}`;

      const soundUrl: string = this._options.sounds && this._options.sounds[name as Device.SoundName] || defaultUrl;
      const sound: any = new (this._options.Sound || Sound)(name, soundUrl, {
        audioContext: this._options.disableAudioContextSounds ? null : Device.audioContext,
        maxDuration: soundDef.maxDuration,
        shouldLoop: soundDef.shouldLoop,
      });

      this._soundcache.set(name as Device.SoundName, sound);
    }

    this._setupAudioHelper();

    this._setupPublisher();

    const originalChunderURIs: Set<string> = new Set(this._chunderURIs);

    const chunderw = typeof this._options.chunderw === 'string'
      ? [this._options.chunderw]
      : Array.isArray(this._options.chunderw) && this._options.chunderw;

    const newChunderURIs = this._chunderURIs = (
      chunderw || getChunderURIs(
        this._options.edge,
        undefined,
        this._log.warn.bind(this._log),
      )
    ).map((uri: string) => `wss://${uri}/signal`);

    let hasChunderURIsChanged =
      originalChunderURIs.size !== newChunderURIs.length;

    if (!hasChunderURIsChanged) {
      for (const uri of newChunderURIs) {
        if (!originalChunderURIs.has(uri)) {
          hasChunderURIsChanged = true;
          break;
        }
      }
    }

    if (hasChunderURIsChanged && this._streamConnectedPromise) {
      const shouldReRegister = this.state === Device.State.Registered;
      await this._setupStream();
      if (shouldReRegister) {
        await this.register();
      }
    }

    // Setup close protection and make sure we clean up ongoing calls on unload.
    if (
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function' &&
      this._options.closeProtection
    ) {
      window.removeEventListener('beforeunload', this._boundConfirmClose);
      window.addEventListener('beforeunload', this._boundConfirmClose);
    }
  }

  /**
   * Update the token used by this {@link Device} to connect to Twilio.
   * @param token
   */
  updateToken(token: string) {
    if (typeof token !== 'string') {
      throw new InvalidArgumentError(INVALID_TOKEN_MESSAGE);
    }

    this._token = token;

    if (this._stream) {
      this._stream.setToken(this._token);
    }

    if (this._publisher) {
      this._publisher.setToken(this._token);
    }
  }

  /**
   * Called on window's beforeunload event if closeProtection is enabled,
   * preventing users from accidentally navigating away from an active call.
   * @param event
   */
  private _confirmClose(event: any): string {
    if (!this._activeConnection) { return ''; }

    const closeProtection: boolean | string = this._options.closeProtection || false;
    const confirmationMsg: string = typeof closeProtection !== 'string'
      ? 'A call is currently in-progress. Leaving or reloading this page will end the call.'
      : closeProtection;

    (event || window.event).returnValue = confirmationMsg;
    return confirmationMsg;
  }

  /**
   * Create the default Insights payload
   * @param connection
   */
  private _createDefaultPayload = (connection?: Connection): Record<string, any> => {
    const payload: Record<string, any> = {
      aggressive_nomination: this._options.forceAggressiveIceNomination,
      browser_extension: this._isBrowserExtension,
      dscp: !!this._options.dscp,
      ice_restart_enabled: true,
      platform: rtc.getMediaEngine(),
      sdk_version: C.RELEASE_VERSION,
    };

    function setIfDefined(propertyName: string, value: string | undefined | null) {
      if (value) { payload[propertyName] = value; }
    }

    if (connection) {
      const callSid = connection.parameters.CallSid;
      setIfDefined('call_sid', /^TJ/.test(callSid) ? undefined : callSid);
      setIfDefined('temp_call_sid', connection.outboundConnectionId);
      setIfDefined('audio_codec', connection.codec);
      payload.direction = connection.direction;
    }

    setIfDefined('gateway', this._stream && this._stream.gateway);
    setIfDefined('region', this._stream && this._stream.region);

    return payload;
  }

  /**
   * Destroy the AudioHelper.
   */
  private _destroyAudioHelper() {
    if (!this._audio) { return; }

    this._audio.removeAllListeners();
    this._audio = null;
  }

  /**
   * Destroy the publisher.
   */
  private _destroyPublisher() {
    // Attempt to destroy non-existent publisher.
    if (!this._publisher) { return; }

    this._publisher = null;
  }

  /**
   * Destroy the connection to the signaling server.
   */
  private _destroyStream() {
    if (this._stream) {
      this._stream.destroy();
      this._stream = null;
    }

    this._streamConnectedPromise = null;
  }

  /**
   * Find a {@link Connection} by its CallSid.
   * @param callSid
   */
  private _findConnection(callSid: string): Connection | null {
    return this._connections.find(conn => conn.parameters.CallSid === callSid
      || conn.outboundConnectionId === callSid) || null;
  }

  /**
   * Create a new {@link Connection}.
   * @param twimlParams - A flat object containing key:value pairs to be sent to the TwiML app.
   * @param options - Options to be used to instantiate the {@link Connection}.
   */
  private async _makeConnection(twimlParams: Record<string, string>, options?: Connection.Options): Promise<Connection> {
    if (typeof Device._isUnifiedPlanDefault === 'undefined') {
      throw new InvalidStateError('Device has not been initialized.');
    }

    const config: Connection.Config = {
      audioHelper: this._audio,
      getUserMedia,
      isUnifiedPlanDefault: Device._isUnifiedPlanDefault,
      pstream: await (this._streamConnectedPromise || this._setupStream()),
      publisher: this._publisher,
      soundcache: this._soundcache,
    };

    options = Object.assign({
      MediaStream: this._options.MediaStream || rtc.PeerConnection,
      beforeAccept: (conn: Connection) => {
        if (!this._activeConnection || this._activeConnection === conn) {
          return;
        }

        this._activeConnection.disconnect();
        this._removeConnection(this._activeConnection);
      },
      codecPreferences: this._options.codecPreferences,
      dialtonePlayer: Device._dialtonePlayer,
      dscp: this._options.dscp,
      forceAggressiveIceNomination: this._options.forceAggressiveIceNomination,
      getInputStream: (): MediaStream | null => this._options.fileInputStream || this._connectionInputStream,
      getSinkIds: (): string[] => this._connectionSinkIds,
      maxAverageBitrate: this._options.maxAverageBitrate,
      preflight: this._options.preflight,
      rtcConstraints: this._options.rtcConstraints,
      shouldPlayDisconnect: () => this._enabledSounds.disconnect,
      twimlParams,
    }, options);

    const connection = new (this._options.Connection || Connection)(config, options);

    connection.once('accept', () => {
      this._removeConnection(connection);
      this._activeConnection = connection;
      if (this._audio) {
        this._audio._maybeStartPollingVolume();
      }

      if (connection.direction === Connection.CallDirection.Outgoing && this._enabledSounds.outgoing) {
        this._soundcache.get(Device.SoundName.Outgoing).play();
      }

      const data: any = { edge: this._edge || this._region };
      if (this._options.edge) {
        data['selected_edge'] = Array.isArray(this._options.edge)
          ? this._options.edge
          : [this._options.edge];
      }

      this._publisher.info('settings', 'edge', data, connection);
    });

    connection.addListener('error', (error: Connection.Error) => {
      if (connection.status() === 'closed') {
        this._removeConnection(connection);
      }
      if (this._audio) {
        this._audio._maybeStopPollingVolume();
      }
      this._maybeStopIncomingSound();
    });

    connection.once('cancel', () => {
      this._log.info(`Canceled: ${connection.parameters.CallSid}`);
      this._removeConnection(connection);
      if (this._audio) {
        this._audio._maybeStopPollingVolume();
      }
      this._maybeStopIncomingSound();
    });

    connection.once('disconnect', () => {
      if (this._audio) {
        this._audio._maybeStopPollingVolume();
      }
      this._removeConnection(connection);
    });

    connection.once('reject', () => {
      this._log.info(`Rejected: ${connection.parameters.CallSid}`);
      if (this._audio) {
        this._audio._maybeStopPollingVolume();
      }
      this._removeConnection(connection);
      this._maybeStopIncomingSound();
    });

    connection.once('transportClose', () => {
      if (connection.status() !== Connection.State.Pending) {
        return;
      }
      if (this._audio) {
        this._audio._maybeStopPollingVolume();
      }
      this._removeConnection(connection);
      this._maybeStopIncomingSound();
    });

    return connection;
  }

  /**
   * Stop the incoming sound if no {@link Connection}s remain.
   */
  private _maybeStopIncomingSound(): void {
    if (!this._connections.length) {
      this._soundcache.get(Device.SoundName.Incoming).stop();
    }
  }

  /**
   * Called when a 'close' event is received from the signaling stream.
   */
  private _onSignalingClose = () => {
    this._stream = null;
    this._streamConnectedPromise = null;
  }

  /**
   * Called when a 'connected' event is received from the signaling stream.
   */
  private _onSignalingConnected = (payload: Record<string, any>) => {
    const region = getRegionShortcode(payload.region);
    this._edge = regionToEdge[region as Region] || payload.region;
    this._region = region || payload.region;

    // The signaling stream emits a `connected` event after reconnection, if the
    // device was registered before this, then register again.
    if (this._shouldReRegister) {
      this.register();
    }
  }

  /**
   * Called when an 'error' event is received from the signaling stream.
   */
  private _onSignalingError = (payload: Record<string, any>) => {
    if (typeof payload !== 'object') { return; }

    const { error, callsid } = payload;

    if (typeof error !== 'object') { return; }

    const connection: Connection | undefined =
      (typeof callsid === 'string' && this._findConnection(callsid)) || undefined;

    const { code } = error;
    let { twilioError } = error;

    if (!twilioError && typeof code === 'number') {
      if (code === 31201) {
        twilioError = new AuthorizationErrors.AuthenticationFailed();
      } else if (code === 31204) {
        twilioError = new AuthorizationErrors.AccessTokenInvalid();
      } else if (code === 31205) {
        // Stop trying to register presence after token expires
        this._stopRegistrationTimer();
        twilioError = new AuthorizationErrors.AccessTokenExpired();
      } else if (hasErrorByCode(code)) {
        twilioError = new (getErrorByCode(code))();
      }
    }

    if (!twilioError) {
      this._log.error('Unknown signaling error: ', error);
      twilioError = new GeneralErrors.UnknownError();
    }

    this._log.info('Received error: ', twilioError);
    this.emit(Device.EventName.Error, twilioError, connection);
  }

  /**
   * Called when an 'invite' event is received from the signaling stream.
   */
  private _onSignalingInvite = async (payload: Record<string, any>) => {
    const wasBusy = !!this._activeConnection;
    if (wasBusy && !this._options.allowIncomingWhileBusy) {
      this._log.info('Device busy; ignoring incoming invite');
      return;
    }

    if (!payload.callsid || !payload.sdp) {
      this.emit(Device.EventName.Error, new ClientErrors.BadRequest('Malformed invite from gateway'));
      return;
    }

    const callParameters = payload.parameters || { };
    callParameters.CallSid = callParameters.CallSid || payload.callsid;

    const customParameters = Object.assign({ }, queryToJson(callParameters.Params));
    const connection = await this._makeConnection(customParameters, {
      callParameters,
      offerSdp: payload.sdp,
    });

    this._connections.push(connection);

    connection.once('accept', () => {
      this._soundcache.get(Device.SoundName.Incoming).stop();
      this._publishNetworkChange();
    });

    const play = (this._enabledSounds.incoming && !wasBusy)
      ? () => this._soundcache.get(Device.SoundName.Incoming).play()
      : () => Promise.resolve();

    this._showIncomingConnection(connection, play);
  }

  /**
   * Called when an 'offline' event is received from the signaling stream.
   */
  private _onSignalingOffline = () => {
    this._log.info('Stream is offline');

    this._edge = null;
    this._region = null;

    this._shouldReRegister = this.state !== Device.State.Unregistered;

    this._setState(Device.State.Unregistered);
  }

  /**
   * Called when a 'ready' event is received from the signaling stream.
   */
  private _onSignalingReady = () => {
    this._log.info('Stream is ready');

    this._setState(Device.State.Registered);
  }

  /**
   * Publish a NetworkInformation#change event to Insights if there's an active {@link Connection}.
   */
  private _publishNetworkChange = () => {
    if (!this._activeConnection) {
      return;
    }

    if (this._networkInformation) {
      this._publisher.info('network-information', 'network-change', {
        connection_type: this._networkInformation.type,
        downlink: this._networkInformation.downlink,
        downlinkMax: this._networkInformation.downlinkMax,
        effective_type: this._networkInformation.effectiveType,
        rtt: this._networkInformation.rtt,
      }, this._activeConnection);
    }
  }

  /**
   * Remove a {@link Connection} from device.connections by reference
   * @param connection
   */
  private _removeConnection(connection: Connection): void {
    if (this._activeConnection === connection) {
      this._activeConnection = null;
    }

    for (let i = this._connections.length - 1; i >= 0; i--) {
      if (connection === this._connections[i]) {
        this._connections.splice(i, 1);
      }
    }
  }

  /**
   * Register with the signaling server.
   */
  private async _sendPresence(presence: boolean): Promise<void> {
    const stream = await this._streamConnectedPromise;

    if (!stream) { return; }

    stream.register({ audio: presence });
    if (presence) {
      this._startRegistrationTimer();
    } else {
      this._stopRegistrationTimer();
    }
  }

  /**
   * Helper function that sets and emits the state of the device.
   * @param state The new state of the device.
   */
   private _setState(state: Device.State): void {
    if (state === this.state) {
      return;
    }

    this._state = state;
    this.emit(this._stateEventMapping[state]);
  }

  /**
   * Set up an audio helper for usage by this {@link Device}.
   */
  private _setupAudioHelper(): void {
    if (this._audio) {
      this._log.info('Found existing audio helper; destroying...');
      this._destroyAudioHelper();
    }

    this._audio = new (this._options.AudioHelper || AudioHelper)(
      this._updateSinkIds,
      this._updateInputStream,
      getUserMedia,
      {
        audioContext: Device.audioContext,
        enabledSounds: this._enabledSounds,
      },
    );

    this._audio.on('deviceChange', (lostActiveDevices: MediaDeviceInfo[]) => {
      const activeConnection: Connection | null = this._activeConnection;
      const deviceIds: string[] = lostActiveDevices.map((device: MediaDeviceInfo) => device.deviceId);

      this._publisher.info('audio', 'device-change', {
        lost_active_device_ids: deviceIds,
      }, activeConnection);

      if (activeConnection) {
        activeConnection['_mediaHandler']._onInputDevicesChanged();
      }
    });
  }

  /**
   * Create and set a publisher for the {@link Device} to use.
   */
  private _setupPublisher(): IPublisher {
    if (this._publisher) {
      this._log.info('Found existing publisher; destroying...');
      this._destroyPublisher();
    }

    this._publisher = (this._options.Publisher || Publisher)(
      PUBLISHER_PRODUCT_NAME,
      this.token,
      {
        defaultPayload: this._createDefaultPayload,
        host: this._options.eventgw,
        metadata: {
          app_name: this._options.appName,
          app_version: this._options.appVersion,
        },
      },
    );

    if (this._options.publishEvents === false) {
      this._publisher.disable();
    } else {
      this._publisher.on('error', (error: Error) => {
        this._log.warn('Cannot connect to insights.', error);
      });
    }

    return this._publisher;
  }

  /**
   * Set up the connection to the signaling server. Tears down an existing
   * stream if called while a stream exists.
   */
  private _setupStream(): Promise<IPStream> {
    if (this._stream) {
      this._log.info('Found existing stream; destroying...');
      this._destroyStream();
    }

    this._log.info('Setting up VSP');
    this._stream = (this._options.PStream || PStream)(
      this.token,
      this._chunderURIs,
      {
        backoffMaxMs: this._options.backoffMaxMs,
      },
    );

    this._stream.addListener('close', this._onSignalingClose);
    this._stream.addListener('connected', this._onSignalingConnected);
    this._stream.addListener('error', this._onSignalingError);
    this._stream.addListener('invite', this._onSignalingInvite);
    this._stream.addListener('offline', this._onSignalingOffline);
    this._stream.addListener('ready', this._onSignalingReady);

    return this._streamConnectedPromise = new Promise<this>(resolve =>
      this._stream.once('connected', () => {
        resolve(this._stream);
      }),
    );
  }

  /**
   * Start playing the incoming ringtone, and subsequently emit the incoming event.
   * @param connection
   * @param play - The function to be used to play the sound. Must return a Promise.
   */
  private _showIncomingConnection(connection: Connection, play: Function): Promise<void> {
    let timeout: NodeJS.Timer;
    return Promise.race([
      play(),
      new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          const msg = 'Playing incoming ringtone took too long; it might not play. Continuing execution...';
          reject(new Error(msg));
        }, RINGTONE_PLAY_TIMEOUT);
      }),
    ]).catch(reason => {
      this._log.info(reason.message);
    }).then(() => {
      clearTimeout(timeout);
      this.emit(Device.EventName.Incoming, connection);
    });
  }

  /**
   * Set a timeout to send another register message to the signaling server.
   */
  private _startRegistrationTimer(): void {
    this._stopRegistrationTimer();
    this._regTimer = setTimeout(() => {
      this._sendPresence(true);
    }, REGISTRATION_INTERVAL);
  }

  /**
   * Stop sending registration messages to the signaling server.
   */
  private _stopRegistrationTimer(): void {
    if (this._regTimer) {
      clearTimeout(this._regTimer);
    }
  }

  /**
   * Update the input stream being used for calls so that any current call and all future calls
   * will use the new input stream.
   * @param inputStream
   */
  private _updateInputStream = (inputStream: MediaStream | null): Promise<void> => {
    const connection: Connection | null = this._activeConnection;

    if (connection && !inputStream) {
      return Promise.reject(new InvalidStateError('Cannot unset input device while a call is in progress.'));
    }

    this._connectionInputStream = inputStream;
    return connection
      ? connection._setInputTracksFromStream(inputStream)
      : Promise.resolve();
  }

  /**
   * Update the device IDs of output devices being used to play the incoming ringtone through.
   * @param sinkIds - An array of device IDs
   */
  private _updateRingtoneSinkIds(sinkIds: string[]): Promise<void> {
    return Promise.resolve(this._soundcache.get(Device.SoundName.Incoming).setSinkIds(sinkIds));
  }

  /**
   * Update the device IDs of output devices being used to play sounds through.
   * @param type - Whether to update ringtone or speaker sounds
   * @param sinkIds - An array of device IDs
   */
  private _updateSinkIds = (type: 'ringtone' | 'speaker', sinkIds: string[]): Promise<void> => {
    const promise: Promise<void> = type === 'ringtone'
      ? this._updateRingtoneSinkIds(sinkIds)
      : this._updateSpeakerSinkIds(sinkIds);

    return promise.then(() => {
      this._publisher.info('audio', `${type}-devices-set`, {
        audio_device_ids: sinkIds,
      }, this._activeConnection);
    }, error => {
      this._publisher.error('audio', `${type}-devices-set-failed`, {
        audio_device_ids: sinkIds,
        message: error.message,
      }, this._activeConnection);

      throw error;
    });
  }

  /**
   * Update the device IDs of output devices being used to play the non-ringtone sounds
   * and Call audio through.
   * @param sinkIds - An array of device IDs
   */
  private _updateSpeakerSinkIds(sinkIds: string[]): Promise<void> {
    Array.from(this._soundcache.entries())
      .filter(entry => entry[0] !== Device.SoundName.Incoming)
      .forEach(entry => entry[1].setSinkIds(sinkIds));

    this._connectionSinkIds = sinkIds;
    const connection = this._activeConnection;
    return connection
      ? connection._setSinkIds(sinkIds)
      : Promise.resolve();
  }
}

namespace Device {
  /**
   * Emitted when the {@link Device} receives an error.
   * @param error
   * @example `device.on('error', connection => { })`
   * @event
   */
  declare function errorEvent(error: TwilioError, connection?: Connection): void;

  /**
   * Emitted when an incoming {@link Connection} is received.
   * @param connection - The incoming {@link Connection}.
   * @example `device.on('incoming', connection => { })`
   * @event
   */
  declare function incomingEvent(connection: Connection): void;

  /**
   * Emitted when the {@link Device} is unregistered.
   * @param device
   * @example `device.on('unregistered', device => { })`
   * @event
   */
  declare function unregisteredEvent(device: Device): void;

  /**
   * Emitted when the {@link Device} is registering.
   * @param device
   * @example `device.on('registering', device => { })`
   * @event
   */
  declare function registeringEvent(device: Device): void;

  /**
   * Emitted when the {@link Device} is registered.
   * @param device
   * @example `device.on('registered', device => { })`
   * @event
   */
  declare function registeredEvent(device: Device): void;

  /**
   * All valid {@link Device} event names.
   */
  export enum EventName {
    Error = 'error',
    Incoming = 'incoming',
    Unregistered = 'unregistered',
    Registering = 'registering',
    Registered = 'registered',
  }

  /**
   * All possible {@link Device} states.
   */
  export enum State {
    Unregistered = 'unregistered',
    Registering = 'registering',
    Registered = 'registered',
  }

  /**
   * Names of all sounds handled by the {@link Device}.
   */
  export enum SoundName {
    Incoming = 'incoming',
    Outgoing = 'outgoing',
    Disconnect = 'disconnect',
    Dtmf0 = 'dtmf0',
    Dtmf1 = 'dtmf1',
    Dtmf2 = 'dtmf2',
    Dtmf3 = 'dtmf3',
    Dtmf4 = 'dtmf4',
    Dtmf5 = 'dtmf5',
    Dtmf6 = 'dtmf6',
    Dtmf7 = 'dtmf7',
    Dtmf8 = 'dtmf8',
    Dtmf9 = 'dtmf9',
    DtmfS = 'dtmfs',
    DtmfH = 'dtmfh',
  }

  /**
   * Names of all togglable sounds.
   */
  export type ToggleableSound = Device.SoundName.Incoming | Device.SoundName.Outgoing | Device.SoundName.Disconnect;

  /**
   * The error format used by errors emitted from {@link Device}.
   */
  export interface Error {
    /**
     * Error code
     */
    code: number;

    /**
     * Reference to the {@link Connection}
     * This is usually available if the error is coming from {@link Connection}
     */
    connection?: Connection;

    /**
     * The info object from rtc/peerconnection or eventpublisher. May contain code and message (duplicated here).
     */
    info?: { code?: number, message?: string };

    /**
     * Error message
     */
    message: string;

    /**
     * Twilio Voice related error
     */
    twilioError?: TwilioError;
  }

  /**
   * Options to be passed to {@link Device.connect}.
   */
  export interface ConnectOptions extends Connection.AcceptOptions {
   /**
    * A flat object containing key:value pairs to be sent to the TwiML app.
    */
    params?: Record<string, string>;
  }

  /**
   * Options that may be passed to the {@link Device} constructor, or Device.setup via public API
   */
  export interface Options {
    /**
     * Whether the Device should raise the {@link incomingEvent} event when a new call invite is
     * received while already on an active call. Default behavior is false.
     */
    allowIncomingWhileBusy?: boolean;

    /**
     * A name for the application that is instantiating the {@link Device}. This is used to improve logging
     * in Insights by associating Insights data with a specific application, particularly in the case where
     * one account may be connected to by multiple applications.
     */
    appName?: string;

    /**
     * A version for the application that is instantiating the {@link Device}. This is used to improve logging
     * in Insights by associating Insights data with a specific version of the given application. This can help
     * track down when application-level bugs were introduced.
     */
    appVersion?: string;

    /**
     * Whether to enable close protection, to prevent users from accidentally
     * navigating away from the page during a call. If string, the value will
     * be used as a custom message.
     */
    closeProtection?: boolean | string;

    /**
     * An ordered array of codec names, from most to least preferred.
     */
    codecPreferences?: Connection.Codec[];

    /**
     * Whether AudioContext sounds should be disabled. Useful for trouble shooting sound issues
     * that may be caused by AudioContext-specific sounds. If set to true, will fall back to
     * HTMLAudioElement sounds.
     */
    disableAudioContextSounds?: boolean;

    /**
     * Whether to use googDscp in RTC constraints.
     */
    dscp?: boolean;

    /**
     * The edge value corresponds to the geographic location that the client
     * will use to connect to Twilio infrastructure. The default value is
     * "roaming" which automatically selects an edge based on the latency of the
     * client relative to available edges.
     */
    edge?: string[] | string;

    /**
     * Experimental feature.
     * Whether to use ICE Aggressive nomination.
     */
    forceAggressiveIceNomination?: boolean;

    /**
     * Log level.
     */
    logLevel?: LogLevelDesc;

    /**
     * The maximum average audio bitrate to use, in bits per second (bps) based on
     * [RFC-7587 7.1](https://tools.ietf.org/html/rfc7587#section-7.1). By default, the setting
     * is not used. If you specify 0, then the setting is not used. Any positive integer is allowed,
     * but values outside the range 6000 to 510000 are ignored and treated as 0. The recommended
     * bitrate for speech is between 8000 and 40000 bps as noted in
     * [RFC-7587 3.1.1](https://tools.ietf.org/html/rfc7587#section-3.1.1).
     */
    maxAverageBitrate?: number;

    /**
     * A mapping of custom sound URLs by sound name.
     */
    sounds?: Partial<Record<Device.SoundName, string>>;
  }
}

export default Device;
