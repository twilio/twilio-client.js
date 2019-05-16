const assert = require('assert');
const mos = require('../lib/twilio/rtc/mos');

describe('MOS', () => {
  describe('.calculate', () => {
    it('should return null when passed bad values', () => {
      assert.equal(mos.calculate(), null);
      assert.equal(mos.calculate(), null);
      assert.equal(mos.calculate(undefined, undefined, 1), null);
      assert.equal(mos.calculate(1, 1), null);
      assert.equal(mos.calculate(1), null);
      assert.equal(mos.calculate(undefined, 1), null);
      assert.equal(mos.calculate(1, null, 1), null);
      assert.equal(mos.calculate(null, 1, 1), null);
      assert.equal(mos.calculate(1, -1, 1), null);
      assert.equal(mos.calculate(-1, 1, 1), null);
    });

    it('should return a non-null value when passed good values', () => {
      assert.notEqual(mos.calculate(5, 0, 0), null);
    });
  });
});
