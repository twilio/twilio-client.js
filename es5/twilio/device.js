"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module Voice
 * @preferred
 * @publicapi
 */
var events_1 = require("events");
var audiohelper_1 = require("./audiohelper");
var connection_1 = require("./connection");
var dialtonePlayer_1 = require("./dialtonePlayer");
var pstream_1 = require("./pstream");
var regions_1 = require("./regions");
var tslog_1 = require("./tslog");
var util_1 = require("./util");
var C = require('./constants');
var Publisher = require('./eventpublisher');
var rtc = require('./rtc');
var getUserMedia = require('./rtc/getusermedia');
var Sound = require('./sound');
var isUnifiedPlanDefault = require('./util').isUnifiedPlanDefault;
/**
 * @private
 */
var networkInformation = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection;
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
         * An audio input MediaStream to pass to new {@link Connection} instances.
         */
        _this._connectionInputStream = null;
        /**
         * An array of {@link Device} IDs to be used to play sounds through, to be passed to
         * new {@link Connection} instances.
         */
        _this._connectionSinkIds = ['default'];
        /**
         * Whether each sound is enabled.
         */
        _this._enabledSounds = (_a = {},
            _a[Device.SoundName.Disconnect] = true,
            _a[Device.SoundName.Incoming] = true,
            _a[Device.SoundName.Outgoing] = true,
            _a);
        /**
         * An instance of Log to use.
         */
        _this._log = new tslog_1.default(tslog_1.LogLevel.Off);
        /**
         * The current LogLevel
         */
        _this._logLevel = tslog_1.LogLevel.Off;
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
            eventgw: 'eventgw.twilio.com',
            iceServers: [],
            noRegister: false,
            pStreamFactory: pstream_1.PStream,
            region: regions_1.Region.Gll,
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
                dscp: !!_this.options.dscp,
                platform: rtc.getMediaEngine(),
                sdk_version: C.RELEASE_VERSION,
                selected_region: _this.options.region,
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
            var stream = _this.stream;
            if (stream) {
                setIfDefined('gateway', stream.gateway);
                setIfDefined('region', stream.region);
            }
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
            _this._region = regions_1.getRegionShortcode(payload.region) || payload.region;
            _this._sendPresence();
        };
        /**
         * Called when an 'error' event is received from the signaling stream.
         */
        _this._onSignalingError = function (payload) {
            var error = payload.error;
            if (!error) {
                return;
            }
            var sid = payload.callsid;
            if (sid) {
                error.connection = _this._findConnection(sid);
            }
            // Stop trying to register presence after token expires
            if (error.code === 31205) {
                _this._stopRegistrationTimer();
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
                _this.emit('error', { message: 'Malformed invite from gateway' });
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
            if (networkInformation) {
                _this._publisher.info('network-information', 'network-change', {
                    connection_type: networkInformation.type,
                    downlink: networkInformation.downlink,
                    downlinkMax: networkInformation.downlinkMax,
                    effective_type: networkInformation.effectiveType,
                    rtt: networkInformation.rtt,
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
                return Promise.reject(new Error('Cannot unset input device while a call is in progress.'));
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
        if (token) {
            _this.setup(token, options);
        }
        else if (options) {
            throw new Error('Cannot construct a Device with options but without a token');
        }
        return _this;
        var _a;
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
    /**
     * String representation of {@link Device} class.
     * @private
     */
    Device.toString = function () {
        return '[Twilio.Device class]';
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
    Device.prototype.connect = function (paramsOrHandler, audioConstraints) {
        if (typeof paramsOrHandler === 'function') {
            this._addHandler(Device.EventName.Connect, paramsOrHandler);
            return null;
        }
        this._throwUnlessSetup('connect');
        if (this._activeConnection) {
            throw new Error('A Connection is already active');
        }
        var params = paramsOrHandler || {};
        audioConstraints = audioConstraints || this.options && this.options.audioConstraints || {};
        var connection = this._activeConnection = this._makeConnection(params);
        // Make sure any incoming connections are ignored
        this.connections.splice(0).forEach(function (conn) { return conn.ignore(); });
        // Stop the incoming sound if it's playing
        this.soundcache.get(Device.SoundName.Incoming).stop();
        connection.accept(audioConstraints);
        this._publishNetworkChange();
        return connection;
    };
    /**
     * Destroy the {@link Device}, freeing references to be garbage collected.
     */
    Device.prototype.destroy = function () {
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
        if (!Device.isSupported && !options.ignoreBrowserSupport) {
            throw new util_1.Exception("twilio.js 1.3+ SDKs require WebRTC/ORTC browser support.         For more information, see <https://www.twilio.com/docs/api/client/twilio-js>.         If you have any questions about this announcement, please contact         Twilio Support at <help@twilio.com>.");
        }
        if (!token) {
            throw new util_1.Exception('Token is required for Device.setup()');
        }
        if (!Device._audioContext) {
            if (typeof AudioContext !== 'undefined') {
                Device._audioContext = new AudioContext();
            }
            else if (typeof webkitAudioContext !== 'undefined') {
                Device._audioContext = new webkitAudioContext();
            }
        }
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
        Object.assign(this.options, options);
        if (this.options.dscp) {
            this.options.rtcConstraints.optional = [{ googDscp: true }];
        }
        this._logLevel = this.options.debug ? tslog_1.LogLevel.Debug
            : this.options.warnings ? tslog_1.LogLevel.Warn
                : tslog_1.LogLevel.Off;
        this._log = new (this.options.Log || tslog_1.default)(this._logLevel);
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
        var regionURI = regions_1.getRegionURI(this.options.region, function (newRegion) {
            _this._log.warn("Region " + _this.options.region + " is deprecated, please use " + newRegion + ".");
        });
        this.options.chunderw = "wss://" + (this.options.chunderw || regionURI) + "/signal";
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
            var defaultUrl = C.SOUNDS_BASE_URL + "/" + soundDef.filename + "." + Device.extension + "?cache=1_4_23";
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
        });
        if (this.options.publishEvents === false) {
            this._publisher.disable();
        }
        if (networkInformation) {
            networkInformation.addEventListener('change', this._publishNetworkChange);
        }
        this.audio = new (this.options.AudioHelper || audiohelper_1.default)(this._updateSinkIds, this._updateInputStream, getUserMedia, {
            audioContext: Device.audioContext,
            enabledSounds: this._enabledSounds,
            logLevel: this._logLevel,
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
            window.addEventListener('unload', this._disconnectAll);
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
            debug: this.options.debug,
            dialtonePlayer: Device._dialtonePlayer,
            dscp: this.options.dscp,
            enableRingingState: this.options.enableRingingState,
            getInputStream: function () { return _this._connectionInputStream; },
            getSinkIds: function () { return _this._connectionSinkIds; },
            rtcConfiguration: this.options.rtcConfiguration || { iceServers: this.options.iceServers },
            rtcConstraints: this.options.rtcConstraints,
            shouldPlayDisconnect: function () { return _this._enabledSounds.disconnect; },
            twimlParams: twimlParams,
            warnings: this.options.warnings,
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
            _this.emit('connect', connection);
        });
        connection.addListener('error', function (error) {
            if (connection.status() === 'closed') {
                _this._removeConnection(connection);
            }
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._maybeStopIncomingSound();
            _this.emit('error', error);
        });
        connection.once('cancel', function () {
            _this._log.info("Canceled: " + connection.parameters.CallSid);
            _this._removeConnection(connection);
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._maybeStopIncomingSound();
            _this.emit('cancel', connection);
        });
        connection.once('disconnect', function () {
            if (_this.audio) {
                _this.audio._maybeStopPollingVolume();
            }
            _this._removeConnection(connection);
            _this.emit('disconnect', connection);
        });
        connection.once('reject', function () {
            _this._log.info("Rejected: " + connection.parameters.CallSid);
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
        this.stream = this.options.pStreamFactory(token, this.options.chunderw, {
            backoffMaxMs: this.options.backoffMaxMs,
            debug: this.options.debug,
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
                    reject(new Error('Playing incoming ringtone took too long; it might not play. Continuing execution...'));
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
            throw new Error("Call Device.setup() before " + methodName);
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
    /**
     * Whether or not the browser uses unified-plan SDP by default.
     */
    Device._isUnifiedPlanDefault = typeof window !== 'undefined'
        && typeof RTCPeerConnection !== 'undefined'
        && typeof RTCRtpTransceiver !== 'undefined'
        ? isUnifiedPlanDefault(window, window.navigator, RTCPeerConnection, RTCRtpTransceiver)
        : false;
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