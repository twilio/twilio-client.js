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
    explanation: string = 'An unknown error has occurred. See error details for more information.';
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
  export class ClientLocalDescFailed extends Error implements TwilioError {
    causes: string[] = [
      'The Client may not be using a supported WebRTC implementation.',
      'The Client may not have the necessary resources to create or apply a new media description.',
    ];
    code: number = 53400;
    description: string = 'Client is unable to create or apply a local media description';
    explanation: string = 'Raised whenever a Client is unable to create or apply a local media description.';
    solutions: string[] = [
      'If you are experiencing this error using the JavaScript SDK, ensure you are running it with a supported WebRTC implementation.',
    ];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, MediaErrors.ClientLocalDescFailed.prototype);
      construct(this, messageOrError, originalError);
    }
  }

  export class ClientRemoteDescFailed extends Error implements TwilioError {
    causes: string[] = [
      'The Client may not be using a supported WebRTC implementation.',
      'The Client may be connecting peer-to-peer with another Participant that is not using a supported WebRTC implementation.',
      'The Client may not have the necessary resources to apply a new media description.',
    ];
    code: number = 53402;
    description: string = 'Client is unable to apply a remote media description';
    explanation: string = 'Raised whenever the Client receives a remote media description but is unable to apply it.';
    solutions: string[] = [
      'If you are experiencing this error using the JavaScript SDK, ensure you are running it with a supported WebRTC implementation.',
    ];

    constructor();
    constructor(message: string);
    constructor(originalError: Error);
    constructor(message: string, originalError?: Error);
    constructor(messageOrError?: string | Error, originalError?: Error) {
      super('');
      Object.setPrototypeOf(this, MediaErrors.ClientRemoteDescFailed.prototype);
      construct(this, messageOrError, originalError);
    }
  }

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
}

export const errorsByCode: ReadonlyMap<number, any> = new Map([
  [ 20104, AuthorizationErrors.AccessTokenExpired ],
  [ 31400, ClientErrors.BadRequest ],
  [ 31000, GeneralErrors.UnknownError ],
  [ 53001, SignalingErrors.ConnectionDisconnected ],
  [ 53400, MediaErrors.ClientLocalDescFailed ],
  [ 53402, MediaErrors.ClientRemoteDescFailed ],
  [ 53405, MediaErrors.ConnectionError ],
]);

Object.freeze(errorsByCode);
