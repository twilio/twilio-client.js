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

export namespace MediaErrors {
  export class UserMediaDenied extends Error implements TwilioError {
    causes: string[] = [
      'The user denied the request for user media manually.',
      'The browser applied a custom policy that auto-denies media requests.',
      'The browser remembered the user\'s previous choice to deny media requests from this page.'
    ];
    code: number = 53406;
    description: string = 'User denied access to user media';
    explanation: string = 'Raised when we try to call getUserMedia to acquire an audio stream and the end user or their browser denies the request.';
    solutions: string[] = [
      'Accept the request for user media.',
      'Navigate to your browser\'s privacy settings and change the policy to ask for permission, or add this site to the whitelist.',
      'Navigate to your browser\'s preferences and change or delete the media rules for the affected page.'
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
}

export const errorsByCode: ReadonlyMap<number, any> = new Map([
  [ 53406, MediaErrors.UserMediaDenied ]
]);

Object.freeze(errorsByCode);