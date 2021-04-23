import { getErrorByCode, MediaErrors, TwilioError } from '../../lib/twilio/errors';
import * as assert from 'assert';

/* tslint:disable-next-line */
describe('Errors', function() {
  describe('constructor', () => {
    it('should create an instance of the Error', () => {
      const error: TwilioError = new MediaErrors.ConnectionError('foobar');
      assert(error instanceof Error);
      assertTwilioError(error);
      assert(error instanceof MediaErrors.ConnectionError);
      assert.equal(error.code, 53405);
      assert.equal(error.message, 'foobar');
      assert.equal(error.originalError, undefined);
    });

    it('should use first param as originalError if of type Error', () => {
      const err = new Error('foobar');
      const error: TwilioError = new MediaErrors.ConnectionError(err);
      assert.equal(error.message, '');
      assert.equal(error.originalError, err);
    });

    it('should use both params', () => {
      const err = new Error('foobar');
      const error: TwilioError = new MediaErrors.ConnectionError('foobar', err);
      assert.equal(error.message, 'foobar');
      assert.equal(error.originalError, err);
    });

    it('should allow no params', () => {
      const error: TwilioError = new MediaErrors.ConnectionError();
      assert.equal(error.message, MediaErrors.ConnectionError.prototype.explanation);
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
