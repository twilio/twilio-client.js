import { getRegionURI, deprecatedRegions } from '../../lib/twilio/regions';
import * as assert from 'assert';

describe('regions', () => {
  describe('getRegionURI', () => {
    (Object as any).entries(deprecatedRegions).forEach(([deprecatedRegion, newRegion]: [string, string]) => {
      it(`should note ${deprecatedRegion} as deprecated and recommend ${newRegion}`, async () => {
        const uri = getRegionURI(deprecatedRegion);
        const region = await new Promise(async resolveRegion => {
          getRegionURI(deprecatedRegion, resolveRegion);
        });

        assert.equal(`chunderw-vpc-gll-${newRegion}.twilio.com`, uri);
        assert.equal(newRegion, region);
      });
    });

    it('should not call `onDeprecated` for a non-deprecated region', () => {
      const region = 'some_region';
      let called = false;
      const uri = getRegionURI(region, () => called = true);

      assert.equal(`chunderw-vpc-gll-${region}.twilio.com`, uri);
      assert(!called);
    });

    describe('should return the default chunderw uri', () => {
      it('when region is `undefined`', () => {
        const region = undefined;
        assert.equal(`chunderw-vpc-gll.twilio.com`, getRegionURI(region));
      });
      it('when region is `gll`', () => {
        const region = 'gll';
        assert.equal(`chunderw-vpc-gll.twilio.com`, getRegionURI(region));
      });
    });
  });
});
