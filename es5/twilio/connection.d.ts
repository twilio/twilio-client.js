/// <reference types="node" />
/**
 * @packageDocumentation
 * @module Voice
 * @publicapi
 * @internal
 */
import { EventEmitter } from 'events';
import Device from './device';
import DialtonePlayer from './dialtonePlayer';
import { TwilioError } from './errors';
import RTCSample from './rtc/sample';
import StatsMonitor from './statsMonitor';
/**
 * @private
 */
export declare type IAudioHelper = any;
/**
 * @private
 */
export declare type IPStream = any;
/**
 * @private
 */
export declare type IPeerConnection = any;
/**
 * @private
 */
export declare type IPublisher = any;
/**
 * @private
 */
export declare type ISound = any;
/**
 * A {@link Connection} represents a media and signaling connection to a TwiML application.
 * @publicapi
 */
declare class Connection extends EventEmitter {
    /**
     * String representation of the {@link Connection} class.
     * @private
     */
    static toString: () => string;
    /**
     * Returns caller verification information about the caller.
     * If no caller verification information is available this will return null.
     */
    readonly callerInfo: Connection.CallerInfo | null;
    /**
     * The custom parameters sent to (outgoing) or received by (incoming) the TwiML app.
     */
    readonly customParameters: Map<string, string>;
    /**
     * Whether this {@link Connection} is incoming or outgoing.
     */
    get direction(): Connection.CallDirection;
    /**
     * Audio codec used for this {@link Connection}. Expecting {@link Connection.Codec} but
     * will copy whatever we get from RTC stats.
     */
    get codec(): string;
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
    parameters: Record<string, string>;
    /**
     * Audio codec used for this {@link Connection}. Expecting {@link Connection.Codec} but
     * will copy whatever we get from RTC stats.
     */
    private _codec;
    /**
     * Whether this {@link Connection} is incoming or outgoing.
     */
    private readonly _direction;
    /**
     * The number of times input volume has been the same consecutively.
     */
    private _inputVolumeStreak;
    /**
     * Whether the call has been answered.
     */
    private _isAnswered;
    /**
     * Whether the call has been cancelled.
     */
    private _isCancelled;
    /**
     * Whether or not the browser uses unified-plan SDP by default.
     */
    private readonly _isUnifiedPlanDefault;
    /**
     * The most recent public input volume value. 0 -> 1 representing -100 to -30 dB.
     */
    private _latestInputVolume;
    /**
     * The most recent public output volume value. 0 -> 1 representing -100 to -30 dB.
     */
    private _latestOutputVolume;
    /**
     * An instance of Logger to use.
     */
    private _log;
    /**
     * An instance of Backoff for media reconnection
     */
    private _mediaReconnectBackoff;
    /**
     * Timestamp for the initial media reconnection
     */
    private _mediaReconnectStartTime;
    /**
     * A batch of metrics samples to send to Insights. Gets cleared after
     * each send and appended to on each new sample.
     */
    private readonly _metricsSamples;
    /**
     * An instance of StatsMonitor.
     */
    private readonly _monitor;
    /**
     * The number of times output volume has been the same consecutively.
     */
    private _outputVolumeStreak;
    /**
     * An instance of EventPublisher.
     */
    private readonly _publisher;
    /**
     * A Map of Sounds to play.
     */
    private readonly _soundcache;
    /**
     * State of the {@link Connection}.
     */
    private _status;
    /**
     * TwiML params for the call. May be set for either outgoing or incoming calls.
     */
    private readonly message;
    /**
     * Options passed to this {@link Connection}.
     */
    private options;
    /**
     * The PStream instance to use for Twilio call signaling.
     */
    private readonly pstream;
    /**
     * Whether the {@link Connection} should send a hangup on disconnect.
     */
    private sendHangup;
    /**
     * @constructor
     * @private
     * @param config - Mandatory configuration options
     * @param [options] - Optional settings
     */
    constructor(config: Connection.Config, options?: Connection.Options);
    /**
     * Get the real CallSid. Returns null if not present or is a temporary call sid.
     * @deprecated
     * @private
     */
    _getRealCallSid(): string | null;
    /**
     * Get the temporary CallSid.
     * @deprecated
     * @private
     */
    _getTempCallSid(): string | undefined;
    /**
     * Set the audio input tracks from a given stream.
     * @param stream
     * @private
     */
    _setInputTracksFromStream(stream: MediaStream | null): Promise<void>;
    /**
     * Set the audio output sink IDs.
     * @param sinkIds
     * @private
     */
    _setSinkIds(sinkIds: string[]): Promise<void>;
    /**
     * Accept the incoming {@link Connection}.
     * @param [audioConstraints]
     * @param [rtcConfiguration] - An RTCConfiguration to override the one set in `Device.setup`.
     */
    accept(audioConstraints?: MediaTrackConstraints | boolean, rtcConfiguration?: RTCConfiguration): void;
    /**
     * @deprecated - Set a handler for the {@link acceptEvent}
     * @param handler
     */
    accept(handler: (connection: this) => void): void;
    /**
     * @deprecated - Ignore the incoming {@link Connection}.
     */
    cancel(): void;
    /**
     * @deprecated - Set a handler for the {@link cancelEvent}
     */
    cancel(handler: () => void): void;
    /**
     * Disconnect from the {@link Connection}.
     */
    disconnect(): void;
    /**
     * @deprecated - Set a handler for the {@link disconnectEvent}
     */
    disconnect(handler: (connection: this) => void): void;
    /**
     * @deprecated - Set a handler for the {@link errorEvent}
     */
    error(handler: (error: Connection.Error) => void): void;
    /**
     * Get the local MediaStream, if set.
     */
    getLocalStream(): MediaStream | undefined;
    /**
     * Get the remote MediaStream, if set.
     */
    getRemoteStream(): MediaStream | undefined;
    /**
     * Ignore the incoming {@link Connection}.
     */
    ignore(): void;
    /**
     * @deprecated - Set a handler for the {@link cancelEvent}
     */
    ignore(handler: () => void): void;
    /**
     * Check if connection is muted
     */
    isMuted(): boolean;
    /**
     * Mute incoming audio.
     * @param shouldMute - Whether the incoming audio should be muted. Defaults to true.
     */
    mute(shouldMute?: boolean): void;
    /**
     * @deprecated - Set a handler for the {@link muteEvent}
     */
    mute(handler: (isMuted: boolean, connection: this) => void): void;
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
    postFeedback(score?: Connection.FeedbackScore, issue?: Connection.FeedbackIssue): Promise<void>;
    /**
     * Reject the incoming {@link Connection}.
     */
    reject(): void;
    /**
     * @deprecated - Set a handler for the {@link rejectEvent}
     */
    reject(handler: () => void): void;
    /**
     * Send a string of digits.
     * @param digits
     */
    sendDigits(digits: string): void;
    /**
     * Get the current {@link Connection} status.
     */
    status(): Connection.State;
    /**
     * String representation of {@link Connection} instance.
     * @private
     */
    toString: () => string;
    /**
     * @deprecated - Unmute the {@link Connection}.
     */
    unmute(): void;
    /**
     * @deprecated - Set a handler for the {@link volumeEvent}
     * @param handler
     */
    volume(handler: (inputVolume: number, outputVolume: number) => void): void;
    /**
     * Add a handler for an EventEmitter and emit a deprecation warning on first call.
     * @param eventName - Name of the event
     * @param handler - A handler to call when the event is emitted
     */
    private _addHandler;
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
    private _checkVolume;
    /**
     * Clean up event listeners.
     */
    private _cleanupEventListeners;
    /**
     * Create the payload wrapper for a batch of metrics to be sent to Insights.
     */
    private _createMetricPayload;
    /**
     * Disconnect the {@link Connection}.
     * @param message - A message explaining why the {@link Connection} is being disconnected.
     * @param wasRemote - Whether the disconnect was triggered locally or remotely.
     */
    private _disconnect;
    private _emitWarning;
    /**
     * Transition to {@link ConnectionStatus.Open} if criteria is met.
     */
    private _maybeTransitionToOpen;
    /**
     * Called when the {@link Connection} is answered.
     * @param payload
     */
    private _onAnswer;
    /**
     * Called when the {@link Connection} is cancelled.
     * @param payload
     */
    private _onCancel;
    /**
     * Called when the {@link Connection} is hung up.
     * @param payload
     */
    private _onHangup;
    /**
     * Called when there is a media failure.
     * Manages all media-related states and takes action base on the states
     * @param type - Type of media failure
     */
    private _onMediaFailure;
    /**
     * Called when media connection is restored
     */
    private _onMediaReconnected;
    /**
     * When we get a RINGING signal from PStream, update the {@link Connection} status.
     * @param payload
     */
    private _onRinging;
    /**
     * Called each time StatsMonitor emits a sample.
     * Emits stats event and batches the call stats metrics and sends them to Insights.
     * @param sample
     */
    private _onRTCSample;
    /**
     * Called when we receive a transportClose event from pstream.
     * Re-emits the event.
     */
    private _onTransportClose;
    /**
     * Post an event to Endpoint Analytics indicating that the end user
     *   has ignored a request for feedback.
     */
    private _postFeedbackDeclined;
    /**
     * Publish the current set of queued metrics samples to Insights.
     */
    private _publishMetrics;
    /**
     * Re-emit an StatsMonitor warning as a {@link Connection}.warning or .warning-cleared event.
     * @param warningData
     * @param wasCleared - Whether this is a -cleared or -raised event.
     */
    private _reemitWarning;
    /**
     * Re-emit an StatsMonitor warning-cleared as a .warning-cleared event.
     * @param warningData
     */
    private _reemitWarningCleared;
    /**
     * Set the CallSid
     * @param payload
     */
    private _setCallSid;
}
declare namespace Connection {
    /**
     * Possible states of the {@link Connection}.
     */
    enum State {
        Closed = "closed",
        Connecting = "connecting",
        Open = "open",
        Pending = "pending",
        Reconnecting = "reconnecting",
        Ringing = "ringing"
    }
    /**
     * Different issues that may have been experienced during a call, that can be
     * reported to Twilio Insights via {@link Connection}.postFeedback().
     */
    enum FeedbackIssue {
        AudioLatency = "audio-latency",
        ChoppyAudio = "choppy-audio",
        DroppedCall = "dropped-call",
        Echo = "echo",
        NoisyCall = "noisy-call",
        OneWayAudio = "one-way-audio"
    }
    /**
     * A rating of call quality experienced during a call, to be reported to Twilio Insights
     * via {@link Connection}.postFeedback().
     */
    enum FeedbackScore {
        One = 1,
        Two = 2,
        Three = 3,
        Four = 4,
        Five = 5
    }
    /**
     * The directionality of the {@link Connection}, whether incoming or outgoing.
     */
    enum CallDirection {
        Incoming = "INCOMING",
        Outgoing = "OUTGOING"
    }
    /**
     * Valid audio codecs to use for the media connection.
     */
    enum Codec {
        Opus = "opus",
        PCMU = "pcmu"
    }
    /**
     * Possible ICE Gathering failures
     */
    enum IceGatheringFailureReason {
        None = "none",
        Timeout = "timeout"
    }
    /**
     * Possible media failures
     */
    enum MediaFailure {
        ConnectionDisconnected = "ConnectionDisconnected",
        ConnectionFailed = "ConnectionFailed",
        IceGatheringFailed = "IceGatheringFailed",
        LowBytes = "LowBytes"
    }
    /**
     * The error format used by errors emitted from {@link Connection}.
     */
    interface Error {
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
        info: {
            code?: number;
            message?: string;
        };
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
     * A CallerInfo provides caller verification information.
     */
    interface CallerInfo {
        /**
         * Whether or not the caller's phone number has been verified by
         * Twilio using SHAKEN/STIR validation. True if the caller has
         * been validated at level 'A', false if the caller has been
         * verified at any lower level or has failed validation.
         */
        isVerified: boolean;
    }
    /**
     * Mandatory config options to be passed to the {@link Connection} constructor.
     * @private
     */
    interface Config {
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
    interface Options {
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
         * A DialTone player, to play mock DTMF sounds.
         */
        dialtonePlayer?: DialtonePlayer;
        /**
         * Whether or not to enable DSCP.
         */
        dscp?: boolean;
        /**
         * Whether to automatically restart ICE when media connection fails
         */
        enableIceRestart?: boolean;
        /**
         * Whether the ringing state should be enabled.
         */
        enableRingingState?: boolean;
        /**
         * Experimental feature.
         * Force Chrome's ICE agent to use aggressive nomination when selecting a candidate pair.
         */
        forceAggressiveIceNomination?: boolean;
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
         * The maximum average audio bitrate to use, in bits per second (bps) based on
         * [RFC-7587 7.1](https://tools.ietf.org/html/rfc7587#section-7.1). By default, the setting
         * is not used. If you specify 0, then the setting is not used. Any positive integer is allowed,
         * but values outside the range 6000 to 510000 are ignored and treated as 0. The recommended
         * bitrate for speech is between 8000 and 40000 bps as noted in
         * [RFC-7587 3.1.1](https://tools.ietf.org/html/rfc7587#section-3.1.1).
         */
        maxAverageBitrate?: number;
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
         * Whether this is a preflight call or not
         */
        preflight?: boolean;
        /**
         * The Region currently connected to.
         */
        region?: string;
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
         * The region passed to {@link Device} on setup.
         */
        selectedRegion?: string;
        /**
         * Whether the disconnect sound should be played.
         */
        shouldPlayDisconnect?: () => boolean;
        /**
         * An override for the StatsMonitor dependency.
         */
        StatsMonitor?: new () => StatsMonitor;
        /**
         * TwiML params for the call. May be set for either outgoing or incoming calls.
         */
        twimlParams?: Record<string, any>;
    }
    /**
     * Call metrics published to Insight Metrics.
     * This include rtc samples and audio information.
     * @private
     */
    interface CallMetrics extends RTCSample {
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
export default Connection;
