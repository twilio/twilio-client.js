/**
 * @packageDocumentation
 * @internalapi
 */
/* tslint:disable max-classes-per-file */
import {
  AuthorizationErrors,
  ClientErrors,
  errorsByCode,
  GeneralErrors,
  MediaErrors,
  SignalingErrors,
  TwilioError,
} from './generated';

// Application errors that can be avoided by good app logic
export class InvalidArgumentError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'InvalidArgumentError';
  }
}
export class InvalidStateError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'InvalidStateError';
  }
}
export class NotSupportedError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'NotSupportedError';
  }
}

// This should only be used to look up error codes returned by a server
// using the same repo of error codes.
export function getErrorByCode(code: number): TwilioError {
  const error: TwilioError | undefined = errorsByCode.get(code);
  if (!error) {
    throw new InvalidArgumentError(`Error code ${code} not found`);
  }
  return error;
}

// All errors we want to throw or emit locally in the SDK need to be passed through here.
export {
  AuthorizationErrors,
  ClientErrors,
  GeneralErrors,
  MediaErrors,
  SignalingErrors,
  TwilioError,
};
