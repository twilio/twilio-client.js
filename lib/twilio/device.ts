/**
 * @module Voice
 * @preferred
 * @publicapi
 */
import { EventEmitter } from 'events';
import AudioHelper from './audiohelper';
import Connection from './connection';
import DialtonePlayer from './dialtonePlayer';
import {
  AuthorizationErrors,
  ClientErrors,
  GeneralErrors,
  InvalidArgumentError,
  InvalidStateError,
  NotSupportedError,
  SignalingErrors,
} from './errors';
import Log from './log';
import { PStream } from './pstream';
import {
  defaultRegion,
  getRegionShortcode,
  getRegionURI,
} from './regions';
import { Exception, queryToJson } from './util';

const C = require('./constants');
const Publisher = require('./eventpublisher');
const rtc = require('./rtc');
const getUserMedia = require('./rtc/getusermedia');
const Sound = require('./sound');
const { isUnifiedPlanDefault } = require('./util');

/**
 * @private
 */
const networkInformation = (navigator as any).connection
  || (navigator as any).mozConnection
  || (navigator as any).webkitConnection;

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

declare const RTCRtpTransceiver: any;
declare const webkitAudioContext: typeof AudioContext;

let hasBeenWarnedHandlers: boolean = false;
let hasBeenWarnedSounds: boolean = false;

/**
 * Options that may be passed to the {@link Device} constructor for internal testing.
 * @private
 */
export interface IExtendedDeviceOptions extends Device.Options {
  /**
   * Custom {@link AudioHelper} constructor
   */
  AudioHelper?: any;

  /**
   * Hostname of the signaling gateway to connect to.
   */
  chunderw?: string;

  /**
   * Custom {@link Connection} constructor
   */
  connectionFactory?: Connection;

  /**
   * Hostname of the event gateway to connect to.
   */
  eventgw?: string;

  /**
   * A list of specific ICE servers to use. Overridden by {@link Device.Options.rtcConfiguration}.
   * @deprecated
   */
  iceServers?: Object[];

  /**
   * Ignore browser support, disabling the exception that is thrown when neither WebRTC nor
   * ORTC are supported.
   */
  ignoreBrowserSupport?: boolean;

  /**
   * Whether to disable audio flag in MediaPresence (rrowland: Do we need this?)
   */
  noRegister?: boolean;

  /**
   * Custom PStream constructor
   */
  pStreamFactory?: IPStream;

  /**
   * Custom Publisher constructor
   */
  Publisher?: IPublisher;

  /**
   * Whether Insights events should be published
   */
  publishEvents?: boolean;

  /**
   * RTC Constraints to pass to getUserMedia when making or accepting a Call.
   * The format of this object depends on browser.
   */
  rtcConstraints?: Object;

  /**
   * Custom Sound constructor
   */
  soundFactory?: ISound;
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

  /**
   * A DialtonePlayer to play mock DTMF sounds through.
   */
  private static _dialtonePlayer?: DialtonePlayer;

  /**
   * Whether or not the browser uses unified-plan SDP by default.
   */
  private static _isUnifiedPlanDefault: boolean | undefined;

  /**
   * The AudioHelper instance associated with this {@link Device}.
   */
  audio: AudioHelper | null = null;

  /**
   * An array of {@link Connection}s. Though only one can be active, multiple may exist when there
   * are multiple incoming, unanswered {@link Connection}s.
   */
  connections: Connection[] = [];

  /**
   * Whether or not {@link Device.setup} has been called.
   */
  isInitialized: boolean = false;

  /**
   * Methods to enable/disable each sound. Empty if the {@link Device} has not
   * yet been set up.
   */
  readonly sounds: Partial<Record<Device.SoundName, (value?: boolean) => void>> = { };

  /**
   * The JWT string currently being used to authenticate this {@link Device}.
   */
  token: string | null = null;

  /**
   * The currently active {@link Connection}, if there is one.
   */
  private _activeConnection: Connection | null = null;

  /**
   * An audio input MediaStream to pass to new {@link Connection} instances.
   */
  private _connectionInputStream: MediaStream | null = null;

  /**
   * An array of {@link Device} IDs to be used to play sounds through, to be passed to
   * new {@link Connection} instances.
   */
  private _connectionSinkIds: string[] = ['default'];

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
   * An Insights Event Publisher.
   */
  private _publisher: IPublisher | null = null;

  /**
   * The region the {@link Device} is connected to.
   */
  private _region: string | null = null;

