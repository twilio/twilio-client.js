import * as assert from 'assert';
import { getErrorByCode, MediaErrors, TwilioError } from '../../lib/twilio/errors';

/* tslint:disable-next-line */
describe('Errors', function() {
  describe('constructor', () => {
    it('should use message', () => {
      const error: TwilioError = new MediaErrors.ConnectionError('foobar');
      assert(error instanceof Error);
      assertTwilioError(error);
      assert(error instanceof MediaErrors.ConnectionError);
      assert.equal(error.code, 53405);
      assert.equal(error.message, 'ConnectionError (53405): foobar');
      assert.equal(error.originalError, undefined);
    });

    it('should use originalError', () => {
      const originalError = new Error('foobar');
      const error: TwilioError = new MediaErrors.ConnectionError(originalError);
      assert(error instanceof Error);
      assertTwilioError(error);
      assert(error instanceof MediaErrors.ConnectionError);
      assert.equal(error.code, 53405);
      assert.equal(error.message, 'ConnectionError (53405): Raised by the Client or Server whenever a media connection fails.');
      assert.equal(error.originalError, originalError);
    });

    it('should use both message and originalError', () => {
      const originalError = new Error('foobar');
      const error: TwilioError = new MediaErrors.ConnectionError('foobar', originalError);
      assert(error instanceof Error);
      assertTwilioError(error);
      assert(error instanceof MediaErrors.ConnectionError);
      assert.equal(error.code, 53405);
      assert.equal(error.message, 'ConnectionError (53405): foobar');
      assert.equal(error.originalError, originalError);
    });

    it('should allow no params', () => {
      const error: TwilioError = new MediaErrors.ConnectionError();
      assert(error instanceof Error);
      assertTwilioError(error);
      assert(error instanceof MediaErrors.ConnectionError);
      assert.equal(error.code, 53405);
      assert.equal(error.message, 'ConnectionError (53405): Raised by the Client or Server whenever a media connection fails.');
      assert.equal(error.originalError, undefined);
    });
  });

  describe('getErrorByCode', () => {
    it('should throw if code is not found', () => {
      assert.throws(() => getErrorByCode(123456));
    });

    it('should return the TwilioError if code is found', () => {
      const twilioError: any = getErrorByCode(53405);
      const error: TwilioError = new twilioError();
      assert(error instanceof Error);
      assertTwilioError(error);
      assert(error instanceof MediaErrors.ConnectionError);
      assert.equal(error.code, 53405);
    });
  });
});

// Currently the only way to check an interface at runtime.
function assertTwilioError(error: Error): error is TwilioError {
  return true;
}
