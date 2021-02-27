/**
 * @packageDocumentation
 * @module Voice
 * @publicapi
 * @internal
 */
export default class TwilioError extends Error {
  /**
   * A list of possible causes for the Error.
   */
  causes: string[];

  /**
   * The numerical code associated with this Error.
   */
  code: number;

  /**
   * A description of what the Error means.
   */
  description: string;

  /**
   * An explanation of when the Error may be observed.
   */
  explanation: string;

  /**
   * Any further information discovered and passed along at run-time.
   */
  message: string;

  /**
   * The name of this Error.
   */
  name: string;

  /**
   * The original Error received from the external system, if any.
   */
  originalError?: Error;

  /**
   * A list of potential solutions for the Error.
   */
  solutions: string[];

  constructor(messageOrError?: string | Error, originalError?: Error) {
    super();
    if (typeof messageOrError === 'string') {
      this.message = messageOrError;
      if (originalError instanceof Error) {
        this.originalError = originalError;
      }
    } else if (messageOrError instanceof Error) {
      this.originalError = messageOrError;
    }

    Object.setPrototypeOf(this, TwilioError.prototype);
  }
}
