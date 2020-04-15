/**
 * @module Voice
 * This module describes valid and deprecated regions.
 */
import { InvalidArgumentError } from './errors';

/**
 * Valid deprecated regions.
 *
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
 * Valid edges.
 */
export enum Edge {
  /**
   * Public edges
   */
  Sydney = 'sydney',
  SaoPaolo = 'sao-paolo',
  Dublin = 'dublin',
  Frankfurt = 'frankfurt',
  Tokyo = 'tokyo',
  Singapore = 'singapore',
  Ashburn = 'ashburn',
  Umatilla = 'umatilla',
  Roaming = 'roaming',
  /**
   * Interconnect edges
   */
  AshburnIx = 'ashburn-ix',
  SanJoseIx = 'san-jose-ix',
  LondonIx = 'london-ix',
  FrankfurtIx = 'frankfurt-ix',
  SingaporeIx = 'singapore-ix',
}

/**
 * Valid current regions.
 *
 * @deprecated
 *
 * CLIENT-6831
 * This is no longer used or updated for checking validity of regions in the
 * SDK. We now allow any string to be passed for region. Invalid regions won't
 * be able to connect, and won't throw an exception.
 *
 * CLIENT-7519
 * This is used again to temporarily convert edge values to regions as part of
 * Phase 1 Regional. This is still considered deprecated.
 *
 * @private
 */
