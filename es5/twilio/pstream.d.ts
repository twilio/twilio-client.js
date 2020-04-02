export var PStream: typeof PStream;
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
 */
declare function PStream(token: string, uri: string, options?: any): PStream;
declare class PStream {
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
     */
    constructor(token: string, uri: string, options?: any);
    options: any;
    token: string;
    status: string;
    uri: string;
    gateway: any;
    region: any;
    _messageQueue: any[];
    _handleTransportClose: any;
    _handleTransportError: any;
    _handleTransportMessage: any;
    _handleTransportOpen: any;
    _log: import("./log").default;
    transport: any;
    toString(): string;
    setToken(token: any): void;
    register(mediaCapabilities: any): void;
    reinvite(sdp: any, callsid: any): void;
    _destroy(): void;
    destroy(): PStream;
    publish(type: any, payload: any): void;
    _publish(type: any, payload: any, shouldRetry: any): void;
}
declare namespace PStream { }
export {};
