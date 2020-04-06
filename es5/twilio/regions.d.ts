/**
 * Valid deprecated regions.
 *
 * @private
 */
export declare enum DeprecatedRegion {
    Au = "au",
    Br = "br",
    Ie = "ie",
    Jp = "jp",
    Sg = "sg",
    UsOr = "us-or",
    UsVa = "us-va"
}
/**
 * Valid current regions.
 *
 * @deprecated CLIENT-6831
 * This is no longer used or updated for checking validity of regions in the
 * SDK. We now allow any string to be passed for region. Invalid regions won't
 * be able to connect, and won't throw an exception.
 */
export declare enum Region {
    Au1 = "au1",
    Br1 = "br1",
    De1 = "de1",
    De1Ix = "de1-ix",
    Gll = "gll",
    Ie1 = "ie1",
    Ie1Ix = "ie1-ix",
    Ie1Tnx = "ie1-tnx",
    Jp1 = "jp1",
    Sg1 = "sg1",
    Us1 = "us1",
    Us1Ix = "us1-ix",
    Us1Tnx = "us1-tnx",
    Us2 = "us2",
    Us2Ix = "us2-ix",
    Us2Tnx = "us2-tnx"
}
/**
 * All valid regions
 * @private
 */
export declare type ValidRegion = Region | DeprecatedRegion;
/**
 * Deprecated regions. Maps the deprecated region to its equivalent up-to-date region.
 */
export declare const deprecatedRegions: Record<DeprecatedRegion, Region>;
/**
 * Region shortcodes. Maps the full region name from AWS to the Twilio shortcode.
 * @private
 */
export declare const regionShortcodes: {
    [index: string]: Region;
};
/**
 * The default region to connect to and create a chunder uri from if region is
 * not defined.
 * @constant
 */
export declare const defaultRegion: string;
/**
 * Get the URI associated with the passed shortcode.
 *
 * @private
 * @param region - The region shortcode. Defaults to gll.
 * @param [onDeprecated] - A callback containing the new region to be called when the passed region
 *   is deprecated.
 */
export declare function getRegionURI(region?: string, onDeprecated?: (newRegion: string) => void): string;
/**
 * Get the region shortcode by its full AWS region string.
 *
 * @private
 * @param region - The region's full AWS string.
 */
export declare function getRegionShortcode(region: string): Region | null;
