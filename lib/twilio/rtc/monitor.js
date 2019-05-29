const EventEmitter = require('events').EventEmitter;
const getStatistics = require('./stats');
const inherits = require('util').inherits;
const Mos = require('./mos');

// Inactivity wait duration before we raise ice 'disconnect'
const ICE_DISCONNECT_THRESHOLD = 3000;

// How many samples we use when testing metric thresholds
const SAMPLE_COUNT_METRICS = 5;

// How many samples that need to cross the threshold to
// raise or clear a warning.
const SAMPLE_COUNT_CLEAR = 0;
const SAMPLE_COUNT_RAISE = 3;

const SAMPLE_INTERVAL = 1000;
const WARNING_TIMEOUT = 5 * 1000;

/**
 * @typedef {Object} RTCMonitor.ThresholdOptions
 * @property {RTCMonitor.ThresholdOption} [packetsLostFraction] - Rules to apply to sample.packetsLostFraction
 * @property {RTCMonitor.ThresholdOption} [jitter] - Rules to apply to sample.jitter
 * @property {RTCMonitor.ThresholdOption} [rtt] - Rules to apply to sample.rtt
 * @property {RTCMonitor.ThresholdOption} [mos] - Rules to apply to sample.mos
 *//**
 * @typedef {Object} RTCMonitor.ThresholdOption
 * @property {?Number} [min] - Warning will be raised if tracked metric falls below this value.
 * @property {?Number} [max] - Warning will be raised if tracked metric rises above this value.
 * @property {?Number} [maxDuration] - Warning will be raised if tracked metric stays constant for
 *   the specified number of consequent samples.
 */
const DEFAULT_THRESHOLDS = {
  packetsLostFraction: { max: 1 },
  jitter: { max: 30 },
  rtt: { max: 400 },
  mos: { min: 3 }
};

/**
 * RTCMonitor polls a peerConnection via PeerConnection.getStats
 * and emits warnings when stats cross the specified threshold values.
 * @constructor
 * @param {RTCMonitor.Options} [options] - Config options for RTCMonitor.
 *//**
 * @typedef {Object} RTCMonitor.Options
 * @property {PeerConnection} [peerConnection] - The PeerConnection to monitor.
 * @property {RTCMonitor.ThresholdOptions} [thresholds] - Optional custom threshold values.
 */
function RTCMonitor(options) {
  if (!(this instanceof RTCMonitor)) {
    return new RTCMonitor(options);
  }

  options = options || { };
  const thresholds = Object.assign({ }, DEFAULT_THRESHOLDS, options.thresholds);

  Object.defineProperties(this, {
    _activeWarnings: { value: new Map() },
    _currentStreaks: { value: new Map() },
    _lastDisconnect: { value: 0, writable: true },
    _peerConnection: { value: options.peerConnection, writable: true },
    _sampleBuffer: { value: [] },
    _sampleInterval: { value: null, writable: true },
    _thresholds: { value: thresholds },
    _warningsEnabled: { value: true, writable: true }
  });

  if (options.peerConnection) {
    this.enable();
  }

  EventEmitter.call(this);
}

inherits(RTCMonitor, EventEmitter);

/**
 * Create a sample object from a stats object using the previous sample,
 *   if available.
 * @param {Object} stats - Stats retrieved from getStatistics
 * @param {?Object} [previousSample=null] - The previous sample to use to calculate deltas.
 * @returns {Promise<RTCSample>}
 */
RTCMonitor.createSample = function createSample(stats, previousSample) {
  const previousPacketsSent = previousSample && previousSample.totals.packetsSent || 0;
  const previousPacketsReceived = previousSample && previousSample.totals.packetsReceived || 0;
  const previousPacketsLost = previousSample && previousSample.totals.packetsLost || 0;

  const currentPacketsSent = stats.packetsSent - previousPacketsSent;
  const currentPacketsReceived = stats.packetsReceived - previousPacketsReceived;
  const currentPacketsLost = stats.packetsLost - previousPacketsLost;
  const currentInboundPackets = currentPacketsReceived + currentPacketsLost;
  const currentPacketsLostFraction = (currentInboundPackets > 0) ?
    (currentPacketsLost / currentInboundPackets) * 100 : 0;

  const totalInboundPackets = stats.packetsReceived + stats.packetsLost;
  const totalPacketsLostFraction = (totalInboundPackets > 0) ?
    (stats.packetsLost / totalInboundPackets) * 100 : 100;

  const rtt = (typeof stats.rtt === 'number' || !previousSample) ? stats.rtt : previousSample.rtt;

  return {
    timestamp: stats.timestamp,
    totals: {
      packetsReceived: stats.packetsReceived,
      packetsLost: stats.packetsLost,
      packetsSent: stats.packetsSent,
      packetsLostFraction: totalPacketsLostFraction,
      bytesReceived: stats.bytesReceived,
      bytesSent: stats.bytesSent
    },
    packetsSent: currentPacketsSent,
    packetsReceived: currentPacketsReceived,
    packetsLost: currentPacketsLost,
    packetsLostFraction: currentPacketsLostFraction,
    jitter: stats.jitter,
    rtt: rtt,
    mos: Mos.calculate(rtt, stats.jitter, previousSample && currentPacketsLostFraction),
    codecName: stats.codecName,
  };
};

