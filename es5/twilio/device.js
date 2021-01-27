"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArrays = (this && this.__spreadArrays) || function () {
    for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
    for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
    return r;
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @packageDocumentation
 * @module Voice
 * @preferred
 * @publicapi
 */
var events_1 = require("events");
var audiohelper_1 = require("./audiohelper");
var connection_1 = require("./connection");
var dialtonePlayer_1 = require("./dialtonePlayer");
var errors_1 = require("./errors");
var log_1 = require("./log");
var preflight_1 = require("./preflight/preflight");
var regions_1 = require("./regions");
var util_1 = require("./util");
var C = require('./constants');
var Publisher = require('./eventpublisher');
var PStream = require('./pstream');
var rtc = require('./rtc');
var getUserMedia = require('./rtc/getusermedia');
var Sound = require('./sound');
var REGISTRATION_INTERVAL = 30000;
var RINGTONE_PLAY_TIMEOUT = 2000;
var hasBeenWarnedHandlers = false;
var hasBeenWarnedSounds = false;
/**
 * Twilio Device. Allows registration for incoming calls, and placing outgoing calls.
 * @publicapi
 */
var Device = /** @class */ (function (_super) {
    __extends(Device, _super);
    function Device(token, options) {
        var _a;
        var _this = _super.call(this) || this;
        /**
         * The AudioHelper instance associated with this {@link Device}.
         */
        _this.audio = null;
        /**
         * An array of {@link Connection}s. Though only one can be active, multiple may exist when there
         * are multiple incoming, unanswered {@link Connection}s.
         */
        _this.connections = [];
        /**
         * Whether or not {@link Device.setup} has been called.
         */
        _this.isInitialized = false;
        /**
         * Methods to enable/disable each sound. Empty if the {@link Device} has not
         * yet been set up.
         */
        _this.sounds = {};
        /**
         * The JWT string currently being used to authenticate this {@link Device}.
         */
        _this.token = null;
        /**
         * The currently active {@link Connection}, if there is one.
         */
        _this._activeConnection = null;
        /**
         * The list of chunder URIs that will be passed to PStream
         */
        _this._chunderURIs = [];
        /**
         * An audio input MediaStream to pass to new {@link Connection} instances.
         */
        _this._connectionInputStream = null;
        /**
         * An array of {@link Device} IDs to be used to play sounds through, to be passed to
         * new {@link Connection} instances.
         */
        _this._connectionSinkIds = ['default'];
        /**
         * The name of the edge the {@link Device} is connected to.
         */
        _this._edge = null;
        /**
         * Whether each sound is enabled.
         */
        _this._enabledSounds = (_a = {},
            _a[Device.SoundName.Disconnect] = true,
            _a[Device.SoundName.Incoming] = true,
            _a[Device.SoundName.Outgoing] = true,
            _a);
        /**
         * An instance of Logger to use.
         */
        _this._log = log_1.default.getInstance();
        /**
         * An Insights Event Publisher.
         */
        _this._publisher = null;
        /**
         * The region the {@link Device} is connected to.
         */
        _this._region = null;
        /**
         * The current status of the {@link Device}.
         */
        _this._status = Device.Status.Offline;
        /**
         * Value of 'audio' determines whether we should be registered for incoming calls.
         */
        _this.mediaPresence = { audio: true };
        /**
         * The options passed to {@link Device} constructor or Device.setup.
         */
        _this.options = {
            allowIncomingWhileBusy: false,
            audioConstraints: true,
            closeProtection: false,
            codecPreferences: [connection_1.default.Codec.PCMU, connection_1.default.Codec.Opus],
            connectionFactory: connection_1.default,
            debug: false,
            dscp: true,
            enableIceRestart: false,
            eventgw: 'eventgw.twilio.com',
            forceAggressiveIceNomination: false,
            iceServers: [],
            noRegister: false,
            pStreamFactory: PStream,
            preflight: false,
            rtcConstraints: {},
            soundFactory: Sound,
            sounds: {},
            warnings: true,
        };
        /**
         * A timeout ID for a setTimeout schedule to re-register the {@link Device}.
         */
        _this.regTimer = null;
        /**
         * A Map of Sounds to play.
         */
        _this.soundcache = new Map();
        /**
         * The Signaling stream.
         */
        _this.stream = null;
        /**
         * Destroy the {@link Device}, freeing references to be garbage collected.
         */
        _this.destroy = function () {
            _this._disconnectAll();
            _this._stopRegistrationTimer();
            if (_this.audio) {
                _this.audio._unbind();
            }
            if (_this.stream) {
                _this.stream.destroy();
                _this.stream = null;
            }
            if (_this._networkInformation && typeof _this._networkInformation.removeEventListener === 'function') {
                _this._networkInformation.removeEventListener('change', _this._publishNetworkChange);
            }
            if (typeof window !== 'undefined' && window.removeEventListener) {
                window.removeEventListener('beforeunload', _this._confirmClose);
                window.removeEventListener('unload', _this.destroy);
                window.removeEventListener('pagehide', _this.destroy);
            }
        };
        /**
         * Called on window's beforeunload event if closeProtection is enabled,
         * preventing users from accidentally navigating away from an active call.
         * @param event
         */
        _this._confirmClose = function (event) {
            if (!_this._activeConnection) {
                return '';
            }
            var closeProtection = _this.options.closeProtection || false;
            var confirmationMsg = typeof closeProtection !== 'string'
                ? 'A call is currently in-progress. Leaving or reloading this page will end the call.'
                : closeProtection;
            (event || window.event).returnValue = confirmationMsg;
            return confirmationMsg;
        };
        /**
         * Create the default Insights payload
         * @param [connection]
         */
        _this._createDefaultPayload = function (connection) {
            var payload = {
                aggressive_nomination: _this.options.forceAggressiveIceNomination,
                browser_extension: _this._isBrowserExtension,
                dscp: !!_this.options.dscp,
                ice_restart_enabled: _this.options.enableIceRestart,
                platform: rtc.getMediaEngine(),
                sdk_version: C.RELEASE_VERSION,
            };
            function setIfDefined(propertyName, value) {
                if (value) {
                    payload[propertyName] = value;
                }
            }
            if (connection) {
                var callSid = connection.parameters.CallSid;
                setIfDefined('call_sid', /^TJ/.test(callSid) ? undefined : callSid);
                setIfDefined('temp_call_sid', connection.outboundConnectionId);
                setIfDefined('audio_codec', connection.codec);
                payload.direction = connection.direction;
            }
            setIfDefined('gateway', _this.stream && _this.stream.gateway);
            setIfDefined('selected_region', _this.options.region);
            setIfDefined('region', _this.stream && _this.stream.region);
            return payload;
        };
        /**
         * Disconnect all {@link Connection}s.
         */
        _this._disconnectAll = function () {
            var connections = _this.connections.splice(0);
            connections.forEach(function (conn) { return conn.disconnect(); });
            if (_this._activeConnection) {
                _this._activeConnection.disconnect();
            }
        };
        /**
         * Called when a 'close' event is received from the signaling stream.
         */
        _this._onSignalingClose = function () {
            _this.stream = null;
        };
        /**
         * Called when a 'connected' event is received from the signaling stream.
         */
        _this._onSignalingConnected = function (payload) {
            var region = regions_1.getRegionShortcode(payload.region);
            _this._edge = regions_1.regionToEdge[region] || payload.region;
            _this._region = region || payload.region;
            _this._sendPresence();
        };
        /**
         * Called when an 'error' event is received from the signaling stream.
         */
        _this._onSignalingError = function (payload) {
            if (!payload.error) {
                return;
            }
            var error = __assign({}, payload.error);
            var sid = payload.callsid;
            if (sid) {
                error.connection = _this._findConnection(sid);
            }
            if (error.code === 31201) {
                error.twilioError = new errors_1.AuthorizationErrors.AuthenticationFailed();
            }
            else if (error.code === 31204) {
                error.twilioError = new errors_1.AuthorizationErrors.AccessTokenInvalid();
            }
            else if (error.code === 31205) {
                // Stop trying to register presence after token expires
                _this._stopRegistrationTimer();
                error.twilioError = new errors_1.AuthorizationErrors.AccessTokenExpired();
            }
            else if (!error.twilioError) {
                error.twilioError = new errors_1.GeneralErrors.UnknownError();
            }
            _this._log.info('Received error: ', error);
            _this.emit('error', error);
        };
        /**
         * Called when an 'invite' event is received from the signaling stream.
         */
        _this._onSignalingInvite = function (payload) {
            var wasBusy = !!_this._activeConnection;
            if (wasBusy && !_this.options.allowIncomingWhileBusy) {
                _this._log.info('Device busy; ignoring incoming invite');
                return;
            }
            if (!payload.callsid || !payload.sdp) {
                _this.emit('error', { message: 'Malformed invite from gateway', twilioError: new errors_1.ClientErrors.BadRequest() });
                return;
            }
            var callParameters = payload.parameters || {};
            callParameters.CallSid = callParameters.CallSid || payload.callsid;
            var customParameters = Object.assign({}, util_1.queryToJson(callParameters.Params));
            var connection = _this._makeConnection(customParameters, {
                callParameters: callParameters,
                offerSdp: payload.sdp,
            });
            _this.connections.push(connection);
            connection.once('accept', function () {
                _this.soundcache.get(Device.SoundName.Incoming).stop();
                _this._publishNetworkChange();
            });
            var play = (_this._enabledSounds.incoming && !wasBusy)
                ? function () { return _this.soundcache.get(Device.SoundName.Incoming).play(); }
                : function () { return Promise.resolve(); };
            _this._showIncomingConnection(connection, play);
        };
        /**
         * Called when an 'offline' event is received from the signaling stream.
         */
        _this._onSignalingOffline = function () {
            _this._log.info('Stream is offline');
            _this._status = Device.Status.Offline;
            _this._edge = null;
            _this._region = null;
            _this.emit('offline', _this);
        };
        /**
         * Called when a 'ready' event is received from the signaling stream.
         */
        _this._onSignalingReady = function () {
            _this._log.info('Stream is ready');
            _this._status = Device.Status.Ready;
            _this.emit('ready', _this);
        };
        /**
         * Publish a NetworkInformation#change event to Insights if there's an active {@link Connection}.
         */
        _this._publishNetworkChange = function () {
            if (!_this._activeConnection) {
                return;
            }
            if (_this._networkInformation) {
                _this._publisher.info('network-information', 'network-change', {
                    connection_type: _this._networkInformation.type,
                    downlink: _this._networkInformation.downlink,
                    downlinkMax: _this._networkInformation.downlinkMax,
                    effective_type: _this._networkInformation.effectiveType,
                    rtt: _this._networkInformation.rtt,
                }, _this._activeConnection);
            }
        };
        /**
         * Update the input stream being used for calls so that any current call and all future calls
         * will use the new input stream.
         * @param inputStream
         */
        _this._updateInputStream = function (inputStream) {
            var connection = _this._activeConnection;
            if (connection && !inputStream) {
                return Promise.reject(new errors_1.InvalidStateError('Cannot unset input device while a call is in progress.'));
            }
            _this._connectionInputStream = inputStream;
            return connection
                ? connection._setInputTracksFromStream(inputStream)
                : Promise.resolve();
        };
        /**
         * Update the device IDs of output devices being used to play sounds through.
         * @param type - Whether to update ringtone or speaker sounds
         * @param sinkIds - An array of device IDs
         */
        _this._updateSinkIds = function (type, sinkIds) {
            var promise = type === 'ringtone'
                ? _this._updateRingtoneSinkIds(sinkIds)
                : _this._updateSpeakerSinkIds(sinkIds);
            return promise.then(function () {
                _this._publisher.info('audio', type + "-devices-set", {
                    audio_device_ids: sinkIds,
                }, _this._activeConnection);
            }, function (error) {
                _this._publisher.error('audio', type + "-devices-set-failed", {
                    audio_device_ids: sinkIds,
                    message: error.message,
                }, _this._activeConnection);
                throw error;
            });
        };
        if (window) {
            var root = window;
            var browser = root.msBrowser || root.browser || root.chrome;
            _this._isBrowserExtension = (!!browser && !!browser.runtime && !!browser.runtime.id)
                || (!!root.safari && !!root.safari.extension);
        }
        if (_this._isBrowserExtension) {
            _this._log.info('Running as browser extension.');
        }
        if (navigator) {
            var n = navigator;
            _this._networkInformation = n.connection
                || n.mozConnection
                || n.webkitConnection;
        }
        if (token) {
            _this.setup(token, options);
        }
        else if (options) {
            throw new errors_1.InvalidArgumentError('Cannot construct a Device with options but without a token');
        }
        return _this;
    }
    Object.defineProperty(Device, "audioContext", {
        /**
         * The AudioContext to be used by {@link Device} instances.
         * @private
         */
        get: function () {
            return Device._audioContext;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Device, "extension", {
        /**
         * Which sound file extension is supported.
         * @private
         */
        get: function () {
            // NOTE(mroberts): Node workaround.
            var a = typeof document !== 'undefined'
                ? document.createElement('audio') : { canPlayType: false };
            var canPlayMp3;
            try {
                canPlayMp3 = a.canPlayType && !!a.canPlayType('audio/mpeg').replace(/no/, '');
            }
            catch (e) {
                canPlayMp3 = false;
            }
            var canPlayVorbis;
            try {
                canPlayVorbis = a.canPlayType && !!a.canPlayType('audio/ogg;codecs=\'vorbis\'').replace(/no/, '');
            }
            catch (e) {
                canPlayVorbis = false;
            }
            return (canPlayVorbis && !canPlayMp3) ? 'ogg' : 'mp3';
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Device, "isSupported", {
        /**
         * Whether or not this SDK is supported by the current browser.
         */
        get: function () { return rtc.enabled(); },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Device, "packageName", {
        /**
         * Package name of the SDK.
         */
        get: function () { return C.PACKAGE_NAME; },
        enumerable: true,
        configurable: true
    });
    /**
     * Run some tests to identify issues, if any, prohibiting successful calling.
     * @param token - A Twilio JWT token string
     * @param options
     */
    Device.runPreflight = function (token, options) {
        return new preflight_1.PreflightTest(token, __assign({ audioContext: Device._getOrCreateAudioContext() }, options));
    };
    /**
     * String representation of {@link Device} class.
     * @private
     */
    Device.toString = function () {
        return '[Twilio.Device class]';
    };
    Object.defineProperty(Device, "version", {
        /**
         * Current SDK version.
         */
        get: function () { return C.RELEASE_VERSION; },
        enumerable: true,
        configurable: true
    });
    /**
     * Initializes the AudioContext instance shared across the Client SDK,
     * or returns the existing instance if one has already been initialized.
     */
    Device._getOrCreateAudioContext = function () {
        if (!Device._audioContext) {
            if (typeof AudioContext !== 'undefined') {
                Device._audioContext = new AudioContext();
            }
            else if (typeof webkitAudioContext !== 'undefined') {
                Device._audioContext = new webkitAudioContext();
            }
        }
        return Device._audioContext;
    };
    /**
     * Return the active {@link Connection}. Null or undefined for backward compatibility.
     */
    Device.prototype.activeConnection = function () {
        if (!this.isInitialized) {
            return null;
        }
        // @rrowland This should only return activeConnection, but customers have built around this
        // broken behavior and in order to not break their apps we are including this until
        // the next big release.
        return this._activeConnection || this.connections[0];
    };
    /**
     * @deprecated Set a handler for the cancel event.
     * @param handler
     */
    Device.prototype.cancel = function (handler) {
        return this._addHandler(Device.EventName.Cancel, handler);
    };
    Device.prototype.connect = function (paramsOrHandler, audioConstraints, rtcConfiguration) {
        if (typeof paramsOrHandler === 'function') {
            this._addHandler(Device.EventName.Connect, paramsOrHandler);
            return null;
        }
        this._throwUnlessSetup('connect');
        if (this._activeConnection) {
            throw new errors_1.InvalidStateError('A Connection is already active');
        }
        var params = paramsOrHandler || {};
        audioConstraints = audioConstraints || this.options && this.options.audioConstraints || {};
        rtcConfiguration = rtcConfiguration || this.options.rtcConfiguration;
        var connection = this._activeConnection = this._makeConnection(params, { rtcConfiguration: rtcConfiguration });
        // Make sure any incoming connections are ignored
        this.connections.splice(0).forEach(function (conn) { return conn.ignore(); });
        // Stop the incoming sound if it's playing
        this.soundcache.get(Device.SoundName.Incoming).stop();
        connection.accept(audioConstraints);
        this._publishNetworkChange();
        return connection;
    };
    /**
     * Set a handler for the disconnect event.
     * @deprecated Use {@link Device.on}.
     * @param handler
     */
    Device.prototype.disconnect = function (handler) {
        return this._addHandler(Device.EventName.Disconnect, handler);
    };
    /**
     * Disconnect all {@link Connection}s.
     */
    Device.prototype.disconnectAll = function () {
        this._throwUnlessSetup('disconnectAll');
        this._disconnectAll();
    };
    Object.defineProperty(Device.prototype, "edge", {
        /**
         * Returns the {@link Edge} value the {@link Device} is currently connected
         * to. The value will be `null` when the {@link Device} is offline.
         */
        get: function () {
            return this._edge;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Set a handler for the error event.
     * @deprecated Use {@link Device.on}.
     * @param handler
     */
    Device.prototype.error = function (handler) {
        return this._addHandler(Device.EventName.Error, handler);
    };
    /**
     * Set a handler for the incoming event.
     * @deprecated Use {@link Device.on}.
     * @param handler
     */
    Device.prototype.incoming = function (handler) {
        return this._addHandler(Device.EventName.Incoming, handler);
    };
    /**
     * Set a handler for the offline event.
     * @deprecated Use {@link Device.on}.
     * @param handler
     */
    Device.prototype.offline = function (handler) {
        return this._addHandler(Device.EventName.Offline, handler);
    };
    /**
     * Set a handler for the ready event.
     * @deprecated Use {@link Device.on}.
     * @param handler
     */
    Device.prototype.ready = function (handler) {
        return this._addHandler(Device.EventName.Ready, handler);
    };
    /**
     * Get the {@link Region} string the {@link Device} is currently connected to, or 'offline'
     * if not connected.
     */
    Device.prototype.region = function () {
        this._log.warn('`Device.region` is deprecated and will be removed in the next major ' +
            'release. Please use `Device.edge` instead.');
        this._throwUnlessSetup('region');
        return typeof this._region === 'string' ? this._region : 'offline';
    };
    /**
     * Register to receive incoming calls. Does not need to be called unless {@link Device.unregisterPresence}
     * has been called directly.
     */
    Device.prototype.registerPresence = function () {
        this._throwUnlessSetup('registerPresence');
        this.mediaPresence.audio = true;
        this._sendPresence();
        return this;
    };
    /**
     * Remove an event listener
     * @param event - The event name to stop listening for
     * @param listener - The callback to remove
     */
    Device.prototype.removeListener = function (event, listener) {
        events_1.EventEmitter.prototype.removeListener.call(this, event, listener);
        return this;
    };
    /**
     * Initialize the {@link Device}.
     * @param token - A Twilio JWT token string granting this {@link Device} access.
     * @param [options]
     */
    Device.prototype.setup = function (token, options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        if (util_1.isLegacyEdge()) {
            throw new errors_1.NotSupportedError('Microsoft Edge Legacy (https://support.microsoft.com/en-us/help/4533505/what-is-microsoft-edge-legacy) ' +
                'is deprecated and will not be able to connect to Twilio to make or receive calls after September 1st, 2020. ' +
                'Please see this documentation for a list of supported browsers ' +
                'https://www.twilio.com/docs/voice/client/javascript#supported-browsers');
        }
        if (!Device.isSupported && !options.ignoreBrowserSupport) {
            if (window && window.location && window.location.protocol === 'http:') {
                throw new errors_1.NotSupportedError("twilio.js wasn't able to find WebRTC browser support.           This is most likely because this page is served over http rather than https,           which does not support WebRTC in many browsers. Please load this page over https and           try again.");
            }
            throw new errors_1.NotSupportedError("twilio.js 1.3+ SDKs require WebRTC browser support.         For more information, see <https://www.twilio.com/docs/api/client/twilio-js>.         If you have any questions about this announcement, please contact         Twilio Support at <help@twilio.com>.");
        }
        if (!token) {
            throw new errors_1.InvalidArgumentError('Token is required for Device.setup()');
        }
        Object.assign(this.options, options);
        this._log.setDefaultLevel(this.options.debug
            ? log_1.default.levels.DEBUG
            : this.options.warnings
                ? log_1.default.levels.WARN
                : log_1.default.levels.SILENT);
        this._chunderURIs = this.options.chunderw
            ? ["wss://" + this.options.chunderw + "/signal"]
            : regions_1.getChunderURIs(this.options.edge, this.options.region, this._log.warn.bind(this._log)).map(function (uri) { return "wss://" + uri + "/signal"; });
        if (typeof Device._isUnifiedPlanDefault === 'undefined') {
            Device._isUnifiedPlanDefault = typeof window !== 'undefined'
                && typeof RTCPeerConnection !== 'undefined'
                && typeof RTCRtpTransceiver !== 'undefined'
                ? util_1.isUnifiedPlanDefault(window, window.navigator, RTCPeerConnection, RTCRtpTransceiver)
                : false;
        }
        Device._getOrCreateAudioContext();
        if (Device._audioContext && options.fakeLocalDTMF) {
            if (!Device._dialtonePlayer) {
                Device._dialtonePlayer = new dialtonePlayer_1.default(Device._audioContext);
            }
        }
        else if (Device._dialtonePlayer) {
            Device._dialtonePlayer.cleanup();
            delete Device._dialtonePlayer;
        }
        if (this.isInitialized) {
            this._log.info('Found existing Device; using new token but ignoring options');
            this.updateToken(token);
            return this;
        }
        this.isInitialized = true;
        if (this.options.dscp) {
            this.options.rtcConstraints.optional = [{ googDscp: true }];
        }
        var getOrSetSound = function (key, value) {
            if (!hasBeenWarnedSounds) {
                _this._log.warn('Device.sounds is deprecated and will be removed in the next breaking ' +
                    'release. Please use the new functionality available on Device.audio.');
                hasBeenWarnedSounds = true;
            }
            if (typeof value !== 'undefined') {
                _this._enabledSounds[key] = value;
            }
            return _this._enabledSounds[key];
        };
        [Device.SoundName.Disconnect, Device.SoundName.Incoming, Device.SoundName.Outgoing]
            .forEach(function (eventName) {
            _this.sounds[eventName] = getOrSetSound.bind(null, eventName);
        });
        var defaultSounds = {
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
        for (var _i = 0, _a = Object.keys(defaultSounds); _i < _a.length; _i++) {
            var name_1 = _a[_i];
            var soundDef = defaultSounds[name_1];
            var defaultUrl = C.SOUNDS_BASE_URL + "/" + soundDef.filename + "." + Device.extension
                + ("?cache=" + C.RELEASE_VERSION);
            var soundUrl = this.options.sounds && this.options.sounds[name_1] || defaultUrl;
            var sound = new this.options.soundFactory(name_1, soundUrl, {
                audioContext: this.options.disableAudioContextSounds ? null : Device.audioContext,
                maxDuration: soundDef.maxDuration,
                shouldLoop: soundDef.shouldLoop,
            });
            this.soundcache.set(name_1, sound);
        }
        this._publisher = (this.options.Publisher || Publisher)('twilio-js-sdk', token, {
            defaultPayload: this._createDefaultPayload,
            host: this.options.eventgw,
            metadata: {
                app_name: this.options.appName,
                app_version: this.options.appVersion,
            },
        });
        if (this.options.publishEvents === false) {
            this._publisher.disable();
        }
        else {
            this._publisher.on('error', function (error) {
                _this._log.warn('Cannot connect to insights.', error);
            });
        }
        if (this._networkInformation && typeof this._networkInformation.addEventListener === 'function') {
            this._networkInformation.addEventListener('change', this._publishNetworkChange);
        }
        this.audio = new (this.options.AudioHelper || audiohelper_1.default)(this._updateSinkIds, this._updateInputStream, getUserMedia, {
            audioContext: Device.audioContext,
            enabledSounds: this._enabledSounds,
        });
        this.audio.on('deviceChange', function (lostActiveDevices) {
            var activeConnection = _this._activeConnection;
            var deviceIds = lostActiveDevices.map(function (device) { return device.deviceId; });
            _this._publisher.info('audio', 'device-change', {
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
            window.addEventListener('unload', this.destroy);
            window.addEventListener('pagehide', this.destroy);
            if (this.options.closeProtection) {
                window.addEventListener('beforeunload', this._confirmClose);
            }
        }
        // (rrowland) This maintains backward compatibility, but we should look at
        // removing this next breaking change. Any error should be caught by the
        // customer, and anything that's not a fatal error should not be emitted
        // via error event.
        this.on(Device.EventName.Error, function () {
            if (_this.listenerCount('error') > 1) {
                return;
            }
            _this._log.info('Uncaught error event suppressed.');
        });
        return this;
    };
    /**
     * Get the status of this {@link Device} instance
     */
    Device.prototype.status = function () {
        this._throwUnlessSetup('status');
        return this._activeConnection ? Device.Status.Busy : this._status;
    };
    /**
     * String representation of {@link Device} instance.
     * @private
     */
    Device.prototype.toString = function () {
        return '[Twilio.Device instance]';
    };
    /**
     * Unregister to receiving incoming calls.
     */
    Device.prototype.unregisterPresence = function () {
        this._throwUnlessSetup('unregisterPresence');
        this.mediaPresence.audio = false;
        this._sendPresence();
        return this;
    };
    /**
     * Update the token and re-register.
     * @param token - The new token JWT string to register with.
     */
    Device.prototype.updateToken = function (token) {
        this._throwUnlessSetup('updateToken');
        this.token = token;
        this.register(token);
    };
    /**
     * Add a handler for an EventEmitter and emit a deprecation warning on first call.
     * @param eventName - Name of the event
     * @param handler - A handler to call when the event is emitted
     */
    Device.prototype._addHandler = function (eventName, handler) {
        if (!hasBeenWarnedHandlers) {
            this._log.warn("Device callback handlers (connect, error, offline, incoming, cancel, ready, disconnect)         have been deprecated and will be removed in the next breaking release. Instead, the EventEmitter         interface can be used to set event listeners. Example: device.on('" + eventName + "', handler)");
            hasBeenWarnedHandlers = true;
        }
        this.addListener(eventName, handler);
        return this;
    };
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
    Device.prototype._asyncEmit = function (event) {
        var _this = this;
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        setTimeout(function () { return _this.emit.apply(_this, __spreadArrays([event], args)); });
    };
    /**
     * Find a {@link Connection} by its CallSid.
     * @param callSid
     */
    Device.prototype._findConnection = function (callSid) {
        return this.connections.find(function (conn) { return conn.parameters.CallSid === callSid
            || conn.outboundConnectionId === callSid; }) || null;
    };
    /**
     * Create a new {@link Connection}.
     * @param twimlParams - A flat object containing key:value pairs to be sent to the TwiML app.
     * @param [options] - Options to be used to instantiate the {@link Connection}.
     */
    Device.prototype._makeConnection = function (twimlParams, options) {
        var _this = this;
        if (typeof Device._isUnifiedPlanDefault === 'undefined') {
            throw new errors_1.InvalidStateError('Device has not been initialized.');
        }
        var config = {
            audioHelper: this.audio,
            getUserMedia: getUserMedia,
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
            beforeAccept: function (conn) {
                if (!_this._activeConnection || _this._activeConnection === conn) {
                    return;
                }
                _this._activeConnection.disconnect();
                _this._removeConnection(_this._activeConnection);
            },
            codecPreferences: this.options.codecPreferences,
            dialtonePlayer: Device._dialtonePlayer,
            dscp: this.options.dscp,
            enableIceRestart: this.options.enableIceRestart,
            enableRingingState: this.options.enableRingingState,
            forceAggressiveIceNomination: this.options.forceAggressiveIceNomination,
            getInputStream: function () { return _this.options.fileInputStream || _this._connectionInputStream; },
            getSinkIds: function () { return _this._connectionSinkIds; },
            maxAverageBitrate: this.options.maxAverageBitrate,
            preflight: this.options.preflight,
            rtcConfiguration: this.options.rtcConfiguration || { iceServers: this.options.iceServers },
            rtcConstraints: this.options.rtcConstraints,
            shouldPlayDisconnect: function () { return _this._enabledSounds.disconnect; },
            twimlParams: twimlParams,
        }, options);
        var connection = new this.options.connectionFactory(config, options);
        connection.once('accept', function () {
            _this._removeConnection(connection);
            _this._activeConnection = connection;
            if (_this.audio) {
                _this.audio._maybeStartPollingVolume();
            }
            if (connection.direction === connection_1.default.CallDirection.Outgoing && _this._enabledSounds.outgoing) {
                _this.soundcache.get(Device.SoundName.Outgoing).play();
            }
            var data = { edge: _this._edge || _this._region };
            var selectedEdge = _this.options.edge;
            if (selectedEdge) {
                data['selected_edge'] = Array.isArray(selectedEdge) ? selectedEdge : [selectedEdge];
            }
            _this._publisher.info('settings', 'edge', data, connection);
            _this._asyncEmit('connect', connection);
        });
        connection.addListener('error', function (error) {
            if (connection.status() === 'closed') {
                _this._removeConnection(connection);
            }
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._maybeStopIncomingSound();
            _this._asyncEmit('error', error);
        });
        connection.once('cancel', function () {
            _this._log.info("Canceled: " + connection.parameters.CallSid);
            _this._removeConnection(connection);
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._maybeStopIncomingSound();
            _this._asyncEmit('cancel', connection);
        });
        connection.once('disconnect', function () {
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._removeConnection(connection);
            _this._asyncEmit('disconnect', connection);
        });
        connection.once('reject', function () {
            _this._log.info("Rejected: " + connection.parameters.CallSid);
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._removeConnection(connection);
            _this._maybeStopIncomingSound();
        });
        connection.once('transportClose', function () {
            if (connection.status() !== connection_1.default.State.Pending) {
                return;
            }
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._removeConnection(connection);
            _this._maybeStopIncomingSound();
        });
        return connection;
    };
    /**
     * Stop the incoming sound if no {@link Connection}s remain.
     */
    Device.prototype._maybeStopIncomingSound = function () {
        if (!this.connections.length) {
            this.soundcache.get(Device.SoundName.Incoming).stop();
        }
    };
    /**
     * Remove a {@link Connection} from device.connections by reference
     * @param connection
     */
    Device.prototype._removeConnection = function (connection) {
        if (this._activeConnection === connection) {
            this._activeConnection = null;
        }
        for (var i = this.connections.length - 1; i >= 0; i--) {
            if (connection === this.connections[i]) {
                this.connections.splice(i, 1);
            }
        }
    };
    /**
     * Register with the signaling server.
     */
    Device.prototype._sendPresence = function () {
        if (!this.stream) {
            return;
        }
        this.stream.register({ audio: this.mediaPresence.audio });
        if (this.mediaPresence.audio) {
            this._startRegistrationTimer();
        }
        else {
            this._stopRegistrationTimer();
        }
    };
    /**
     * Set up the connection to the signaling server.
     * @param token
     */
    Device.prototype._setupStream = function (token) {
        this._log.info('Setting up VSP');
        this.stream = this.options.pStreamFactory(token, this._chunderURIs, {
            backoffMaxMs: this.options.backoffMaxMs,
        });
        this.stream.addListener('close', this._onSignalingClose);
        this.stream.addListener('connected', this._onSignalingConnected);
        this.stream.addListener('error', this._onSignalingError);
        this.stream.addListener('invite', this._onSignalingInvite);
        this.stream.addListener('offline', this._onSignalingOffline);
        this.stream.addListener('ready', this._onSignalingReady);
    };
    /**
     * Start playing the incoming ringtone, and subsequently emit the incoming event.
     * @param connection
     * @param play - The function to be used to play the sound. Must return a Promise.
     */
    Device.prototype._showIncomingConnection = function (connection, play) {
        var _this = this;
        var timeout;
        return Promise.race([
            play(),
            new Promise(function (resolve, reject) {
                timeout = setTimeout(function () {
                    var msg = 'Playing incoming ringtone took too long; it might not play. Continuing execution...';
                    reject(new Error(msg));
                }, RINGTONE_PLAY_TIMEOUT);
            }),
        ]).catch(function (reason) {
            _this._log.info(reason.message);
        }).then(function () {
            clearTimeout(timeout);
            _this.emit('incoming', connection);
        });
    };
    /**
     * Set a timeout to send another register message to the signaling server.
     */
    Device.prototype._startRegistrationTimer = function () {
        var _this = this;
        this._stopRegistrationTimer();
        this.regTimer = setTimeout(function () {
            _this._sendPresence();
        }, REGISTRATION_INTERVAL);
    };
    /**
     * Stop sending registration messages to the signaling server.
     */
    Device.prototype._stopRegistrationTimer = function () {
        if (this.regTimer) {
            clearTimeout(this.regTimer);
        }
    };
    /**
     * Throw an Error if Device.setup has not been called for this instance.
     * @param methodName - The name of the method being called before setup()
     */
    Device.prototype._throwUnlessSetup = function (methodName) {
        if (!this.isInitialized) {
            throw new errors_1.InvalidStateError("Call Device.setup() before " + methodName);
        }
    };
    /**
     * Update the device IDs of output devices being used to play the incoming ringtone through.
     * @param sinkIds - An array of device IDs
     */
    Device.prototype._updateRingtoneSinkIds = function (sinkIds) {
        return Promise.resolve(this.soundcache.get(Device.SoundName.Incoming).setSinkIds(sinkIds));
    };
    /**
     * Update the device IDs of output devices being used to play the non-ringtone sounds
     * and Call audio through.
     * @param sinkIds - An array of device IDs
     */
    Device.prototype._updateSpeakerSinkIds = function (sinkIds) {
        Array.from(this.soundcache.entries())
            .filter(function (entry) { return entry[0] !== Device.SoundName.Incoming; })
            .forEach(function (entry) { return entry[1].setSinkIds(sinkIds); });
        this._connectionSinkIds = sinkIds;
        var connection = this._activeConnection;
        return connection
            ? connection._setSinkIds(sinkIds)
            : Promise.resolve();
    };
    /**
     * Register the {@link Device}
     * @param token
     */
    Device.prototype.register = function (token) {
        if (this.stream) {
            this.stream.setToken(token);
            this._publisher.setToken(token);
        }
        else {
            this._setupStream(token);
        }
    };
    return Device;
}(events_1.EventEmitter));
(function (Device) {
    /**
     * All valid {@link Device} event names.
     */
    var EventName;
    (function (EventName) {
        EventName["Cancel"] = "cancel";
        EventName["Connect"] = "connect";
        EventName["Disconnect"] = "disconnect";
        EventName["Error"] = "error";
        EventName["Incoming"] = "incoming";
        EventName["Offline"] = "offline";
        EventName["Ready"] = "ready";
    })(EventName = Device.EventName || (Device.EventName = {}));
    /**
     * All possible {@link Device} statuses.
     */
    var Status;
    (function (Status) {
        Status["Busy"] = "busy";
        Status["Offline"] = "offline";
        Status["Ready"] = "ready";
    })(Status = Device.Status || (Device.Status = {}));
    /**
     * Names of all sounds handled by the {@link Device}.
     */
    var SoundName;
    (function (SoundName) {
        SoundName["Incoming"] = "incoming";
        SoundName["Outgoing"] = "outgoing";
        SoundName["Disconnect"] = "disconnect";
        SoundName["Dtmf0"] = "dtmf0";
        SoundName["Dtmf1"] = "dtmf1";
        SoundName["Dtmf2"] = "dtmf2";
        SoundName["Dtmf3"] = "dtmf3";
        SoundName["Dtmf4"] = "dtmf4";
        SoundName["Dtmf5"] = "dtmf5";
        SoundName["Dtmf6"] = "dtmf6";
        SoundName["Dtmf7"] = "dtmf7";
        SoundName["Dtmf8"] = "dtmf8";
        SoundName["Dtmf9"] = "dtmf9";
        SoundName["DtmfS"] = "dtmfs";
        SoundName["DtmfH"] = "dtmfh";
    })(SoundName = Device.SoundName || (Device.SoundName = {}));
})(Device || (Device = {}));
exports.default = Device;
//# sourceMappingURL=device.js.map