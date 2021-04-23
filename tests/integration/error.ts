import * as assert from 'assert';
import { Error } from '../../lib/twilio';

describe('Error', () => {
  it('the exposed errors should be defined', () => {
    assert(Error);
  });
});
