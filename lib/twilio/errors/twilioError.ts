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
   * The original error object received from the external system, if any.
   */
  originalError?: object;

  /**
   * A list of potential solutions for the Error.
   */
  solutions: string[];

  constructor({ customMessage, originalError }: TwilioErrorParameters = { }) {
    super();
    Object.setPrototypeOf(this, TwilioError.prototype);

    this.message = `${this.name} (${this.code}): ${customMessage || this.explanation}`;
    this.originalError = originalError;
  }
}

export interface TwilioErrorParameters {
  customMessage?: string;
  originalError?: object;
}
