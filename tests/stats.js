const sinon = require('sinon');
const assert = require('assert');
const getStats = require('../lib/twilio/rtc/stats');
const standardPayload = require('./payloads/rtcstatsreport.json');
const edgePayload = require('./payloads/rtcstatsreport-edge.json');
const legacyPayload = require('./payloads/rtcstatsresponse.json');
const MockRTCStatsReport = require('../lib/twilio/rtc/mockrtcstatsreport');

describe('getStats', () => {
  context('In standard browsers', () => {
    let stats;

    before(() => {
      const statsReport = MockRTCStatsReport.fromArray(standardPayload);
      const peerConnection = {
        getStats() { return Promise.resolve(statsReport); }
      };

      return getStats(peerConnection).then(_stats => {
        stats = _stats;
      });
    });

    it('should correctly transform a standard RTCStatsReport', () => {
      assert.deepEqual(stats, {
        codecName: 'PCMU',
        timestamp: 1492027598825.6,
        rtt: 86,
        jitter: 3,
        packetsLost: 41,
        packetsReceived: 61687,
        bytesReceived: 10610164,
        packetsSent: 61939,
        bytesSent: 10653508,
        localAddress: '107.20.226.156',
        remoteAddress: '54.172.60.184'
      });
    });
  });

  context('In Edge', () => {
    let stats;

    before(() => {
      const statsReport = MockRTCStatsReport.fromArray(edgePayload);
      const peerConnection = {
        getStats() { return Promise.resolve(statsReport); }
      };

      return getStats(peerConnection).then(_stats => {
        stats = _stats;
      });
    });

    it('should correctly transform an RTCStatsReport', () => {
      assert.deepEqual(stats, {
        codecName: 'opus',
        timestamp: 1492027598825.6,
        rtt: 86,
        jitter: 3,
        packetsLost: 41,
        packetsReceived: 61687,
        bytesReceived: 10610164,
        packetsSent: 61939,
        bytesSent: 10653508,
        localAddress: '107.20.226.156',
        remoteAddress: '54.172.60.184'
      });
    });
  });

  context('In old Chrome browsers', () => {
    let stats;

    before(() => {
      const statsReport = new RTCStatsResponse(legacyPayload);
      const peerConnection = {
        getStats(onSuccess) { onSuccess(statsReport); }
      };

      return getStats(peerConnection).then(_stats => {
        stats = _stats;
      });
    });

    it('should correctly transform a legacy RTCStatsResponse', () => {
      assert.deepEqual(stats, {
        codecName: 'PCMU',
        timestamp: 1492472862784,
        rtt: 85,
        jitter: 4,
        packetsLost: 0,
        packetsReceived: 24776,
        bytesReceived: 4261472,
        packetsSent: 24816,
        bytesSent: 4268352,
        localAddress: '107.20.226.156',
        remoteAddress: '54.172.60.181'
      });
    });
  });
});

function RTCStatsResponse(json) {
  this._result = json.map(item => new RTCLegacyStats(item));
}

RTCStatsResponse.prototype.result = function result() {
  return this._result;
}

function RTCLegacyStats(json) {
  this.id = json.id;
  this.type = json.type;
  this.timestamp = json.timestamp;
  this._stats = json.stats;
}

RTCLegacyStats.prototype.stat = function stat(name) {
  return this._stats[name];
}
