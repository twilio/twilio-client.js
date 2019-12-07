"use strict";
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Valid deprecated regions.
 *
 * @private
 */
var DeprecatedRegion;
(function (DeprecatedRegion) {
    DeprecatedRegion["Au"] = "au";
    DeprecatedRegion["Br"] = "br";
    DeprecatedRegion["Ie"] = "ie";
    DeprecatedRegion["Jp"] = "jp";
    DeprecatedRegion["Sg"] = "sg";
    DeprecatedRegion["UsOr"] = "us-or";
    DeprecatedRegion["UsVa"] = "us-va";
})(DeprecatedRegion = exports.DeprecatedRegion || (exports.DeprecatedRegion = {}));
/**
 * Valid current regions.
 *
 * @deprecated CLIENT-6831
 * This is no longer used or updated for checking validity of regions in the
 * SDK. We now allow any string to be passed for region. Invalid regions won't
 * be able to connect, and won't throw an exception.
 */
var Region;
(function (Region) {
    Region["Au1"] = "au1";
    Region["Br1"] = "br1";
    Region["De1"] = "de1";
    Region["De1Ix"] = "de1-ix";
    Region["Gll"] = "gll";
    Region["Ie1"] = "ie1";
    Region["Ie1Ix"] = "ie1-ix";
    Region["Ie1Tnx"] = "ie1-tnx";
    Region["Jp1"] = "jp1";
    Region["Sg1"] = "sg1";
    Region["Us1"] = "us1";
    Region["Us1Ix"] = "us1-ix";
    Region["Us1Tnx"] = "us1-tnx";
    Region["Us2"] = "us2";
    Region["Us2Ix"] = "us2-ix";
    Region["Us2Tnx"] = "us2-tnx";
})(Region = exports.Region || (exports.Region = {}));
/**
 * Deprecated regions. Maps the deprecated region to its equivalent up-to-date region.
 */
exports.deprecatedRegions = (_a = {},
    _a[DeprecatedRegion.Au] = Region.Au1,
    _a[DeprecatedRegion.Br] = Region.Br1,
    _a[DeprecatedRegion.Ie] = Region.Ie1,
    _a[DeprecatedRegion.Jp] = Region.Jp1,
    _a[DeprecatedRegion.Sg] = Region.Sg1,
    _a[DeprecatedRegion.UsOr] = Region.Us1,
    _a[DeprecatedRegion.UsVa] = Region.Us1,
    _a);
/**
 * Region shortcodes. Maps the full region name from AWS to the Twilio shortcode.
 * @private
 */
exports.regionShortcodes = {
    ASIAPAC_SINGAPORE: Region.Sg1,
    ASIAPAC_SYDNEY: Region.Au1,
    ASIAPAC_TOKYO: Region.Jp1,
    EU_FRANKFURT: Region.De1,
    EU_IRELAND: Region.Ie1,
    SOUTH_AMERICA_SAO_PAULO: Region.Br1,
    US_EAST_VIRGINIA: Region.Us1,
    US_WEST_OREGON: Region.Us2,
};
/**
 * Region URIs. Maps the Twilio shortcode to its Twilio endpoint URI.
 * @private
 */
var regionURIs = (_b = {},
    _b[Region.Au1] = 'chunderw-vpc-gll-au1.twilio.com',
    _b[Region.Br1] = 'chunderw-vpc-gll-br1.twilio.com',
    _b[Region.De1] = 'chunderw-vpc-gll-de1.twilio.com',
    _b[Region.De1Ix] = 'chunderw-vpc-gll-de1-ix.twilio.com',
    _b[Region.Gll] = 'chunderw-vpc-gll.twilio.com',
    _b[Region.Ie1] = 'chunderw-vpc-gll-ie1.twilio.com',
    _b[Region.Ie1Ix] = 'chunderw-vpc-gll-ie1-ix.twilio.com',
    _b[Region.Ie1Tnx] = 'chunderw-vpc-gll-ie1-tnx.twilio.com',
    _b[Region.Jp1] = 'chunderw-vpc-gll-jp1.twilio.com',
    _b[Region.Sg1] = 'chunderw-vpc-gll-sg1.twilio.com',
    _b[Region.Us1] = 'chunderw-vpc-gll-us1.twilio.com',
    _b[Region.Us1Ix] = 'chunderw-vpc-gll-us1-ix.twilio.com',
    _b[Region.Us1Tnx] = 'chunderw-vpc-gll-us1-tnx.twilio.com',
    _b[Region.Us2] = 'chunderw-vpc-gll-us2.twilio.com',
    _b[Region.Us2Ix] = 'chunderw-vpc-gll-us2-ix.twilio.com',
    _b[Region.Us2Tnx] = 'chunderw-vpc-gll-us2-tnx.twilio.com',
    _b);
/**
 * The default region to connect to and create a chunder uri from if region is
 * not defined.
 * @constant
 */
exports.defaultRegion = 'gll';
/**
 * Get the URI associated with the passed shortcode.
 *
 * @private
 * @param region - The region shortcode. Defaults to gll.
 * @param [onDeprecated] - A callback containing the new region to be called when the passed region
 *   is deprecated.
 */
function getRegionURI(region, onDeprecated) {
    if (region === undefined || region === exports.defaultRegion) {
        return "chunderw-vpc-gll.twilio.com";
    }
    var newRegion = exports.deprecatedRegions[region];
    if (newRegion) {
        region = newRegion;
        if (onDeprecated) {
            // Don't let this callback affect script execution.
            setTimeout(function () { return onDeprecated(newRegion); });
        }
    }
    return "chunderw-vpc-gll-" + region + ".twilio.com";
}
exports.getRegionURI = getRegionURI;
/**
 * Get the region shortcode by its full AWS region string.
 *
 * @private
 * @param region - The region's full AWS string.
 */
function getRegionShortcode(region) {
    return exports.regionShortcodes[region] || null;
}
exports.getRegionShortcode = getRegionShortcode;
//# sourceMappingURL=regions.js.map