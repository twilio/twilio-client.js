/**
 * @internalapi
 */
import { AuthorizationErrors, ClientErrors, GeneralErrors, MediaErrors, SignalingErrors, TwilioError } from './generated';
export declare class InvalidArgumentError extends Error {
    type: 'InvalidArgumentError';
}
export declare class InvalidStateError extends Error {
    type: 'InvalidStateError';
}
export declare class NotSupportedError extends Error {
    type: 'NotSupportedError';
}
export declare function getErrorByCode(code: number): TwilioError;
export { AuthorizationErrors, ClientErrors, GeneralErrors, MediaErrors, SignalingErrors, TwilioError, };
