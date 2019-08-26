const util = require('../util');

const ptToFixedBitrateAudioCodecName = {
  0: 'PCMU',
  8: 'PCMA'
};

const defaultOpusId = 111;
const BITRATE_MAX = 510000;
const BITRATE_MIN = 6000;

function setMaxAverageBitrate(sdp, maxAverageBitrate) {
  if (typeof maxAverageBitrate !== 'number'
      || maxAverageBitrate < BITRATE_MIN
      || maxAverageBitrate > BITRATE_MAX) {
    return sdp;
  }

  const matches = /a=rtpmap:(\d+) opus/gm.exec(sdp);
  const opusId = matches && matches.length ? matches[1] : defaultOpusId;
  const regex = new RegExp(`a=fmtp:${opusId}`);
  const lines = sdp.split('\n').map(line => regex.test(line)
    ? line + `;maxaveragebitrate=${maxAverageBitrate}`
    : line);

  return lines.join('\n');
}

/**
 * Return a new SDP string with the re-ordered codec preferences.
 * @param {string} sdp
 * @param {Array<AudioCodec>} preferredCodecs - If empty, the existing order
 *   of audio codecs is preserved
 * @returns {string} Updated SDP string
 */
function setCodecPreferences(sdp, preferredCodecs) {
  const mediaSections = getMediaSections(sdp);
  const session = sdp.split('\r\nm=')[0];
  return [session].concat(mediaSections.map(section => {
    // Codec preferences should not be applied to m=application sections.
    if (!/^m=(audio|video)/.test(section)) {
      return section;
    }
    const kind = section.match(/^m=(audio|video)/)[1];
    const codecMap = createCodecMapForMediaSection(section);
    const payloadTypes = getReorderedPayloadTypes(codecMap, preferredCodecs);
    const newSection = setPayloadTypesInMediaSection(payloadTypes, section);

    const pcmaPayloadTypes = codecMap.get('pcma') || [];
    const pcmuPayloadTypes = codecMap.get('pcmu') || [];
    const fixedBitratePayloadTypes = kind === 'audio'
      ? new Set(pcmaPayloadTypes.concat(pcmuPayloadTypes))
      : new Set();

    return fixedBitratePayloadTypes.has(payloadTypes[0])
      ? newSection.replace(/\r\nb=(AS|TIAS):([0-9]+)/g, '')
      : newSection;
  })).join('\r\n');
}

/**
 * Get the m= sections of a particular kind and direction from an sdp.
 * @param {string} sdp - SDP string
 * @param {string} [kind] - Pattern for matching kind
 * @param {string} [direction] - Pattern for matching direction
 * @returns {Array<string>} mediaSections
 */
function getMediaSections(sdp, kind, direction) {
  return sdp.replace(/\r\n\r\n$/, '\r\n').split('\r\nm=').slice(1).map(mediaSection => `m=${mediaSection}`).filter(mediaSection => {
    const kindPattern = new RegExp(`m=${kind || '.*'}`, 'gm');
    const directionPattern = new RegExp(`a=${direction || '.*'}`, 'gm');
    return kindPattern.test(mediaSection) && directionPattern.test(mediaSection);
  });
}

/**
 * Create a Codec Map for the given m= section.
 * @param {string} section - The given m= section
 * @returns {Map<Codec, Array<PT>>}
 */
function createCodecMapForMediaSection(section) {
  return Array.from(createPtToCodecName(section)).reduce((codecMap, pair) => {
    const pt = pair[0];
    const codecName = pair[1];
    const pts = codecMap.get(codecName) || [];
    return codecMap.set(codecName, pts.concat(pt));
  }, new Map());
}

/**
 * Create the reordered Codec Payload Types based on the preferred Codec Names.
 * @param {Map<Codec, Array<PT>>} codecMap - Codec Map
 * @param {Array<Codec>} preferredCodecs - Preferred Codec Names
 * @returns {Array<PT>} Reordered Payload Types
 */
function getReorderedPayloadTypes(codecMap, preferredCodecs) {
  preferredCodecs = preferredCodecs.map(codecName => codecName.toLowerCase());

  const preferredPayloadTypes = util.flatMap(preferredCodecs, codecName => codecMap.get(codecName) || []);

  const remainingCodecs = util.difference(Array.from(codecMap.keys()), preferredCodecs);
  const remainingPayloadTypes = util.flatMap(remainingCodecs, codecName => codecMap.get(codecName));

  return preferredPayloadTypes.concat(remainingPayloadTypes);
}

/**
 * Set the given Codec Payload Types in the first line of the given m= section.
 * @param {Array<PT>} payloadTypes - Payload Types
 * @param {string} section - Given m= section
 * @returns {string} - Updated m= section
 */
function setPayloadTypesInMediaSection(payloadTypes, section) {
  const lines = section.split('\r\n');
  let mLine = lines[0];
  const otherLines = lines.slice(1);
  mLine = mLine.replace(/([0-9]+\s?)+$/, payloadTypes.join(' '));
  return [mLine].concat(otherLines).join('\r\n');
}

/**
 * Create a Map from PTs to codec names for the given m= section.
 * @param {string} mediaSection - The given m= section.
 * @returns {Map<PT, Codec>} ptToCodecName
 */
function createPtToCodecName(mediaSection) {
  return getPayloadTypesInMediaSection(mediaSection).reduce((ptToCodecName, pt) => {
    const rtpmapPattern = new RegExp(`a=rtpmap:${pt} ([^/]+)`);
    const matches = mediaSection.match(rtpmapPattern);
    const codecName = matches
      ? matches[1].toLowerCase()
      : ptToFixedBitrateAudioCodecName[pt]
        ? ptToFixedBitrateAudioCodecName[pt].toLowerCase()
        : '';
    return ptToCodecName.set(pt, codecName);
  }, new Map());
}

/**
 * Get the Codec Payload Types present in the first line of the given m= section
 * @param {string} section - The m= section
 * @returns {Array<PT>} Payload Types
 */
function getPayloadTypesInMediaSection(section) {
  const mLine = section.split('\r\n')[0];

  // In "m=<kind> <port> <proto> <payload_type_1> <payload_type_2> ... <payload_type_n>",
  // the regex matches <port> and the PayloadTypes.
  const matches = mLine.match(/([0-9]+)/g);

  // This should not happen, but in case there are no PayloadTypes in
  // the m= line, return an empty array.
  if (!matches) {
    return [];
  }

  // Since only the PayloadTypes are needed, we discard the <port>.
  return matches.slice(1).map(match => parseInt(match, 10));
}

module.exports = { setCodecPreferences, setMaxAverageBitrate };