export enum Region {
  Au1 = 'au1',
  Br1 = 'br1',
  De1 = 'de1',
  De1Ix = 'de1-ix',
  Gll = 'gll',
  Ie1 = 'ie1',
  Ie1Ix = 'ie1-ix',
  Ie1Tnx = 'ie1-tnx',
  Jp1 = 'jp1',
  Sg1 = 'sg1',
  Sg1Ix = 'sg1-ix',
  Sg1Tnx = 'sg1-tnx',
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
 * @private
 */
export const deprecatedRegions: Record<DeprecatedRegion, Region> = {
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
  [Region.De1Ix]: 'chunderw-vpc-gll-de1-ix.twilio.com',
  [Region.Gll]: 'chunderw-vpc-gll.twilio.com',
  [Region.Ie1]: 'chunderw-vpc-gll-ie1.twilio.com',
  [Region.Ie1Ix]: 'chunderw-vpc-gll-ie1-ix.twilio.com',
  [Region.Ie1Tnx]: 'chunderw-vpc-gll-ie1-tnx.twilio.com',
  [Region.Jp1]: 'chunderw-vpc-gll-jp1.twilio.com',
  [Region.Sg1]: 'chunderw-vpc-gll-sg1.twilio.com',
  [Region.Sg1Ix]: 'chunderw-vpc-gll-sg1-ix.twilio.com',
  [Region.Sg1Tnx]: 'chunderw-vpc-gll-sg1-tnx.twilio.com',
  [Region.Us1]: 'chunderw-vpc-gll-us1.twilio.com',
  [Region.Us1Ix]: 'chunderw-vpc-gll-us1-ix.twilio.com',
  [Region.Us1Tnx]: 'chunderw-vpc-gll-us1-tnx.twilio.com',
  [Region.Us2]: 'chunderw-vpc-gll-us2.twilio.com',
  [Region.Us2Ix]: 'chunderw-vpc-gll-us2-ix.twilio.com',
  [Region.Us2Tnx]: 'chunderw-vpc-gll-us2-tnx.twilio.com',
};

/**
 * Edge to region mapping, as part of Phase 1 Regional (CLIENT-7519).
 * Temporary.
 * @private
 */
export const edgeToRegion: Record<Edge, Region> = {
  [Edge.Sydney]: Region.Au1,
  [Edge.SaoPaolo]: Region.Br1,
  [Edge.Dublin]: Region.Ie1,
  [Edge.Frankfurt]: Region.De1,
  [Edge.Tokyo]: Region.Jp1,
  [Edge.Singapore]: Region.Sg1,
  [Edge.Ashburn]: Region.Us1,
  [Edge.Umatilla]: Region.Us2,
  [Edge.Roaming]: Region.Gll,
  /**
   * Interconnect edges
   */
  [Edge.AshburnIx]: Region.Us1Ix,
  [Edge.SanJoseIx]: Region.Us2Ix,
  [Edge.LondonIx]: Region.Ie1Ix,
  [Edge.FrankfurtIx]: Region.De1Ix,
  [Edge.SingaporeIx]: Region.Sg1Ix,
};

/**
 * Region to edge mapping, as part of Phase 1 Regional (CLIENT-7519).
 * Temporary.
 * @private
 */
export const regionToEdge: Record<Region, Edge> = {
  [Region.Au1]: Edge.Sydney,
  [Region.Br1]: Edge.SaoPaolo,
  [Region.Ie1]: Edge.Dublin,
  [Region.De1]: Edge.Frankfurt,
  [Region.Jp1]: Edge.Tokyo,
  [Region.Sg1]: Edge.Singapore,
  [Region.Us1]: Edge.Ashburn,
  [Region.Us2]: Edge.Umatilla,
  [Region.Gll]: Edge.Roaming,
  /**
   * Interconnect edges
   */
  [Region.Us1Ix]: Edge.AshburnIx,
  [Region.Us2Ix]: Edge.SanJoseIx,
  [Region.Ie1Ix]: Edge.LondonIx,
  [Region.De1Ix]: Edge.FrankfurtIx,
  [Region.Sg1Ix]: Edge.SingaporeIx,
  /**
   * Tnx regions
   */
  [Region.Us1Tnx]: Edge.AshburnIx,
  [Region.Us2Tnx]: Edge.AshburnIx,
  [Region.Ie1Tnx]: Edge.LondonIx,
  [Region.Sg1Tnx]: Edge.SingaporeIx,
};

/**
 * The default region to connect to and create a chunder uri from if region is
 * not defined.
 * @constant
 * @private
 */
export const defaultRegion: string = 'gll';

/**
 * The default edge to connect to and create a chunder uri from, if the edge
 * parameter is not specified during setup in `Device`.
 * @constant
 */
export const defaultEdge: Edge = Edge.Roaming;

/**
 * The default chunder URI to connect to, should map to `gll` or `roaming`.
 * @constant
 * @private
 */
export const defaultChunderUri = 'chunderw-vpc-gll.twilio.com';

/**
 * Get the URI associated with the passed shortcode.
 *
 * @private
 * @param region - The region shortcode. Defaults to gll.
 * @param [onDeprecated] - A callback containing the new region to be called when the passed region
 *   is deprecated.
 */
export function getRegionURI(region?: string, onDeprecated?: (newRegion: string) => void): string {
  if (region === undefined || region === defaultRegion) {
    return `chunderw-vpc-gll.twilio.com`;
  }

  const newRegion = deprecatedRegions[region as DeprecatedRegion];
  if (newRegion) {
    region = newRegion;
    if (onDeprecated) {
      // Don't let this callback affect script execution.
      setTimeout(() => onDeprecated(newRegion));
    }
  }

  return `chunderw-vpc-gll-${region}.twilio.com`;
}

/**
 * Get the URI associated with the passed region or edge. If both are passed,
 * then we want to fail `Device` setup, so we throw an error.
 * As of CLIENT-7519, Regions are deprecated in favor of edges as part of
 * Phase 1 Regional.
 *
 * @private
 * @param edge - The edge.
 * @param region - The region shortcode.
 * @param [onDeprecated] - A callback containing the deprecation message to be
 *   warned when the passed parameters are deprecated.
 */
export function getChunderURI(
  edge: any,
  region: any,
  onDeprecated?: (message: string) => void,
): string {
  if (
    (typeof region !== 'string' && typeof region !== 'undefined') ||
    (typeof edge !== 'string' && typeof edge !== 'undefined')
  ) {
    throw new InvalidArgumentError(
      'If `region` or `edge` are defined, they must of type `string`.',
    );
  }

  const deprecatedMessages: string[] = [];

  let chunderRegion: string | undefined;

  if (region && edge) {
    throw new InvalidArgumentError(
      'Defining both a `region` and an `edge` in `Twilio.Device.Options` is ' +
      'unsupported.',
    );
  } else if (region) {
    chunderRegion = region;

    // TODO mhuynh direct to documentation regarding Twilio regional phase 1
    deprecatedMessages.push(
      'Regions are deprecated in favor of edges. Please see TODO.',
    );

    const isDeprecatedRegion: boolean =
      (Object.values(DeprecatedRegion) as string[]).includes(chunderRegion);
    if (isDeprecatedRegion) {
      chunderRegion = deprecatedRegions[chunderRegion as DeprecatedRegion];
    }

    const isKnownRegion: boolean =
      (Object.values(Region) as string[]).includes(chunderRegion);
    if (isKnownRegion) {
      const preferredEdge = regionToEdge[chunderRegion as Region];
      deprecatedMessages.push(
        `Region "${chunderRegion}" is deprecated, please use \`edge\` ` +
        `"${preferredEdge}".`,
      );
    }
  } else if (edge) {
    chunderRegion = (Object.values(Edge) as string[]).includes(edge)
      ? edgeToRegion[edge as Edge]
      : edge;
  }

  if (onDeprecated && deprecatedMessages.length) {
    setTimeout(() => onDeprecated(deprecatedMessages.join('\n')));
  }

  return !chunderRegion || chunderRegion === defaultRegion
    ? defaultChunderUri
    : `chunderw-vpc-gll-${chunderRegion}.twilio.com`;
}

/**
 * Get the region shortcode by its full AWS region string.
 *
 * @private
 * @param region - The region's full AWS string.
 */
export function getRegionShortcode(region: string): Region | null {
  return regionShortcodes[region] || null;
}
