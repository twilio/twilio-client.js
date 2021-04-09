/**
 * @packageDocumentation
 * @module Voice
 * @publicapi
 * @internal
 */
/**
 * This is a generated file. Any modifications here will be overwritten. See scripts/errors.js.
 */
import TwilioError from './twilioError';
export { TwilioError };
export declare namespace AuthorizationErrors {
    class AccessTokenInvalid extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class AccessTokenExpired extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class AuthenticationFailed extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
}
export declare namespace ClientErrors {
    class BadRequest extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
}
export declare namespace GeneralErrors {
    class UnknownError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class ConnectionError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class CallCancelledError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class TransportError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
}
export declare namespace UserMediaErrors {
    class PermissionDeniedError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class AcquisitionFailedError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
}
export declare namespace SignalingErrors {
    class ConnectionError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class ConnectionDisconnected extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
}
export declare namespace MediaErrors {
    class ClientLocalDescFailed extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class ClientRemoteDescFailed extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
    class ConnectionError extends TwilioError {
        causes: string[];
        code: number;
        description: string;
        explanation: string;
        solutions: string[];
        constructor();
        constructor(message: string);
        constructor(originalError: Error);
        constructor(message: string, originalError?: Error);
    }
}
/**
 * @private
 */
export declare const errorsByCode: ReadonlyMap<number, any>;
