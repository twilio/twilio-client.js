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
    class AccessTokenInvalid extends Error implements TwilioError {
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
    class AccessTokenExpired extends Error implements TwilioError {
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
    class AuthenticationFailed extends Error implements TwilioError {
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
    class BadRequest extends Error implements TwilioError {
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
    class UnknownError extends Error implements TwilioError {
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
    class ConnectionError extends Error implements TwilioError {
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
    class TransportError extends Error implements TwilioError {
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
    class ConnectionError extends Error implements TwilioError {
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
    class ConnectionDisconnected extends Error implements TwilioError {
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
    class ClientLocalDescFailed extends Error implements TwilioError {
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
    class ClientRemoteDescFailed extends Error implements TwilioError {
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
    class ConnectionError extends Error implements TwilioError {
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