  /**
   * The current status of the {@link Device}.
   */
  private _status: Device.Status = Device.Status.Offline;

  /**
   * Value of 'audio' determines whether we should be registered for incoming calls.
   */
  private mediaPresence: { audio: boolean } = { audio: true };

  /**
   * The options passed to {@link Device} constructor or Device.setup.
   */
  private options: Device.Options = {
    allowIncomingWhileBusy: false,
    audioConstraints: true,
    closeProtection: false,
    codecPreferences: [Connection.Codec.PCMU, Connection.Codec.Opus],
    connectionFactory: Connection,
    debug: false,
    dscp: true,
    enableIceRestart: false,
    eventgw: 'eventgw.twilio.com',
    forceAggressiveIceNomination: false,
    iceServers: [],
    noRegister: false,
    pStreamFactory: PStream,
    region: defaultRegion,
    rtcConstraints: { },
    soundFactory: Sound,
    sounds: { },
    warnings: true,
  };

  /**
   * A timeout ID for a setTimeout schedule to re-register the {@link Device}.
   */
  private regTimer: NodeJS.Timer | null = null;

  /**
   * A Map of Sounds to play.
   */
  private soundcache: Map<Device.SoundName, ISound> = new Map();

  /**
   * The Signaling stream.
   */
  private stream: IPStream | null = null;

  /**
   * Construct a {@link Device} instance, without setting up up. {@link Device.setup} must
   * be called later to initialize the {@link Device}.
   * @constructor
   * @param [token] - A Twilio JWT token string granting this {@link Device} access.
   * @param [options]
   */
  constructor();
  /**
   * Construct a {@link Device} instance, and set it up as part of the construction.
   * @constructor
   * @param [token] - A Twilio JWT token string granting this {@link Device} access.
   * @param [options]
   */
  constructor(token: string, options?: Device.Options);
  constructor(token?: string, options?: Device.Options) {
    super();

    if (window) {
      const root: any = window as any;
      const browser: any = root.msBrowser || root.browser || root.chrome;

      this._isBrowserExtension = (!!browser && !!browser.runtime && !!browser.runtime.id)
        || (!!root.safari && !!root.safari.extension);
    }

    if (this._isBrowserExtension) {
      this._log.info('Running as browser extension.');
    }

    if (token) {
      this.setup(token, options);
    } else if (options) {
      throw new InvalidArgumentError('Cannot construct a Device with options but without a token');
    }
  }

  /**
   * Return the active {@link Connection}. Null or undefined for backward compatibility.
   */
  activeConnection(): Connection | null | undefined {
    if (!this.isInitialized) {
      return null;
    }
    // @rrowland This should only return activeConnection, but customers have built around this
    // broken behavior and in order to not break their apps we are including this until
    // the next big release.
    return this._activeConnection || this.connections[0];
  }

  /**
   * @deprecated Set a handler for the cancel event.
   * @param handler
   */
  cancel(handler: (connection: Connection) => any): this {
    return this._addHandler(Device.EventName.Cancel, handler);
  }

  /**
   * Make an outgoing Call.
   * @param [params] - A flat object containing key:value pairs to be sent to the TwiML app.
   * @param [audioConstraints]
   */
  connect(params?: Record<string, string>,
          audioConstraints?: MediaTrackConstraints | boolean): Connection;
  /**
   * Add a listener for the connect event.
   * @param handler - A handler to set on the connect event.
   */
  connect(handler: (connection: Connection) => any): null;
  connect(paramsOrHandler?: Record<string, string> | ((connection: Connection) => any),
          audioConstraints?: MediaTrackConstraints | boolean): Connection | null {
    if (typeof paramsOrHandler === 'function') {
      this._addHandler(Device.EventName.Connect, paramsOrHandler);
      return null;
    }

    this._throwUnlessSetup('connect');

    if (this._activeConnection) {
      throw new InvalidStateError('A Connection is already active');
    }

    const params: Record<string, string> = paramsOrHandler || { };
    audioConstraints = audioConstraints || this.options && this.options.audioConstraints || { };
    const connection = this._activeConnection = this._makeConnection(params);

    // Make sure any incoming connections are ignored
    this.connections.splice(0).forEach(conn => conn.ignore());

    // Stop the incoming sound if it's playing
    this.soundcache.get(Device.SoundName.Incoming).stop();

    connection.accept(audioConstraints);
    this._publishNetworkChange();
    return connection;
  }