/**
 * Start sampling RTC statistics for this {@link RTCMonitor}.
 * @param {PeerConnection} [peerConnection] - A PeerConnection to monitor.
 * @throws {Error} Attempted to replace an existing PeerConnection in RTCMonitor.enable
 * @throws {Error} Can not enable RTCMonitor without a PeerConnection
 * @returns {RTCMonitor} This RTCMonitor instance.
 */
RTCMonitor.prototype.enable = function enable(peerConnection) {
  if (peerConnection) {
    if (this._peerConnection && peerConnection !== this._peerConnection) {
      throw new Error('Attempted to replace an existing PeerConnection in RTCMonitor.enable');
    }

    this._peerConnection = peerConnection;
  }

  if (!this._peerConnection) {
    throw new Error('Can not enable RTCMonitor without a PeerConnection');
  }

  this._sampleInterval = this._sampleInterval ||
    setInterval(this._fetchSample.bind(this), SAMPLE_INTERVAL);

  return this;
};

/**
 * Stop sampling RTC statistics for this {@link RTCMonitor}.
 * @returns {RTCMonitor} This RTCMonitor instance.
 */
RTCMonitor.prototype.disable = function disable() {
  clearInterval(this._sampleInterval);
  this._sampleInterval = null;

  return this;
};

/**
 * Get stats from the PeerConnection.
 * @returns {Promise<RTCSample>} A universally-formatted version of RTC stats.
 */
RTCMonitor.prototype.getSample = function getSample() {
  const pc = this._peerConnection;
  const self = this;

  return getStatistics(pc).then(stats => {
    const previousSample = self._sampleBuffer.length &&
      self._sampleBuffer[self._sampleBuffer.length - 1];

    return RTCMonitor.createSample(stats, previousSample);
  });
};

/**
 * Get stats from the PeerConnection and add it to our list of samples.
 * @private
 * @returns {Promise<Object>} A universally-formatted version of RTC stats.
 */
RTCMonitor.prototype._fetchSample = function _fetchSample() {
  const self = this;

  return this.getSample().then(
    function addSample(sample) {
      self._addSample(sample);
      self._checkIceConnection();
      self._raiseWarnings();
      self.emit('sample', sample);
      return sample;
    },
    function getSampleFailed(error) {
      self.disable();
      self.emit('error', error);
    }
  );
};

/**
 * Add a sample to our sample buffer and remove the oldest if
 *   we are over the limit.
 * @private
 * @param {Object} sample - Sample to add
 */
RTCMonitor.prototype._addSample = function _addSample(sample) {
  const samples = this._sampleBuffer;
  samples.push(sample);

  // We store 1 extra sample so that we always have (current, previous)
  // available for all {sampleBufferSize} threshold validations.
  if (samples.length > SAMPLE_COUNT_METRICS) {
    samples.splice(0, samples.length - SAMPLE_COUNT_METRICS);
  }
};

/**
 * Raise disconnect event base on bytes sent and received
 * @private
 */
RTCMonitor.prototype._checkIceConnection = function _checkIceConnection() {
  // How many samples we need to check within the last few seconds (ICE_DISCONNECT_THRESHOLD)
  const samplesNeeded = Math.floor(ICE_DISCONNECT_THRESHOLD / SAMPLE_INTERVAL);

  // Grab the samples we need starting from most recent.
  const sampleBytes = this._sampleBuffer.slice(this._sampleBuffer.length - samplesNeeded)
    .map(sample => ({ sent: sample.totals.bytesSent, received: sample.totals.bytesReceived }));

  // No enough samples
  if (sampleBytes.length < samplesNeeded && this._sampleBuffer.length < SAMPLE_COUNT_METRICS) {
    return;
  }

  const noActivity = sampleBytes.every(bytes => sampleBytes[0].sent === bytes.sent) ||
    sampleBytes.every(bytes => sampleBytes[0].received === bytes.received);

  if (noActivity && Date.now() - this._lastDisconnect >= ICE_DISCONNECT_THRESHOLD) {
    this._lastDisconnect = Date.now();
    this.emit('disconnect', this._peerConnection);
  }
};

/**
 * Apply our thresholds to our array of RTCStat samples.
 * @private
 */
RTCMonitor.prototype._raiseWarnings = function _raiseWarnings() {
  if (!this._warningsEnabled) { return; }

  for (const name in this._thresholds) {
    this._raiseWarningsForStat(name);
  }
};

/**
 * Enable warning functionality.
 * @returns {RTCMonitor}
 */
