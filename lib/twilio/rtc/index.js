const PeerConnection = require('./peerconnection');
const { test } = require('./rtcpc');

function enabled() {
  return test();
}

function getMediaEngine() {
  return typeof RTCIceGatherer !== 'undefined' ? 'ORTC' : 'WebRTC';
}

module.exports = {
  enabled,
  getMediaEngine,
  PeerConnection
};
