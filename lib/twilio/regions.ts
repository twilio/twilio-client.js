/**
 * @module Voice
 * This module describes valid and deprecated regions.
 */
import { InvalidArgumentError } from './errors';
import { Exception } from './util';

/**
 * Valid deprecated regions
 * @private
 */
export enum DeprecatedRegion {
  Au = 'au',
  Br = 'br',
  Ie = 'ie',
  Jp = 'jp',
  Sg = 'sg',
  UsOr = 'us-or',
  UsVa = 'us-va',
}

/**
 * Valid current regions
 */
export enum Region {
  Au1 = 'au1',
  Br1 = 'br1',
  De1 = 'de1',
  Gll = 'gll',
  Ie1 = 'ie1',
  Ie1Ix = 'ie1-ix',
  Ie1Tnx = 'ie1-tnx',
  Jp1 = 'jp1',
  Sg1 = 'sg1',
  Us1 = 'us1',
  Us1Ix = 'us1-ix',
  Us1Tnx = 'us1-tnx',
  Us2 = 'us2',
  Us2Ix = 'us2-ix',
  Us2Tnx = 'us2-tnx',
}

/**
 * All valid regions
 * @private
 */
export type ValidRegion = Region | DeprecatedRegion;

/**
 * Deprecated regions. Maps the deprecated region to its equivalent up-to-date region.
 */
const deprecatedRegions: Record<DeprecatedRegion, Region> = {
  [DeprecatedRegion.Au]: Region.Au1,
  [DeprecatedRegion.Br]: Region.Br1,
  [DeprecatedRegion.Ie]: Region.Ie1,
  [DeprecatedRegion.Jp]: Region.Jp1,
  [DeprecatedRegion.Sg]: Region.Sg1,
  [DeprecatedRegion.UsOr]: Region.Us1,
  [DeprecatedRegion.UsVa]: Region.Us1,
};

/**
 * Region shortcodes. Maps the full region name from AWS to the Twilio shortcode.
 * @private
 */
export const regionShortcodes: { [index: string]: Region } = {
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
const regionURIs: Record<Region, string> = {
  [Region.Au1]: 'chunderw-vpc-gll-au1.twilio.com',
  [Region.Br1]: 'chunderw-vpc-gll-br1.twilio.com',
  [Region.De1]: 'chunderw-vpc-gll-de1.twilio.com',
  [Region.Gll]: 'chunderw-vpc-gll.twilio.com',
  [Region.Ie1]: 'chunderw-vpc-gll-ie1.twilio.com',
  [Region.Ie1Ix]: 'chunderw-vpc-gll-ie1-ix.twilio.com',
  [Region.Ie1Tnx]: 'chunderw-vpc-gll-ie1-tnx.twilio.com',
  [Region.Jp1]: 'chunderw-vpc-gll-jp1.twilio.com',
  [Region.Sg1]: 'chunderw-vpc-gll-sg1.twilio.com',
  [Region.Us1]: 'chunderw-vpc-gll-us1.twilio.com',
  [Region.Us1Ix]: 'chunderw-vpc-gll-us1-ix.twilio.com',
  [Region.Us1Tnx]: 'chunderw-vpc-gll-us1-tnx.twilio.com',
  [Region.Us2]: 'chunderw-vpc-gll-us2.twilio.com',
  [Region.Us2Ix]: 'chunderw-vpc-gll-us2-ix.twilio.com',
  [Region.Us2Tnx]: 'chunderw-vpc-gll-us2-tnx.twilio.com',
};

/**
 * Get the URI associated with the passed shortcode.
 * @private
 * @param region - The region shortcode. Defaults to gll.
 * @param [onDeprecated] - A callback containing the new region to be called when the passed region
 *   is deprecated.
 */
export function getRegionURI(region: ValidRegion = Region.Gll, onDeprecated?: (newRegion: Region) => void): string {
  if ((Object as any).values(DeprecatedRegion).includes(region)) {
    region = deprecatedRegions[region as DeprecatedRegion];

    // Don't let this callback affect script execution.
    if (onDeprecated) {
      setTimeout(() => onDeprecated(region as Region));
    }
  } else if (!(Object as any).values(Region).includes(region)) {
    const msg = `Region ${region} is invalid. Valid values are: ${Object.keys(regionURIs).join(', ')}`;
    throw new InvalidArgumentError(msg);
  }

  return regionURIs[region as Region];
}

/**
 * Get the region shortcode by its full AWS region string.
 * @private
 * @param region - The region's full AWS string.
 */
export function getRegionShortcode(region: string): Region | null {
  return regionShortcodes[region] || null;
}