RTCMonitor.prototype.enableWarnings = function enableWarnings() {
  this._warningsEnabled = true;
  return this;
};

/**
 * Disable warning functionality.
 * @returns {RTCMonitor}
 */
RTCMonitor.prototype.disableWarnings = function disableWarnings() {
  if (this._warningsEnabled) {
    this._activeWarnings.clear();
  }

  this._warningsEnabled = false;
  return this;
};

/**
 * Apply thresholds for a given stat name to our array of
 *   RTCStat samples and raise or clear any associated warnings.
 * @private
 * @param {String} statName - Name of the stat to compare.
 */
RTCMonitor.prototype._raiseWarningsForStat = function _raiseWarningsForStat(statName) {
  const samples = this._sampleBuffer;
  const limits = this._thresholds[statName];

  let relevantSamples = samples.slice(-SAMPLE_COUNT_METRICS);
  const values = relevantSamples.map(sample => sample[statName]);

  // (rrowland) If we have a bad or missing value in the set, we don't
  // have enough information to throw or clear a warning. Bail out.
  const containsNull = values.some(value => typeof value === 'undefined' || value === null);

  if (containsNull) {
    return;
  }

  let count;
  if (typeof limits.max === 'number') {
    count = countHigh(limits.max, values);
    if (count >= SAMPLE_COUNT_RAISE) {
      this._raiseWarning(statName, 'max', { values });
    } else if (count <= SAMPLE_COUNT_CLEAR) {
      this._clearWarning(statName, 'max', { values });
    }
  }

  if (typeof limits.min === 'number') {
    count = countLow(limits.min, values);
    if (count >= SAMPLE_COUNT_RAISE) {
      this._raiseWarning(statName, 'min', { values });
    } else if (count <= SAMPLE_COUNT_CLEAR) {
      this._clearWarning(statName, 'min', { values });
    }
  }

  if (typeof limits.maxDuration === 'number' && samples.length > 1) {
    relevantSamples = samples.slice(-2);
    const prevValue = relevantSamples[0][statName];
    const curValue = relevantSamples[1][statName];

    const prevStreak = this._currentStreaks.get(statName) || 0;
    const streak = (prevValue === curValue) ? prevStreak + 1 : 0;

    this._currentStreaks.set(statName, streak);

    if (streak >= limits.maxDuration) {
      this._raiseWarning(statName, 'maxDuration', { value: streak });
    } else if (streak === 0) {
      this._clearWarning(statName, 'maxDuration', { value: prevStreak });
    }
  }
};

/**
 * Count the number of values that cross the min threshold.
 * @private
 * @param {Number} min - The minimum allowable value.
 * @param {Array<Number>} values - The values to iterate over.
 * @returns {Number} The amount of values in which the stat
 *   crossed the threshold.
 */
function countLow(min, values) {
  // eslint-disable-next-line no-return-assign
  return values.reduce((lowCount, value) => lowCount += (value < min) ? 1 : 0, 0);
}

/**
 * Count the number of values that cross the max threshold.
 * @private
 * @param {Number} max - The max allowable value.
 * @param {Array<Number>} values - The values to iterate over.
 * @returns {Number} The amount of values in which the stat
 *   crossed the threshold.
 */
function countHigh(max, values) {
  // eslint-disable-next-line no-return-assign
  return values.reduce((highCount, value) => highCount += (value > max) ? 1 : 0, 0);
}

/**
 * Clear an active warning.
 * @param {String} statName - The name of the stat to clear.
 * @param {String} thresholdName - The name of the threshold to clear
 * @param {?Object} [data] - Any relevant sample data.
 * @private
 */
RTCMonitor.prototype._clearWarning = function _clearWarning(statName, thresholdName, data) {
  const warningId = `${statName}:${thresholdName}`;
  const activeWarning = this._activeWarnings.get(warningId);

  if (!activeWarning || Date.now() - activeWarning.timeRaised < WARNING_TIMEOUT) { return; }
  this._activeWarnings.delete(warningId);

  this.emit('warning-cleared', Object.assign({
    name: statName,
    threshold: {
      name: thresholdName,
      value: this._thresholds[statName][thresholdName]
    }
  }, data));
};

/**
 * Raise a warning and log its raised time.
 * @param {String} statName - The name of the stat to raise.
 * @param {String} thresholdName - The name of the threshold to raise
 * @param {?Object} [data] - Any relevant sample data.
 * @private
 */
RTCMonitor.prototype._raiseWarning = function _raiseWarning(statName, thresholdName, data) {
  const warningId = `${statName}:${thresholdName}`;

  if (this._activeWarnings.has(warningId)) { return; }
  this._activeWarnings.set(warningId, { timeRaised: Date.now() });

  this.emit('warning', Object.assign({
    name: statName,
    threshold: {
      name: thresholdName,
      value: this._thresholds[statName][thresholdName]
    }
  }, data));
};

module.exports = RTCMonitor;
