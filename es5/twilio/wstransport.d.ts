/**
 * @module Tools
 * @internalapi
 */
/// <reference types="node" />
import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
export interface IMessageEvent {
    data: string;
    target: WebSocket;
    type: string;
}
/**
 * All possible states of WSTransport.
 */
export declare enum WSTransportState {
    /**
     * The WebSocket is not open but is trying to connect.
     */
    Connecting = "connecting",
    /**
     * The WebSocket is not open and is not trying to connect.
     */
    Closed = "closed",
    /**
     * The underlying WebSocket is open and active.
     */
    Open = "open"
}
/**
 * Options to be passed to the WSTransport constructor.
 */
export interface IWSTransportConstructorOptions {
    /**
     * Maximum time to wait before attempting to reconnect the signaling websocket.
     * Default is 20000ms. Minimum is 3000ms.
     */
    backoffMaxMs?: number;
    /**
     * A WebSocket factory to use instead of WebSocket.
     */
    WebSocket?: any;
}
/**
 * WebSocket Transport
 */
export default class WSTransport extends EventEmitter {
    /**
     * The current state of the WSTransport.
     */
    state: WSTransportState;
    /**
     * The backoff instance used to schedule reconnection attempts.
     */
    private readonly _backoff;
    /**
     * The current connection timeout. If it times out, we've failed to connect
     * and should try again.
     *
     * We use any here because NodeJS returns a Timer and browser returns a number
     * and one can't be cast to the other, despite their working interoperably.
     */
    private _connectTimeout?;
    /**
     * The current connection timeout. If it times out, we've failed to connect
     * and should try again.
     *
     * We use any here because NodeJS returns a Timer and browser returns a number
     * and one can't be cast to the other, despite their working interoperably.
     */
    private _heartbeatTimeout?;
    /**
     * An instance of Logger to use.
     */
    private _log;
    /**
     * The currently connecting or open WebSocket.
     */
    private _socket?;
    /**
     * The time the active connection was opened.
     */
    private _timeOpened?;
    /**
     * The URI of the endpoint being connected to.
     */
    private readonly _uri;
    /**
     * The constructor to use for WebSocket
     */
    private readonly _WebSocket;
    /**
     * @constructor
     * @param uri - The URI of the endpoint to connect to.
     * @param [options] - Constructor options.
     */
    constructor(uri: string, options?: IWSTransportConstructorOptions);
    /**
     * Close the WebSocket, and don't try to reconnect.
     */
    close(): void;
    /**
     * Attempt to open a WebSocket connection.
     */
    open(): void;
    /**
     * Send a message through the WebSocket connection.
     * @param message - A message to send to the endpoint.
     * @returns Whether the message was sent.
     */
    send(message: string): boolean;
    /**
     * Close the WebSocket, and don't try to reconnect.
     */
    private _close;
    /**
     * Close the WebSocket and remove all event listeners.
     */
    private _closeSocket;
    /**
     * Attempt to connect to the endpoint via WebSocket.
     * @param [retryCount] - Retry number, if this is a retry. Undefined if
     *   first attempt, 1+ if a retry.
     */
    private _connect;
    /**
     * Called in response to WebSocket#close event.
     */
    private _onSocketClose;
    /**
     * Called in response to WebSocket#error event.
     */
    private _onSocketError;
    /**
     * Called in response to WebSocket#message event.
     */
    private _onSocketMessage;
    /**
     * Called in response to WebSocket#open event.
     */
    private _onSocketOpen;
    /**
     * Set a timeout to reconnect after HEARTBEAT_TIMEOUT milliseconds
     *   have passed without receiving a message over the WebSocket.
     */
    private _setHeartbeatTimeout;
}
