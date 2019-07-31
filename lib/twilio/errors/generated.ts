/* tslint:disable max-classes-per-file max-line-length */
/**
 * @module Voice
 * @publicapi
 * @internal
 */

/**
 * This is a generated file. Any modifications here will be overwritten. See scripts/errors.js.
 */
import TwilioError from './twilioError';
export { TwilioError };

// TypeScript doesn't allow extending Error so we need to run constructor logic on every one of these
// individually. Ideally this logic would be run in a constructor on a TwilioError class but
// due to this limitation TwilioError is an interface.
// https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes
function construct(context: TwilioError, messageOrError?: string | Error, originalError?: Error) {
  if (typeof messageOrError === 'string') {
    context.message = messageOrError;
    if (originalError instanceof Error) {
      context.originalError = originalError;
    }
  } else if (messageOrError instanceof Error) {
    context.originalError = messageOrError;
  }
}

export namespace AuthorizationErrors {
  export class AccessTokenExpired extends Error implements TwilioError {
    causes: string[] = [];
    code: number = 20104;
    description: string = 'Access token expired or expiration date invalid';
    explanation: string = 'The Access Token provided to the Twilio API has expired, the expiration time specified in the token was invalid, or the expiration time specified was too far in the future';
    solutions: string[] = [];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, AuthorizationErrors.AccessTokenExpired.prototype);
      construct(this, messageOrError, originalError);
    }
  }
}

export namespace ClientErrors {
  export class BadRequest extends Error implements TwilioError {
    causes: string[] = [];
    code: number = 31400;
    description: string = 'Bad Request (HTTP/SIP)';
    explanation: string = 'The request could not be understood due to malformed syntax.';
    solutions: string[] = [];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, ClientErrors.BadRequest.prototype);
      construct(this, messageOrError, originalError);
    }
  }
}

export namespace GeneralErrors {
  export class UnknownError extends Error implements TwilioError {
    causes: string[] = [];
    code: number = 31000;
    description: string = 'Unknown Error';
    explanation: string = 'We received an unexpected error code. See error details for more information.';
    solutions: string[] = [];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, GeneralErrors.UnknownError.prototype);
      construct(this, messageOrError, originalError);
    }
  }
}

export namespace SignalingErrors {
  export class ConnectionError extends Error implements TwilioError {
    causes: string[] = [];
    code: number = 53000;
    description: string = 'Signaling connection error';
    explanation: string = 'Raised whenever a signaling connection error occurs that is not covered by a more specific error code.';
    solutions: string[] = [];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, SignalingErrors.ConnectionError.prototype);
      construct(this, messageOrError, originalError);
    }
  }

  export class ConnectionDisconnected extends Error implements TwilioError {
    causes: string[] = [
      'The device running your application lost its Internet connection.',
    ];
    code: number = 53001;
    description: string = 'Signaling connection disconnected';
    explanation: string = 'Raised whenever the signaling connection is unexpectedly disconnected.';
    solutions: string[] = [
      'Ensure the device running your application has access to a stable Internet connection.',
    ];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, SignalingErrors.ConnectionDisconnected.prototype);
      construct(this, messageOrError, originalError);
    }
  }
}

export namespace MediaErrors {
  export class ConnectionError extends Error implements TwilioError {
    causes: string[] = [
      'The Client was unable to establish a media connection.',
      'A media connection which was active failed liveliness checks.',
    ];
    code: number = 53405;
    description: string = 'Media connection failed';
    explanation: string = 'Raised by the Client or Server whenever a media connection fails.';
    solutions: string[] = [
      'If the problem persists, try connecting to another region.',
      'Check your Client\'s network connectivity.',
      'If you\'ve provided custom ICE Servers then ensure that the URLs and credentials are valid.',
    ];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, MediaErrors.ConnectionError.prototype);
      construct(this, messageOrError, originalError);
    }
  }

  export class UserMediaDenied extends Error implements TwilioError {
    causes: string[] = [
      'The user denied the request for user media manually.',
      'The browser applied a custom policy that auto-denies media requests.',
      'The browser remembered the user\'s previous choice to deny media requests from this page.',
    ];
    code: number = 53406;
    description: string = 'User denied access to user media';
    explanation: string = 'Raised when we try to call getUserMedia to acquire an audio stream and the end user or their browser denies the request.';
    solutions: string[] = [
      'Accept the request for user media.',
      'Navigate to your browser\'s privacy settings and change the policy to ask for permission, or add this site to the whitelist.',
      'Navigate to your browser\'s preferences and change or delete the media rules for the affected page.',
    ];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, MediaErrors.UserMediaDenied.prototype);
      construct(this, messageOrError, originalError);
    }
  }

  export class UserMediaFailed extends Error implements TwilioError {
    causes: string[] = [
      'No input audio devices are available.',
      'No input audio devices that match the passed constraints are available.',
      'A hardware or driver failure has occurred.',
    ];
    code: number = 53407;
    description: string = 'An error occurred while trying to access user media';
    explanation: string = 'Raised when the user media request is allowed but we still fail to get an input audio stream.';
    solutions: string[] = [
      'Add an input device such as a microphone to the computer.',
      'Loosen any passed in audio constraints so that the device you\'re trying to connect is found.',
      'Follow recommended hardware troubleshooting steps for your device and/or operating system.',
    ];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, MediaErrors.UserMediaFailed.prototype);
      construct(this, messageOrError, originalError);
    }
  }
}

export const errorsByCode: ReadonlyMap<number, any> = new Map([
  [ 20104, AuthorizationErrors.AccessTokenExpired ],
  [ 31400, ClientErrors.BadRequest ],
  [ 31000, GeneralErrors.UnknownError ],
  [ 53000, SignalingErrors.ConnectionError ],
  [ 53001, SignalingErrors.ConnectionDisconnected ],
  [ 53405, MediaErrors.ConnectionError ],
  [ 53406, MediaErrors.UserMediaDenied ],
  [ 53407, MediaErrors.UserMediaFailed ],
]);

Object.freeze(errorsByCode);
