/// <reference types="node" />
/**
 * @packageDocumentation
 * @module Voice
 * @preferred
 * @publicapi
 */
import { EventEmitter } from 'events';
import { LogLevelDesc } from 'loglevel';
import AudioHelper from './audiohelper';
import Call from './call';
import { PreflightTest } from './preflight/preflight';
/**
 * @private
 */
export declare type IPStream = any;
/**
 * @private
 */
export declare type IPublisher = any;
/**
 * @private
 */
export declare type ISound = any;
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
     * Custom {@link Call} constructor
     */
    Call?: typeof Call;
    /**
     * Hostname of the signaling gateway to connect to.
     */
    chunderw?: string | string[];
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
    rtcConstraints?: Call.AcceptOptions['rtcConstraints'];
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
declare class Device extends EventEmitter {
    /**
     * The AudioContext to be used by {@link Device} instances.
     * @private
     */
    static get audioContext(): AudioContext | undefined;
    /**
     * Which sound file extension is supported.
     * @private
     */
    static get extension(): 'mp3' | 'ogg';
    /**
     * Whether or not this SDK is supported by the current browser.
     */
    static get isSupported(): boolean;
    /**
     * Package name of the SDK.
     */
    static get packageName(): string;
    /**
     * Run some tests to identify issues, if any, prohibiting successful calling.
     * @param token - A Twilio JWT token string
     * @param options
     */
    static runPreflight(token: string, options?: PreflightTest.Options): PreflightTest;
    /**
     * String representation of {@link Device} class.
     * @private
     */
    static toString(): string;
    /**
     * Current SDK version.
     */
    static get version(): string;
    /**
     * An AudioContext to share between {@link Device}s.
     */
    private static _audioContext?;
    private static _defaultSounds;
    /**
     * A DialtonePlayer to play mock DTMF sounds through.
     */
    private static _dialtonePlayer?;
    /**
     * Whether or not the browser uses unified-plan SDP by default.
     */
    private static _isUnifiedPlanDefault;
    /**
     * Initializes the AudioContext instance shared across the Client SDK,
     * or returns the existing instance if one has already been initialized.
     */
    private static _getOrCreateAudioContext;
    /**
     * The currently active {@link Call}, if there is one.
     */
    private _activeCall;
    /**
     * The AudioHelper instance associated with this {@link Device}.
     */
    private _audio;
    /**
     * {@link Device._confirmClose} bound to the specific {@link Device} instance.
     */
    private _boundConfirmClose;
    /**
     * {@link Device.destroy} bound to the specific {@link Device} instance.
     */
    private _boundDestroy;
    /**
     * An audio input MediaStream to pass to new {@link Call} instances.
     */
    private _callInputStream;
    /**
     * An array of {@link Call}s. Though only one can be active, multiple may exist when there
     * are multiple incoming, unanswered {@link Call}s.
     */
    private _calls;
    /**
     * An array of {@link Device} IDs to be used to play sounds through, to be passed to
     * new {@link Call} instances.
     */
    private _callSinkIds;
    /**
     * The list of chunder URIs that will be passed to PStream
     */
    private _chunderURIs;
    /**
     * Default options used by {@link Device}.
     */
    private readonly _defaultOptions;
    /**
     * The name of the edge the {@link Device} is connected to.
     */
    private _edge;
    /**
     * Whether each sound is enabled.
     */
    private _enabledSounds;
    /**
     * Whether SDK is run as a browser extension
     */
    private _isBrowserExtension;
    /**
     * An instance of Logger to use.
     */
    private _log;
    /**
     * Network related information
     * See https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API
     */
    private _networkInformation;
    /**
     * The options passed to {@link Device} constructor or {@link Device.updateOptions}.
     */
    private _options;
    /**
     * An Insights Event Publisher.
     */
    private _publisher;
    /**
     * The region the {@link Device} is connected to.
     */
    private _region;
    /**
     * A timeout ID for a setTimeout schedule to re-register the {@link Device}.
     */
    private _regTimer;
    /**
     * Boolean representing whether or not the {@link Device} was registered when
     * receiving a signaling `offline`. Determines if the {@link Device} attempts
     * a `re-register` once signaling is re-established when receiving a
     * `connected` event from the stream.
     */
    private _shouldReRegister;
    /**
     * A Map of Sounds to play.
     */
    private _soundcache;
    /**
     * The current status of the {@link Device}.
     */
    private _state;
    /**
     * A map from {@link Device.State} to {@link Device.EventName}.
     */
    private readonly _stateEventMapping;
    /**
     * The Signaling stream.
     */
    private _stream;
    /**
     * A promise that will resolve when the Signaling stream is ready.
     */
    private _streamConnectedPromise;
    /**
     * The JWT string currently being used to authenticate this {@link Device}.
     */
    private _token;
    /**
     * Construct a {@link Device} instance. The {@link Device} can be registered
     * to make and listen for calls using {@link Device.register}.
     * @constructor
     * @param options
     */
    constructor(token: string, options?: Device.Options);
    /**
     * Return the active {@link Call}.
     */
    get activeCall(): Call | null;
    /**
     * Return the {@link AudioHelper} used by this {@link Device}.
     */
    get audio(): AudioHelper | null;
    /**
     * Make an outgoing Call.
     * @param options
     */
    connect(options?: Device.ConnectOptions): Promise<Call>;
    /**
     * Return the calls that this {@link Device} is maintaining.
     */
    get calls(): Call[];
    /**
     * Destroy the {@link Device}, freeing references to be garbage collected.
     */
    destroy(): void;
    /**
     * Disconnect all {@link Call}s.
     */
    disconnectAll(): void;
    /**
     * Returns the {@link Edge} value the {@link Device} is currently connected
     * to. The value will be `null` when the {@link Device} is offline.
     */
    get edge(): string | null;
    /**
     * Whether the Device is currently on an active Call.
     */
    get isBusy(): boolean;
    /**
     * Register the `Device` to the Twilio backend, allowing it to receive calls.
     */
    register(): Promise<void>;
    /**
     * Get the state of this {@link Device} instance
     */
    get state(): Device.State;
    /**
     * Get the token used by this {@link Device}.
     */
    get token(): string | null;
    /**
     * String representation of {@link Device} instance.
     * @private
     */
    toString(): string;
    /**
     * Unregister the `Device` to the Twilio backend, disallowing it to receive
     * calls.
     */
    unregister(): Promise<void>;
    /**
     * Set the options used within the {@link Device}.
     * @param options
     */
    updateOptions(options?: Device.Options): void;
    /**
     * Update the token used by this {@link Device} to connect to Twilio.
     * @param token
     */
    updateToken(token: string): void;
    /**
     * Called on window's beforeunload event if closeProtection is enabled,
     * preventing users from accidentally navigating away from an active call.
     * @param event
     */
    private _confirmClose;
    /**
     * Create the default Insights payload
     * @param call
     */
    private _createDefaultPayload;
    /**
     * Destroy the AudioHelper.
     */
    private _destroyAudioHelper;
    /**
     * Destroy the publisher.
     */
    private _destroyPublisher;
    /**
     * Destroy the connection to the signaling server.
     */
    private _destroyStream;
    /**
     * Find a {@link Call} by its CallSid.
     * @param callSid
     */
    private _findCall;
    /**
     * Create a new {@link Call}.
     * @param twimlParams - A flat object containing key:value pairs to be sent to the TwiML app.
     * @param options - Options to be used to instantiate the {@link Call}.
     */
    private _makeCall;
    /**
     * Stop the incoming sound if no {@link Call}s remain.
     */
    private _maybeStopIncomingSound;
    /**
     * Called when a 'close' event is received from the signaling stream.
     */
    private _onSignalingClose;
    /**
     * Called when a 'connected' event is received from the signaling stream.
     */
    private _onSignalingConnected;
    /**
     * Called when an 'error' event is received from the signaling stream.
     */
    private _onSignalingError;
    /**
     * Called when an 'invite' event is received from the signaling stream.
     */
    private _onSignalingInvite;
    /**
     * Called when an 'offline' event is received from the signaling stream.
     */
    private _onSignalingOffline;
    /**
     * Called when a 'ready' event is received from the signaling stream.
     */
    private _onSignalingReady;
    /**
     * Publish a NetworkInformation#change event to Insights if there's an active {@link Call}.
     */
    private _publishNetworkChange;
    /**
     * Remove a {@link Call} from device.calls by reference
     * @param call
     */
    private _removeCall;
    /**
     * Register with the signaling server.
     */
    private _sendPresence;
    /**
     * Helper function that sets and emits the state of the device.
     * @param state The new state of the device.
     */
    private _setState;
    /**
     * Set up an audio helper for usage by this {@link Device}.
     */
    private _setupAudioHelper;
    /**
     * Create and set a publisher for the {@link Device} to use.
     */
    private _setupPublisher;
    /**
     * Set up the connection to the signaling server. Tears down an existing
     * stream if called while a stream exists.
     */
    private _setupStream;
    /**
     * Start playing the incoming ringtone, and subsequently emit the incoming event.
     * @param call
     * @param play - The function to be used to play the sound. Must return a Promise.
     */
    private _showIncomingCall;
    /**
     * Set a timeout to send another register message to the signaling server.
     */
    private _startRegistrationTimer;
    /**
     * Stop sending registration messages to the signaling server.
     */
    private _stopRegistrationTimer;
    /**
     * Throw an error if the {@link Device} is destroyed.
     */
    private _throwIfDestroyed;
    /**
     * Update the input stream being used for calls so that any current call and all future calls
     * will use the new input stream.
     * @param inputStream
     */
    private _updateInputStream;
    /**
     * Update the device IDs of output devices being used to play the incoming ringtone through.
     * @param sinkIds - An array of device IDs
     */
    private _updateRingtoneSinkIds;
    /**
     * Update the device IDs of output devices being used to play sounds through.
     * @param type - Whether to update ringtone or speaker sounds
     * @param sinkIds - An array of device IDs
     */
    private _updateSinkIds;
    /**
     * Update the device IDs of output devices being used to play the non-ringtone sounds
     * and Call audio through.
     * @param sinkIds - An array of device IDs
     */
    private _updateSpeakerSinkIds;
}
declare namespace Device {
    /**
     * All valid {@link Device} event names.
     */
    enum EventName {
        Error = "error",
        Incoming = "incoming",
        Destroyed = "destroyed",
        Unregistered = "unregistered",
        Registering = "registering",
        Registered = "registered"
    }
    /**
     * All possible {@link Device} states.
     */
    enum State {
        Destroyed = "destroyed",
        Unregistered = "unregistered",
        Registering = "registering",
        Registered = "registered"
    }
    /**
     * Names of all sounds handled by the {@link Device}.
     */
    enum SoundName {
        Incoming = "incoming",
        Outgoing = "outgoing",
        Disconnect = "disconnect",
        Dtmf0 = "dtmf0",
        Dtmf1 = "dtmf1",
        Dtmf2 = "dtmf2",
        Dtmf3 = "dtmf3",
        Dtmf4 = "dtmf4",
        Dtmf5 = "dtmf5",
        Dtmf6 = "dtmf6",
        Dtmf7 = "dtmf7",
        Dtmf8 = "dtmf8",
        Dtmf9 = "dtmf9",
        DtmfS = "dtmfs",
        DtmfH = "dtmfh"
    }
    /**
     * Names of all togglable sounds.
     */
    type ToggleableSound = Device.SoundName.Incoming | Device.SoundName.Outgoing | Device.SoundName.Disconnect;
    /**
     * Options to be passed to {@link Device.connect}.
     */
    interface ConnectOptions extends Call.AcceptOptions {
        /**
         * A flat object containing key:value pairs to be sent to the TwiML app.
         */
        params?: Record<string, string>;
    }
    /**
     * Options that may be passed to the {@link Device} constructor, or Device.setup via public API
     */
    interface Options {
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
        codecPreferences?: Call.Codec[];
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
