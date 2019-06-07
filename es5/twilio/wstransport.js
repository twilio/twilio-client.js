"use strict";
/**
 * @module Tools
 * @internalapi
 */
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
var events_1 = require("events");
var WebSocket = require("ws");
var tslog_1 = require("./tslog");
// tslint:disable-next-line
var Backoff = require('backoff');
var CONNECT_SUCCESS_TIMEOUT = 10000;
var CONNECT_TIMEOUT = 5000;
var HEARTBEAT_TIMEOUT = 15000;
/**
 * All possible states of WSTransport.
 */
var WSTransportState;
(function (WSTransportState) {
    /**
     * The WebSocket is not open but is trying to connect.
     */
    WSTransportState["Connecting"] = "connecting";
    /**
     * The WebSocket is not open and is not trying to connect.
     */
    WSTransportState["Closed"] = "closed";
    /**
     * The underlying WebSocket is open and active.
     */
    WSTransportState["Open"] = "open";
})(WSTransportState = exports.WSTransportState || (exports.WSTransportState = {}));
/**
 * WebSocket Transport
 */
var WSTransport = /** @class */ (function (_super) {
    __extends(WSTransport, _super);
    /**
     * @constructor
     * @param uri - The URI of the endpoint to connect to.
     * @param [options] - Constructor options.
     */
    function WSTransport(uri, options) {
        if (options === void 0) { options = {}; }
        var _this = _super.call(this) || this;
        /**
         * The current state of the WSTransport.
         */
        _this.state = WSTransportState.Closed;
        /**
         * Called in response to WebSocket#close event.
         */
        _this._onSocketClose = function () {
            _this._closeSocket();
        };
        /**
         * Called in response to WebSocket#error event.
         */
        _this._onSocketError = function (err) {
            _this._log.info("WebSocket received error: " + err.message);
            _this.emit('error', { code: 31000, message: err.message || 'WSTransport socket error' });
        };
        /**
         * Called in response to WebSocket#message event.
         */
        _this._onSocketMessage = function (message) {
            // Clear heartbeat timeout on any incoming message, as they
            // all indicate an active connection.
            _this._setHeartbeatTimeout();
            // Filter and respond to heartbeats
            if (_this._socket && message.data === '\n') {
                _this._socket.send('\n');
                return;
            }
            _this.emit('message', message);
        };
        /**
         * Called in response to WebSocket#open event.
         */
        _this._onSocketOpen = function () {
            _this._log.info('WebSocket opened successfully.');
            _this._timeOpened = Date.now();
            _this.state = WSTransportState.Open;
            clearTimeout(_this._connectTimeout);
            _this._setHeartbeatTimeout();
            _this.emit('open');
        };
        _this._backoff = Backoff.exponential({
            factor: 2.0,
            initialDelay: 100,
            maxDelay: typeof options.backoffMaxMs === 'number'
                ? Math.max(options.backoffMaxMs, 3000)
                : 20000,
            randomisationFactor: 0.40,
        });
        _this._log = new tslog_1.default(options.logLevel || tslog_1.LogLevel.Off);
        _this._uri = uri;
        _this._WebSocket = options.WebSocket || WebSocket;
        // Called when a backoff timer is started.
        _this._backoff.on('backoff', function (_, delay) {
            if (_this.state === WSTransportState.Closed) {
                return;
            }
            _this._log.info("Will attempt to reconnect WebSocket in " + delay + "ms");
        });
        // Called when a backoff timer ends. We want to try to reconnect
        // the WebSocket at this point.
        _this._backoff.on('ready', function (attempt) {
            if (_this.state === WSTransportState.Closed) {
                return;
            }
            _this._connect(attempt + 1);
        });
        return _this;
    }
    /**
     * Close the WebSocket, and don't try to reconnect.
     */
    WSTransport.prototype.close = function () {
        this._log.info('WSTransport.close() called...');
        this._close();
    };
    /**
     * Attempt to open a WebSocket connection.
     */
    WSTransport.prototype.open = function () {
        this._log.info('WSTransport.open() called...');
        if (this._socket &&
            (this._socket.readyState === WebSocket.CONNECTING ||
                this._socket.readyState === WebSocket.OPEN)) {
            this._log.info('WebSocket already open.');
            return;
        }
        this._connect();
    };
    /**
     * Send a message through the WebSocket connection.
     * @param message - A message to send to the endpoint.
     * @returns Whether the message was sent.
     */
    WSTransport.prototype.send = function (message) {
        // We can't send the message if the WebSocket isn't open
        if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        try {
            this._socket.send(message);
        }
        catch (e) {
            // Some unknown error occurred. Reset the socket to get a fresh session.
            this._log.info('Error while sending message:', e.message);
            this._closeSocket();
            return false;
        }
        return true;
    };
    /**
     * Close the WebSocket, and don't try to reconnect.
     */
    WSTransport.prototype._close = function () {
        this.state = WSTransportState.Closed;
        this._closeSocket();
    };
    /**
     * Close the WebSocket and remove all event listeners.
     */
    WSTransport.prototype._closeSocket = function () {
        clearTimeout(this._connectTimeout);
        clearTimeout(this._heartbeatTimeout);
        this._log.info('Closing and cleaning up WebSocket...');
        if (!this._socket) {
            this._log.info('No WebSocket to clean up.');
            return;
        }
        this._socket.removeEventListener('close', this._onSocketClose);
        this._socket.removeEventListener('error', this._onSocketError);
        this._socket.removeEventListener('message', this._onSocketMessage);
        this._socket.removeEventListener('open', this._onSocketOpen);
        if (this._socket.readyState === WebSocket.CONNECTING ||
            this._socket.readyState === WebSocket.OPEN) {
            this._socket.close();
        }
        // Reset backoff counter if connection was open for long enough to be considered successful
        if (this._timeOpened && Date.now() - this._timeOpened > CONNECT_SUCCESS_TIMEOUT) {
            this._backoff.reset();
        }
        this._backoff.backoff();
        delete this._socket;
        this.emit('close');
    };
    /**
     * Attempt to connect to the endpoint via WebSocket.
     * @param [retryCount] - Retry number, if this is a retry. Undefined if
     *   first attempt, 1+ if a retry.
     */
    WSTransport.prototype._connect = function (retryCount) {
        var _this = this;
        if (retryCount) {
            this._log.info("Attempting to reconnect (retry #" + retryCount + ")...");
        }
        else {
            this._log.info('Attempting to connect...');
        }
        this._closeSocket();
        this.state = WSTransportState.Connecting;
        var socket = null;
        try {
            socket = new this._WebSocket(this._uri);
        }
        catch (e) {
            this._log.info('Could not connect to endpoint:', e.message);
            this._close();
            this.emit('error', { code: 31000, message: e.message || "Could not connect to " + this._uri });
            return;
        }
        delete this._timeOpened;
        this._connectTimeout = setTimeout(function () {
            _this._log.info('WebSocket connection attempt timed out.');
            _this._closeSocket();
        }, CONNECT_TIMEOUT);
        socket.addEventListener('close', this._onSocketClose);
        socket.addEventListener('error', this._onSocketError);
        socket.addEventListener('message', this._onSocketMessage);
        socket.addEventListener('open', this._onSocketOpen);
        this._socket = socket;
    };
    /**
     * Set a timeout to reconnect after HEARTBEAT_TIMEOUT milliseconds
     *   have passed without receiving a message over the WebSocket.
     */
    WSTransport.prototype._setHeartbeatTimeout = function () {
        var _this = this;
        clearTimeout(this._heartbeatTimeout);
        this._heartbeatTimeout = setTimeout(function () {
            _this._log.info("No messages received in " + HEARTBEAT_TIMEOUT / 1000 + " seconds. Reconnecting...");
            _this._closeSocket();
        }, HEARTBEAT_TIMEOUT);
    };
    return WSTransport;
}(events_1.EventEmitter));
exports.default = WSTransport;
//# sourceMappingURL=wstransport.js.map