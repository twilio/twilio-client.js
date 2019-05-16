/* eslint-disable no-fallthrough */
const MockRTCStatsReport = require('./mockrtcstatsreport');

const ERROR_PEER_CONNECTION_NULL = 'PeerConnection is null';
const ERROR_WEB_RTC_UNSUPPORTED = 'WebRTC statistics are unsupported';

/**
 * @typedef {Object} StatsOptions
 * Used for testing to inject and extract methods.
 * @property {function} [createRTCSample] - Method for parsing an RTCStatsReport
 */
/**
 * Collects any WebRTC statistics for the given {@link PeerConnection}
 * @param {PeerConnection} peerConnection - Target connection.
 * @param {StatsOptions} options - List of custom options.
 * @return {Promise<RTCSample>} Universally-formatted version of RTC stats.
 */
function getStatistics(peerConnection, options) {
  options = Object.assign({
    createRTCSample
  }, options);

  if (!peerConnection) {
    return Promise.reject(new Error(ERROR_PEER_CONNECTION_NULL));
  }

  if (typeof peerConnection.getStats !== 'function') {
    return Promise.reject(new Error(ERROR_WEB_RTC_UNSUPPORTED));
  }

  let promise;
  try {
    promise = peerConnection.getStats();
  } catch (e) {
    promise = new Promise(resolve => peerConnection.getStats(resolve)).then(MockRTCStatsReport.fromRTCStatsResponse);
  }

  return promise.then(options.createRTCSample);
}

/**
 * @typedef {Object} RTCSample - A sample containing relevant WebRTC stats information.
 * @property {Number} [timestamp]
 * @property {String} [codecName] - MimeType name of the codec being used by the outbound audio stream
 * @property {Number} [rtt] - Round trip time
 * @property {Number} [jitter]
 * @property {Number} [packetsSent]
 * @property {Number} [packetsLost]
 * @property {Number} [packetsReceived]
 * @property {Number} [bytesReceived]
 * @property {Number} [bytesSent]
 * @property {Number} [localAddress]
 * @property {Number} [remoteAddress]
 */
function RTCSample() { }

/**
 * Create an RTCSample object from an RTCStatsReport
 * @private
 * @param {RTCStatsReport} statsReport
 * @returns {RTCSample}
 */
function createRTCSample(statsReport) {
  let activeTransportId = null;
  const sample = new RTCSample();
  let fallbackTimestamp;

  Array.from(statsReport.values()).forEach(stats => {
    // Skip isRemote tracks which will be phased out completely and break in FF66.
    if (stats.isRemote) { return; }

    // Firefox hack -- Older firefox doesn't have dashes in type names
    const type = stats.type.replace('-', '');

    fallbackTimestamp = fallbackTimestamp || stats.timestamp;

    // (rrowland) As I understand it, this is supposed to come in on remote-inbound-rtp but it's
    // currently coming in on remote-outbound-rtp, so I'm leaving this outside the switch until
    // the appropriate place to look is cleared up.
    if (stats.remoteId) {
      const remote = statsReport.get(stats.remoteId);
      if (remote && remote.roundTripTime) {
        sample.rtt = remote.roundTripTime;
      }
    }

    switch (type) {
      case 'inboundrtp':
        sample.timestamp = sample.timestamp || stats.timestamp;
        sample.jitter = stats.jitter * 1000;
        sample.packetsLost = stats.packetsLost;
        sample.packetsReceived = stats.packetsReceived;
        sample.bytesReceived = stats.bytesReceived;

        break;
      case 'outboundrtp':
        sample.timestamp = stats.timestamp;
        sample.packetsSent = stats.packetsSent;
        sample.bytesSent = stats.bytesSent;

        if (stats.codecId) {
          const codec = statsReport.get(stats.codecId);
          sample.codecName = codec
            ? codec.mimeType && codec.mimeType.match(/(.*\/)?(.*)/)[2]
            : stats.codecId;
        }

        break;
      case 'transport':
        if (stats.dtlsState === 'connected') {
          activeTransportId = stats.id;
        }
        break;
    }
  });

  if (!sample.timestamp) {
    sample.timestamp = fallbackTimestamp;
  }

  const activeTransport = statsReport.get(activeTransportId);
  if (!activeTransport) { return sample; }

  const selectedCandidatePair = statsReport.get(activeTransport.selectedCandidatePairId);
  if (!selectedCandidatePair) { return sample; }

  const localCandidate = statsReport.get(selectedCandidatePair.localCandidateId);
  const remoteCandidate = statsReport.get(selectedCandidatePair.remoteCandidateId);

  if (!sample.rtt) {
    sample.rtt = selectedCandidatePair && (selectedCandidatePair.currentRoundTripTime * 1000);
  }

  Object.assign(sample, {
    localAddress: localCandidate && localCandidate.ip,
    remoteAddress: remoteCandidate && remoteCandidate.ip,
  });

  return sample;
}

module.exports = getStatistics;