  /**
   * Destroy the {@link Device}, freeing references to be garbage collected.
   */
  destroy(): void {
    this._disconnectAll();
    this._stopRegistrationTimer();

    if (this.audio) {
      this.audio._unbind();
    }

    if (this.stream) {
      this.stream.destroy();
      this.stream = null;
    }

    if (networkInformation) {
      networkInformation.removeEventListener('change', this._publishNetworkChange);
    }

    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('beforeunload', this._confirmClose);
      window.removeEventListener('unload', this._disconnectAll);
    }
  }

  /**
   * Set a handler for the disconnect event.
   * @deprecated Use {@link Device.on}.
   * @param handler
   */
  disconnect(handler: (connection: Connection) => any): this {
    return this._addHandler(Device.EventName.Disconnect, handler);
  }

  /**
   * Disconnect all {@link Connection}s.
   */
  disconnectAll(): void {
    this._throwUnlessSetup('disconnectAll');
    this._disconnectAll();
  }

  /**
   * Set a handler for the error event.
   * @deprecated Use {@link Device.on}.
   * @param handler
   */
  error(handler: (error: Connection) => any): this {
    return this._addHandler(Device.EventName.Error, handler);
  }

  /**
   * Set a handler for the incoming event.
   * @deprecated Use {@link Device.on}.
   * @param handler
   */
  incoming(handler: (connection: Connection) => any): this {
    return this._addHandler(Device.EventName.Incoming, handler);
  }

  /**
   * Set a handler for the offline event.
   * @deprecated Use {@link Device.on}.
   * @param handler
   */
  offline(handler: (device: Device) => any): this {
    return this._addHandler(Device.EventName.Offline, handler);
  }

  /**
   * Set a handler for the ready event.
   * @deprecated Use {@link Device.on}.
   * @param handler
   */
  ready(handler: (device: Device) => any): this {
    return this._addHandler(Device.EventName.Ready, handler);
  }

  /**
   * Get the {@link Region} string the {@link Device} is currently connected to, or 'offline'
   * if not connected.
   */
  region(): string {
    this._throwUnlessSetup('region');
    return typeof this._region === 'string' ? this._region : 'offline';
  }

  /**
   * Register to receive incoming calls. Does not need to be called unless {@link Device.unregisterPresence}
   * has been called directly.
   */
  registerPresence(): this {
    this._throwUnlessSetup('registerPresence');
    this.mediaPresence.audio = true;
    this._sendPresence();
    return this;
  }

  /**
   * Remove an event listener
   * @param event - The event name to stop listening for
   * @param listener - The callback to remove
   */
  removeListener(event: Device.EventName, listener: (...args: any[]) => void): this {
    EventEmitter.prototype.removeListener.call(this, event, listener);
    return this;
  }

  /**
   * Initialize the {@link Device}.
   * @param token - A Twilio JWT token string granting this {@link Device} access.
   * @param [options]
   */
  setup(token: string, options: Device.Options = { }): this {
    if (!Device.isSupported && !options.ignoreBrowserSupport) {
      if (window && window.location && window.location.protocol === 'http:') {
        throw new NotSupportedError(`twilio.js wasn't able to find WebRTC browser support. \
          This is most likely because this page is served over http rather than https, \
          which does not support WebRTC in many browsers. Please load this page over https and \
          try again.`);
      }
      throw new NotSupportedError(`twilio.js 1.3+ SDKs require WebRTC/ORTC browser support. \
        For more information, see <https://www.twilio.com/docs/api/client/twilio-js>. \
        If you have any questions about this announcement, please contact \
        Twilio Support at <help@twilio.com>.`);
    }

    if (!token) {
      throw new InvalidArgumentError('Token is required for Device.setup()');
    }

    if (typeof Device._isUnifiedPlanDefault === 'undefined') {
      Device._isUnifiedPlanDefault = typeof window !== 'undefined'
        && typeof RTCPeerConnection !== 'undefined'
        && typeof RTCRtpTransceiver !== 'undefined'
      ? isUnifiedPlanDefault(window, window.navigator, RTCPeerConnection, RTCRtpTransceiver)
      : false;
    }

    if (!Device._audioContext) {
      if (typeof AudioContext !== 'undefined') {
        Device._audioContext = new AudioContext();
      } else if (typeof webkitAudioContext !== 'undefined') {
        Device._audioContext = new webkitAudioContext();
      }
    }

    if (Device._audioContext && options.fakeLocalDTMF) {
      if (!Device._dialtonePlayer) {
        Device._dialtonePlayer = new DialtonePlayer(Device._audioContext);
      }
    } else if (Device._dialtonePlayer) {
      Device._dialtonePlayer.cleanup();
      delete Device._dialtonePlayer;
    }

    if (this.isInitialized) {
      this._log.info('Found existing Device; using new token but ignoring options');
      this.updateToken(token);
      return this;
    }

    this.isInitialized = true;

    Object.assign(this.options, options);

    if (this.options.dscp) {
      (this.options.rtcConstraints as any).optional = [{ googDscp: true }];
    }

    this._log.setDefaultLevel(this.options.debug ? Log.levels.DEBUG
      : this.options.warnings ? Log.levels.WARN
      : Log.levels.SILENT);

    const getOrSetSound = (key: Device.ToggleableSound, value?: boolean) => {
      if (!hasBeenWarnedSounds) {
        this._log.warn('Device.sounds is deprecated and will be removed in the next breaking ' +
          'release. Please use the new functionality available on Device.audio.');
        hasBeenWarnedSounds = true;
      }

      if (typeof value !== 'undefined') {
        this._enabledSounds[key] = value;
      }

      return this._enabledSounds[key];
    };

    [Device.SoundName.Disconnect, Device.SoundName.Incoming, Device.SoundName.Outgoing]
        .forEach((eventName: Device.SoundName) => {
      this.sounds[eventName] = getOrSetSound.bind(null, eventName);
    });

    const regionURI = getRegionURI(this.options.region, newRegion => this._log.warn(
      `Region ${this.options.region} is deprecated, please use ${newRegion}.`,
    ));

    this.options.chunderw = `wss://${this.options.chunderw || regionURI}/signal`;

    const defaultSounds: Record<string, ISoundDefinition> = {
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

    for (const name of Object.keys(defaultSounds)) {
      const soundDef: ISoundDefinition = defaultSounds[name];

      const defaultUrl: string = `${C.SOUNDS_BASE_URL}/${soundDef.filename}.${Device.extension}`
        + `?cache=${C.RELEASE_VERSION}`;

      const soundUrl: string = this.options.sounds && this.options.sounds[name as Device.SoundName] || defaultUrl;
      const sound: any = new this.options.soundFactory(name, soundUrl, {
        audioContext: this.options.disableAudioContextSounds ? null : Device.audioContext,
        maxDuration: soundDef.maxDuration,
        shouldLoop: soundDef.shouldLoop,
      });

      this.soundcache.set(name as Device.SoundName, sound);
    }

    this._publisher = (this.options.Publisher || Publisher)('twilio-js-sdk', token, {
      defaultPayload: this._createDefaultPayload,
      host: this.options.eventgw,
    } as any);

    if (this.options.publishEvents === false) {
      this._publisher.disable();
    }

    if (networkInformation) {
      networkInformation.addEventListener('change', this._publishNetworkChange);
    }

    this.audio = new (this.options.AudioHelper || AudioHelper)
        (this._updateSinkIds, this._updateInputStream, getUserMedia, {
      audioContext: Device.audioContext,
      enabledSounds: this._enabledSounds,
    }) as AudioHelper;

    this.audio.on('deviceChange', (lostActiveDevices: MediaDeviceInfo[]) => {
      const activeConnection: Connection | null = this._activeConnection;
      const deviceIds: string[] = lostActiveDevices.map((device: MediaDeviceInfo) => device.deviceId);

      this._publisher.info('audio', 'device-change', {
        lost_active_device_ids: deviceIds,
      }, activeConnection);

      if (activeConnection) {
        activeConnection.mediaStream._onInputDevicesChanged();
      }
    });

    this.mediaPresence.audio = !this.options.noRegister;
    this.updateToken(token);

    // Setup close protection and make sure we clean up ongoing calls on unload.
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('unload', this._disconnectAll);
      if (this.options.closeProtection) {
        window.addEventListener('beforeunload', this._confirmClose);
      }
    }

    // (rrowland) This maintains backward compatibility, but we should look at
    // removing this next breaking change. Any error should be caught by the
    // customer, and anything that's not a fatal error should not be emitted
    // via error event.
    this.on(Device.EventName.Error, () => {
      if (this.listenerCount('error') > 1) { return; }
      this._log.info('Uncaught error event suppressed.');
    });

    return this;
  }

  /**
   * Get the status of this {@link Device} instance
   */
  status(): Device.Status {
    this._throwUnlessSetup('status');
    return this._activeConnection ? Device.Status.Busy : this._status;
  }

  /**
   * String representation of {@link Device} instance.
   * @private
   */
  toString() {
    return '[Twilio.Device instance]';
  }

  /**
   * Unregister to receiving incoming calls.
   */
  unregisterPresence(): this {
    this._throwUnlessSetup('unregisterPresence');

    this.mediaPresence.audio = false;
    this._sendPresence();
    return this;
  }

  /**
   * Update the token and re-register.
   * @param token - The new token JWT string to register with.
   */
  updateToken(token: string): void {
    this._throwUnlessSetup('updateToken');
    this.token = token;
    this.register(token);
  }

  /**
   * Add a handler for an EventEmitter and emit a deprecation warning on first call.
   * @param eventName - Name of the event
   * @param handler - A handler to call when the event is emitted
   */
  private _addHandler(eventName: Device.EventName, handler: (...args: any[]) => any): this {
    if (!hasBeenWarnedHandlers) {
      this._log.warn(`Device callback handlers (connect, error, offline, incoming, cancel, ready, disconnect) \
        have been deprecated and will be removed in the next breaking release. Instead, the EventEmitter \
        interface can be used to set event listeners. Example: device.on('${eventName}', handler)`);
      hasBeenWarnedHandlers = true;
    }

    this.addListener(eventName, handler);
    return this;
  }

  /**
   * Calls the emit API such that it is asynchronous.
   * Only use this internal API if you don't want to break the execution after raising an event.
   * This prevents the issue where events are not dispatched to all handlers when one of the handlers throws an error.
   * For example, our connection:accept is not triggered if the handler for device:connect handler throws an error.
   * As a side effect, we are not able to perform our internal routines such as stopping incoming sounds.
   * See connection:accept inside _makeConnection where we call emit('connect'). This can throw an error.
   * See connection:accept inside _onSignalingInvite. This handler won't get called if the error above is thrown.
   * @private
   */
  private _asyncEmit(event: string | symbol, ...args: any[]): void {
    setTimeout(() => this.emit(event, ...args));
  }

  /**
   * Called on window's beforeunload event if closeProtection is enabled,
   * preventing users from accidentally navigating away from an active call.
   * @param event
   */
  private _confirmClose = (event: any): string => {
    if (!this._activeConnection) { return ''; }

    const closeProtection: boolean | string = this.options.closeProtection || false;
    const confirmationMsg: string = typeof closeProtection !== 'string'
      ? 'A call is currently in-progress. Leaving or reloading this page will end the call.'
      : closeProtection;

    (event || window.event).returnValue = confirmationMsg;
    return confirmationMsg;
  }

  /**
   * Create the default Insights payload
   * @param [connection]
   */
  private _createDefaultPayload = (connection?: Connection): Record<string, any> => {
    const payload: Record<string, any> = {
      aggressive_nomination: this.options.forceAggressiveIceNomination,
      browser_extension: this._isBrowserExtension,
      dscp: !!this.options.dscp,
      ice_restart_enabled: this.options.enableIceRestart,
      platform: rtc.getMediaEngine(),
      sdk_version: C.RELEASE_VERSION,
      selected_region: this.options.region,
    };

    function setIfDefined(propertyName: string, value: string | undefined) {
      if (value) { payload[propertyName] = value; }
    }

    if (connection) {
      const callSid = connection.parameters.CallSid;
      setIfDefined('call_sid', /^TJ/.test(callSid) ? undefined : callSid);
      setIfDefined('temp_call_sid', connection.outboundConnectionId);
      setIfDefined('audio_codec', connection.codec);
      payload.direction = connection.direction;
    }

    const stream: IPStream = this.stream;
    if (stream) {
      setIfDefined('gateway', stream.gateway);
      setIfDefined('region', stream.region);
    }

    return payload;
  }

  /**
   * Disconnect all {@link Connection}s.
   */
  private _disconnectAll = (): void => {
    const connections = this.connections.splice(0);
    connections.forEach((conn: Connection) => conn.disconnect());

    if (this._activeConnection) {
      this._activeConnection.disconnect();
    }
  }

  /**
   * Find a {@link Connection} by its CallSid.
   * @param callSid
   */
  private _findConnection(callSid: string): Connection | null {
    return this.connections.find(conn => conn.parameters.CallSid === callSid
      || conn.outboundConnectionId === callSid) || null;
  }

  /**
   * Create a new {@link Connection}.
   * @param twimlParams - A flat object containing key:value pairs to be sent to the TwiML app.
   * @param [options] - Options to be used to instantiate the {@link Connection}.
   */
  private _makeConnection(twimlParams: Record<string, string>, options?: Connection.Options): Connection {
    if (typeof Device._isUnifiedPlanDefault === 'undefined') {
      throw new InvalidStateError('Device has not been initialized.');
    }

    const config: Connection.Config = {
      audioHelper: this.audio,
      getUserMedia,
      isUnifiedPlanDefault: Device._isUnifiedPlanDefault,
      pstream: this.stream,
      publisher: this._publisher,
      soundcache: this.soundcache,
    };

    options = Object.assign({
      MediaStream: this.options.MediaStream
        || this.options.mediaStreamFactory
        || rtc.PeerConnection,
      audioConstraints: this.options.audioConstraints,
      beforeAccept: (conn: Connection) => {
        if (!this._activeConnection || this._activeConnection === conn) {
          return;
        }

        this._activeConnection.disconnect();
        this._removeConnection(this._activeConnection);
      },
      codecPreferences: this.options.codecPreferences,
      dialtonePlayer: Device._dialtonePlayer,
      dscp: this.options.dscp,
      enableIceRestart: this.options.enableIceRestart,
      enableRingingState: this.options.enableRingingState,
      forceAggressiveIceNomination: this.options.forceAggressiveIceNomination,
      getInputStream: (): MediaStream | null => this._connectionInputStream,
      getSinkIds: (): string[] => this._connectionSinkIds,
      maxAverageBitrate: this.options.maxAverageBitrate,
      rtcConfiguration: this.options.rtcConfiguration || { iceServers: this.options.iceServers },
      rtcConstraints: this.options.rtcConstraints,
      shouldPlayDisconnect: () => this._enabledSounds.disconnect,
      twimlParams,
    }, options);

    const connection = new this.options.connectionFactory(config, options);

    connection.once('accept', () => {
      this._removeConnection(connection);
      this._activeConnection = connection;
      if (this.audio) {
        this.audio._maybeStartPollingVolume();
      }

      if (connection.direction === Connection.CallDirection.Outgoing && this._enabledSounds.outgoing) {
        this.soundcache.get(Device.SoundName.Outgoing).play();
      }

      this._asyncEmit('connect', connection);
    });

    connection.addListener('error', (error: Connection.Error) => {
      if (connection.status() === 'closed') {
        this._removeConnection(connection);
      }
      if (this.audio) {
        this.audio._maybeStopPollingVolume();
      }
      this._maybeStopIncomingSound();
      this._asyncEmit('error', error);
    });

    connection.once('cancel', () => {
      this._log.info(`Canceled: ${connection.parameters.CallSid}`);
      this._removeConnection(connection);
      if (this.audio) {
        this.audio._maybeStopPollingVolume();
      }
      this._maybeStopIncomingSound();
      this._asyncEmit('cancel', connection);
    });

    connection.once('disconnect', () => {
      if (this.audio) {
        this.audio._maybeStopPollingVolume();
      }
      this._removeConnection(connection);
      this._asyncEmit('disconnect', connection);
    });

    connection.once('reject', () => {
      this._log.info(`Rejected: ${connection.parameters.CallSid}`);
      if (this.audio) {
        this.audio._maybeStopPollingVolume();
      }
      this._removeConnection(connection);
      this._maybeStopIncomingSound();
    });

    connection.once('transportClose', () => {
      if (connection.status() !== Connection.State.Pending) {
        return;
      }
      if (this.audio) {
        this.audio._maybeStopPollingVolume();
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
    if (!this.connections.length) {
      this.soundcache.get(Device.SoundName.Incoming).stop();
    }
  }

  /**
   * Called when a 'close' event is received from the signaling stream.
   */
  private _onSignalingClose = () => {
    this.stream = null;
  }

  /**
   * Called when a 'connected' event is received from the signaling stream.
   */
  private _onSignalingConnected = (payload: Record<string, any>) => {
    this._region = getRegionShortcode(payload.region) || payload.region;
    this._sendPresence();
  }

  /**
   * Called when an 'error' event is received from the signaling stream.
   */
  private _onSignalingError = (payload: Record<string, any>) => {
    if (!payload.error) { return; }

    const error = { ...payload.error };
    const sid = payload.callsid;
    if (sid) {
      error.connection = this._findConnection(sid);
    }

    if (error.code === 31201) {
      error.twilioError = new AuthorizationErrors.AuthenticationFailed();
    } else if (error.code === 31204) {
      error.twilioError = new AuthorizationErrors.AccessTokenInvalid();
    } else if (error.code === 31205) {
      // Stop trying to register presence after token expires
      this._stopRegistrationTimer();
      error.twilioError = new AuthorizationErrors.AccessTokenExpired();
    } else if (!error.twilioError) {
      error.twilioError = new GeneralErrors.UnknownError();
    }

    this._log.info('Received error: ', error);
    this.emit('error', error);
  }

  /**
   * Called when an 'invite' event is received from the signaling stream.
   */
  private _onSignalingInvite = (payload: Record<string, any>) => {
    const wasBusy = !!this._activeConnection;
    if (wasBusy && !this.options.allowIncomingWhileBusy) {
      this._log.info('Device busy; ignoring incoming invite');
      return;
    }

    if (!payload.callsid || !payload.sdp) {
      this.emit('error', { message: 'Malformed invite from gateway', twilioError: new ClientErrors.BadRequest() });
      return;
    }

    const callParameters = payload.parameters || { };
    callParameters.CallSid = callParameters.CallSid || payload.callsid;

    const customParameters = Object.assign({ }, queryToJson(callParameters.Params));
    const connection = this._makeConnection(customParameters, {
      callParameters,
      offerSdp: payload.sdp,
    });

    this.connections.push(connection);

    connection.once('accept', () => {
      this.soundcache.get(Device.SoundName.Incoming).stop();
      this._publishNetworkChange();
    });

    const play = (this._enabledSounds.incoming && !wasBusy)
      ? () => this.soundcache.get(Device.SoundName.Incoming).play()
      : () => Promise.resolve();

    this._showIncomingConnection(connection, play);
  }

  /**
   * Called when an 'offline' event is received from the signaling stream.
   */
  private _onSignalingOffline = () => {
    this._log.info('Stream is offline');
    this._status = Device.Status.Offline;
    this._region = null;
    this.emit('offline', this);
  }

  /**
   * Called when a 'ready' event is received from the signaling stream.
   */
  private _onSignalingReady = () => {
    this._log.info('Stream is ready');
    this._status = Device.Status.Ready;
    this.emit('ready', this);
  }

  /**
   * Publish a NetworkInformation#change event to Insights if there's an active {@link Connection}.
   */
  private _publishNetworkChange = () => {
    if (!this._activeConnection) {
      return;
    }

    if (networkInformation) {
      this._publisher.info('network-information', 'network-change', {
        connection_type: networkInformation.type,
        downlink: networkInformation.downlink,
        downlinkMax: networkInformation.downlinkMax,
        effective_type: networkInformation.effectiveType,
        rtt: networkInformation.rtt,
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

    for (let i = this.connections.length - 1; i >= 0; i--) {
      if (connection === this.connections[i]) {
        this.connections.splice(i, 1);
      }
    }
  }

  /**
   * Register with the signaling server.
   */
  private _sendPresence(): void {
    if (!this.stream) { return; }

    this.stream.register({ audio: this.mediaPresence.audio });
    if (this.mediaPresence.audio) {
      this._startRegistrationTimer();
    } else {
      this._stopRegistrationTimer();
    }
  }

  /**
   * Set up the connection to the signaling server.
   * @param token
   */
  private _setupStream(token: string) {
    this._log.info('Setting up VSP');
    this.stream = this.options.pStreamFactory(token, this.options.chunderw, {
      backoffMaxMs: this.options.backoffMaxMs,
    });

    this.stream.addListener('close', this._onSignalingClose);
    this.stream.addListener('connected', this._onSignalingConnected);
    this.stream.addListener('error', this._onSignalingError);
    this.stream.addListener('invite', this._onSignalingInvite);
    this.stream.addListener('offline', this._onSignalingOffline);
    this.stream.addListener('ready', this._onSignalingReady);
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
      this.emit('incoming', connection);
    });
  }

  /**
   * Set a timeout to send another register message to the signaling server.
   */
  private _startRegistrationTimer(): void {
    this._stopRegistrationTimer();
    this.regTimer = setTimeout(() => {
      this._sendPresence();
    }, REGISTRATION_INTERVAL);
  }

  /**
   * Stop sending registration messages to the signaling server.
   */
  private _stopRegistrationTimer(): void {
    if (this.regTimer) {
      clearTimeout(this.regTimer);
    }
  }

  /**
   * Throw an Error if Device.setup has not been called for this instance.
   * @param methodName - The name of the method being called before setup()
   */
  private _throwUnlessSetup(methodName: string) {
    if (!this.isInitialized) { throw new InvalidStateError(`Call Device.setup() before ${methodName}`); }
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
    return Promise.resolve(this.soundcache.get(Device.SoundName.Incoming).setSinkIds(sinkIds));
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
    Array.from(this.soundcache.entries())
      .filter(entry => entry[0] !== Device.SoundName.Incoming)
      .forEach(entry => entry[1].setSinkIds(sinkIds));

    this._connectionSinkIds = sinkIds;
    const connection = this._activeConnection;
    return connection
      ? connection._setSinkIds(sinkIds)
      : Promise.resolve();
  }

  /**
   * Register the {@link Device}
   * @param token
   */
  private register(token: string): void {
    if (this.stream) {
      this.stream.setToken(token);
      this._publisher.setToken(token);
    } else {
      this._setupStream(token);
    }
  }
}

namespace Device {
  /**
   * Emitted when an incoming {@link Connection} is canceled.
   * @param connection - The canceled {@link Connection}.
   * @example `device.on('cancel', connection => { })`
   * @event
   */
  declare function cancelEvent(connection: Connection): void;

  /**
   * Emitted when a {@link Connection} has been opened.
   * @param connection - The {@link Connection} that was opened.
   * @example `device.on('connect', connection => { })`
   * @event
   */
  declare function connectEvent(connection: Connection): void;

  /**
   * Emitted when a {@link Connection} has been disconnected.
   * @param connection - The {@link Connection} that was disconnected.
   * @example `device.on('disconnect', connection => { })`
   * @event
   */
  declare function disconnectEvent(connection: Connection): void;

  /**
   * Emitted when the {@link Device} receives an error.
   * @param error
   * @example `device.on('error', connection => { })`
   * @event
   */
  declare function errorEvent(error: Connection): void;

  /**
   * Emitted when an incoming {@link Connection} is received.
   * @param connection - The incoming {@link Connection}.
   * @example `device.on('incoming', connection => { })`
   * @event
   */
  declare function incomingEvent(connection: Connection): void;

  /**
   * Emitted when the {@link Device} goes offline.
   * @param device
   * @example `device.on('offline', device => { })`
   * @event
   */
  declare function offlineEvent(device: Device): void;

  /**
   * Emitted when the {@link Device} is connected to signaling and ready.
   * @param device
   * @example `device.on('ready', device => { })`
   * @event
   */
  declare function readyEvent(device: Device): void;

  /**
   * All valid {@link Device} event names.
   */
  export enum EventName {
    Cancel = 'cancel',
    Connect = 'connect',
    Disconnect = 'disconnect',
    Error = 'error',
    Incoming = 'incoming',
    Offline = 'offline',
    Ready = 'ready',
  }

  /**
   * All possible {@link Device} statuses.
   */
  export enum Status {
    Busy = 'busy',
    Offline = 'offline',
    Ready = 'ready',
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
   * Options that may be passed to the {@link Device} constructor, or Device.setup via public API
   */
  export interface Options {
    [key: string]: any;

    /**
     * Whether the Device should raise the {@link incomingEvent} event when a new call invite is
     * received while already on an active call. Default behavior is false.
     */
    allowIncomingWhileBusy?: boolean;

    /**
     * Audio Constraints to pass to getUserMedia when making or accepting a Call.
     * This is placed directly under `audio` of the MediaStreamConstraints object.
     */
    audioConstraints?: MediaTrackConstraints | boolean;

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
     * Whether to enable debug logging.
     */
    debug?: boolean;

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
     * Whether to automatically restart ICE when media connection fails
     */
    enableIceRestart?: boolean;

    /**
     * Whether the ringing state should be enabled on {@link Connection} objects. This is required
     * to enable answerOnBridge functionality.
     */
    enableRingingState?: boolean;

    /**
     * Whether or not to override the local DTMF sounds with fake dialtones. This won't affect
     * the DTMF tone sent over the connection, but will prevent double-send issues caused by
     * using real DTMF tones for user interface. In 2.0, this will be enabled by default.
     */
    fakeLocalDTMF?: boolean;

    /**
     * Experimental feature.
     * Whether to use ICE Aggressive nomination.
     */
    forceAggressiveIceNomination?: boolean;

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
     * The region code of the region to connect to.
     */
    region?: string;

    /**
     * An RTCConfiguration to pass to the RTCPeerConnection constructor.
     */
    rtcConfiguration?: RTCConfiguration;

    /**
     * A mapping of custom sound URLs by sound name.
     */
    sounds?: Partial<Record<Device.SoundName, string>>;

    /**
     * Whether to enable warn logging.
     */
    warnings?: boolean;
  }
}

export default Device;
