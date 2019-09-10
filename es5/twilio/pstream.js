var C = require('./constants');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var log = require('./log');
var WSTransport = require('./wstransport').default;
var _a = require('./errors'), GeneralErrors = _a.GeneralErrors, SignalingErrors = _a.SignalingErrors;
var PSTREAM_VERSION = '1.5';
/**
 * Constructor for PStream objects.
 *
 * @exports PStream as Twilio.PStream
 * @memberOf Twilio
 * @borrows EventEmitter#addListener as #addListener
 * @borrows EventEmitter#removeListener as #removeListener
 * @borrows EventEmitter#emit as #emit
 * @borrows EventEmitter#hasListener as #hasListener
 * @constructor
 * @param {string} token The Twilio capabilities JWT
 * @param {string} uri The PStream endpoint URI
 * @param {object} [options]
 * @config {boolean} [options.backoffMaxMs=20000] Enable debugging
 * @config {boolean} [options.debug=false] Enable debugging
 */
function PStream(token, uri, options) {
    if (!(this instanceof PStream)) {
        return new PStream(token, uri, options);
    }
    var defaults = {
        logPrefix: '[PStream]',
        TransportFactory: WSTransport,
        debug: false
    };
    options = options || {};
    for (var prop in defaults) {
        if (prop in options)
            continue;
        options[prop] = defaults[prop];
    }
    this.options = options;
    this.token = token || '';
    this.status = 'disconnected';
    this.uri = uri;
    this.gateway = null;
    this.region = null;
    this._messageQueue = [];
    this._handleTransportClose = this._handleTransportClose.bind(this);
    this._handleTransportError = this._handleTransportError.bind(this);
    this._handleTransportMessage = this._handleTransportMessage.bind(this);
    this._handleTransportOpen = this._handleTransportOpen.bind(this);
    log.mixinLog(this, this.options.logPrefix);
    this.log.enabled = this.options.debug;
    // NOTE(mroberts): EventEmitter requires that we catch all errors.
    this.on('error', function () { });
    /*
     *events used by device
     *'invite',
     *'ready',
     *'error',
     *'offline',
     *
     *'cancel',
     *'presence',
     *'roster',
     *'answer',
     *'candidate',
     *'hangup'
     */
    var self = this;
    this.addListener('ready', function () {
        self.status = 'ready';
    });
    this.addListener('offline', function () {
        self.status = 'offline';
    });
    this.addListener('close', function () {
        self.log('Received "close" from server. Destroying PStream...');
        self._destroy();
    });
    this.transport = new this.options.TransportFactory(this.uri, {
        backoffMaxMs: this.options.backoffMaxMs,
        logLevel: this.options.debug ? 'debug' : 'off'
    });
    this.transport.on('close', this._handleTransportClose);
    this.transport.on('error', this._handleTransportError);
    this.transport.on('message', this._handleTransportMessage);
    this.transport.on('open', this._handleTransportOpen);
    this.transport.open();
    return this;
}
util.inherits(PStream, EventEmitter);
PStream.prototype._handleTransportClose = function () {
    this.emit('transportClose');
    if (this.status !== 'disconnected') {
        if (this.status !== 'offline') {
            this.emit('offline', this);
        }
        this.status = 'disconnected';
    }
};
PStream.prototype._handleTransportError = function (error) {
    if (!error) {
        this.emit('error', { error: {
                code: 31000,
                message: 'Websocket closed without a provided reason',
                twilioError: new SignalingErrors.ConnectionDisconnected(),
            } });
        return;
    }
    // We receive some errors without call metadata (just the error). We need to convert these
    // to be contained within the 'error' field so that these errors match the expected format.
    this.emit('error', typeof error.code !== 'undefined' ? { error: error } : error);
};
PStream.prototype._handleTransportMessage = function (msg) {
    if (!msg || !msg.data || typeof msg.data !== 'string') {
        return;
    }
    var _a = JSON.parse(msg.data), type = _a.type, _b = _a.payload, payload = _b === void 0 ? {} : _b;
    this.gateway = payload.gateway || this.gateway;
    this.region = payload.region || this.region;
    if (type === 'error' && payload.error) {
        payload.error.twilioError = new SignalingErrors.ConnectionError();
    }
    this.emit(type, payload);
};
PStream.prototype._handleTransportOpen = function () {
    var _this = this;
    this.status = 'connected';
    this.setToken(this.token);
    var messages = this._messageQueue.splice(0, this._messageQueue.length);
    messages.forEach(function (message) { return _this._publish.apply(_this, message); });
};
/**
 * @return {string}
 */
PStream.toString = function () { return '[Twilio.PStream class]'; };
PStream.prototype.toString = function () { return '[Twilio.PStream instance]'; };
PStream.prototype.setToken = function (token) {
    this.log('Setting token and publishing listen');
    this.token = token;
    var payload = {
        token: token,
        browserinfo: getBrowserInfo()
    };
    this._publish('listen', payload);
};
PStream.prototype.register = function (mediaCapabilities) {
    var regPayload = {
        media: mediaCapabilities
    };
    this._publish('register', regPayload, true);
};
PStream.prototype.reinvite = function (sdp, callsid) {
    this._publish('reinvite', { sdp: sdp, callsid: callsid }, false);
};
PStream.prototype._destroy = function () {
    this.transport.removeListener('close', this._handleTransportClose);
    this.transport.removeListener('error', this._handleTransportError);
    this.transport.removeListener('message', this._handleTransportMessage);
    this.transport.removeListener('open', this._handleTransportOpen);
    this.transport.close();
    this.emit('offline', this);
};
PStream.prototype.destroy = function () {
    this.log('PStream.destroy() called...');
    this._destroy();
    return this;
};
PStream.prototype.publish = function (type, payload) {
    return this._publish(type, payload, true);
};
PStream.prototype._publish = function (type, payload, shouldRetry) {
    var msg = JSON.stringify({
        type: type,
        version: PSTREAM_VERSION,
        payload: payload
    });
    var isSent = !!this.transport.send(msg);
    if (!isSent) {
        this.emit('error', { error: {
                code: 31009,
                message: 'No transport available to send or receive messages',
                twilioError: new GeneralErrors.TransportError(),
            } });
        if (shouldRetry) {
            this._messageQueue.push([type, payload, true]);
        }
    }
};
function getBrowserInfo() {
    var nav = typeof navigator !== 'undefined' ? navigator : {};
    var info = {
        p: 'browser',
        v: C.RELEASE_VERSION,
        browser: {
            userAgent: nav.userAgent || 'unknown',
            platform: nav.platform || 'unknown'
        },
        plugin: 'rtc'
    };
    return info;
}
exports.PStream = PStream;
//# sourceMappingURL=pstream.js.map