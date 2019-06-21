"use strict";
/**
 * @module Voice
 * @internalapi
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || Object.assign || function(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
    }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
var events_1 = require("events");
var getRTCStats = require('./stats');
var Mos = require('./mos');
// How many samples we use when testing metric thresholds
var SAMPLE_COUNT_METRICS = 5;
// How many samples that need to cross the threshold to
// raise or clear a warning.
var SAMPLE_COUNT_CLEAR = 0;
var SAMPLE_COUNT_RAISE = 3;
var SAMPLE_INTERVAL = 1000;
var WARNING_TIMEOUT = 5 * 1000;
var DEFAULT_THRESHOLDS = {
    bytesReceived: { clearCount: 2, min: 1, raiseCount: 3, sampleCount: 3 },
    bytesSent: { clearCount: 2, min: 1, raiseCount: 3, sampleCount: 3 },
    jitter: { max: 30 },
    mos: { min: 3 },
    packetsLostFraction: { max: 1 },
    rtt: { max: 400 },
};
/**
 * Count the number of values that cross the max threshold.
 * @private
 * @param max - The max allowable value.
 * @param values - The values to iterate over.
 * @returns The amount of values in which the stat crossed the threshold.
 */
function countHigh(max, values) {
    return values.reduce(function (highCount, value) { return highCount += (value > max) ? 1 : 0; }, 0);
}
/**
 * Count the number of values that cross the min threshold.
 * @private
 * @param min - The minimum allowable value.
 * @param values - The values to iterate over.
 * @returns The amount of values in which the stat crossed the threshold.
 */
function countLow(min, values) {
    return values.reduce(function (lowCount, value) { return lowCount += (value < min) ? 1 : 0; }, 0);
}
/**
 * {@link RTCMonitor} polls a peerConnection via PeerConnection.getStats
 * and emits warnings when stats cross the specified threshold values.
 */
var RTCMonitor = /** @class */ (function (_super) {
    __extends(RTCMonitor, _super);
    /**
     * @constructor
     * @param [options] - Optional settings
     */
    function RTCMonitor(options) {
        var _this = _super.call(this) || this;
        /**
         * A map of warnings with their raised time
         */
        _this._activeWarnings = new Map();
        /**
         * A map of stats with the number of exceeded thresholds
         */
        _this._currentStreaks = new Map();
        /**
         * Sample buffer. Saves most recent samples
         */
        _this._sampleBuffer = [];
        /**
         * Whether warnings should be enabled
         */
        _this._warningsEnabled = true;
        options = options || {};
        _this._getRTCStats = options.getRTCStats || getRTCStats;
        _this._mos = options.Mos || Mos;
        _this._peerConnection = options.peerConnection;
        _this._thresholds = __assign({}, DEFAULT_THRESHOLDS, options.thresholds);
        var thresholdSampleCounts = Object.values(_this._thresholds)
            .map(function (threshold) { return threshold.sampleCount; })
            .filter(function (sampleCount) { return !!sampleCount; });
        _this._maxSampleCount = Math.max.apply(Math, [SAMPLE_COUNT_METRICS].concat(thresholdSampleCounts));
        if (_this._peerConnection) {
            _this.enable(_this._peerConnection);
        }
        return _this;
    }
    /**
     * Stop sampling RTC statistics for this {@link RTCMonitor}.
     * @returns The current {@link RTCMonitor}.
     */
    RTCMonitor.prototype.disable = function () {
        clearInterval(this._sampleInterval);
        delete this._sampleInterval;
        return this;
    };
    /**
     * Disable warnings for this {@link RTCMonitor}.
     * @returns The current {@link RTCMonitor}.
     */
    RTCMonitor.prototype.disableWarnings = function () {
        if (this._warningsEnabled) {
            this._activeWarnings.clear();
        }
        this._warningsEnabled = false;
        return this;
    };
    /**
     * Start sampling RTC statistics for this {@link RTCMonitor}.
     * @param peerConnection - A PeerConnection to monitor.
     * @returns The current {@link RTCMonitor}.
     */
    RTCMonitor.prototype.enable = function (peerConnection) {
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
     * Enable warnings for this {@link RTCMonitor}.
     * @returns The current {@link RTCMonitor}.
     */
    RTCMonitor.prototype.enableWarnings = function () {
        this._warningsEnabled = true;
        return this;
    };
    /**
     * Add a sample to our sample buffer and remove the oldest if we are over the limit.
     * @param sample - Sample to add
     */
    RTCMonitor.prototype._addSample = function (sample) {
        var samples = this._sampleBuffer;
        samples.push(sample);
        // We store 1 extra sample so that we always have (current, previous)
        // available for all {sampleBufferSize} threshold validations.
        if (samples.length > this._maxSampleCount) {
            samples.splice(0, samples.length - this._maxSampleCount);
        }
    };
    /**
     * Clear an active warning.
     * @param statName - The name of the stat to clear.
     * @param thresholdName - The name of the threshold to clear
     * @param [data] - Any relevant sample data.
     */
    RTCMonitor.prototype._clearWarning = function (statName, thresholdName, data) {
        var warningId = statName + ":" + thresholdName;
        var activeWarning = this._activeWarnings.get(warningId);
        if (!activeWarning || Date.now() - activeWarning.timeRaised < WARNING_TIMEOUT) {
            return;
        }
        this._activeWarnings.delete(warningId);
        this.emit('warning-cleared', __assign({}, data, { name: statName, threshold: {
                name: thresholdName,
                value: this._thresholds[statName][thresholdName],
            } }));
    };
    /**
     * Create a sample object from a stats object using the previous sample, if available.
     * @param stats - Stats retrieved from getStatistics
     * @param [previousSample=null] - The previous sample to use to calculate deltas.
     * @returns A universally-formatted version of RTC stats.
     */
    RTCMonitor.prototype._createSample = function (stats, previousSample) {
        var previousBytesSent = previousSample && previousSample.totals.bytesSent || 0;
        var previousBytesReceived = previousSample && previousSample.totals.bytesReceived || 0;
        var previousPacketsSent = previousSample && previousSample.totals.packetsSent || 0;
        var previousPacketsReceived = previousSample && previousSample.totals.packetsReceived || 0;
        var previousPacketsLost = previousSample && previousSample.totals.packetsLost || 0;
        var currentBytesSent = stats.bytesSent - previousBytesSent;
        var currentBytesReceived = stats.bytesReceived - previousBytesReceived;
        var currentPacketsSent = stats.packetsSent - previousPacketsSent;
        var currentPacketsReceived = stats.packetsReceived - previousPacketsReceived;
        var currentPacketsLost = stats.packetsLost - previousPacketsLost;
        var currentInboundPackets = currentPacketsReceived + currentPacketsLost;
        var currentPacketsLostFraction = (currentInboundPackets > 0) ?
            (currentPacketsLost / currentInboundPackets) * 100 : 0;
        var totalInboundPackets = stats.packetsReceived + stats.packetsLost;
        var totalPacketsLostFraction = (totalInboundPackets > 0) ?
            (stats.packetsLost / totalInboundPackets) * 100 : 100;
        var rttValue = (typeof stats.rtt === 'number' || !previousSample) ? stats.rtt : previousSample.rtt;
        return {
            bytesReceived: currentBytesReceived,
            bytesSent: currentBytesSent,
            codecName: stats.codecName,
            jitter: stats.jitter,
            mos: this._mos.calculate(rttValue, stats.jitter, previousSample && currentPacketsLostFraction),
            packetsLost: currentPacketsLost,
            packetsLostFraction: currentPacketsLostFraction,
            packetsReceived: currentPacketsReceived,
            packetsSent: currentPacketsSent,
            rtt: rttValue,
            timestamp: stats.timestamp,
            totals: {
                bytesReceived: stats.bytesReceived,
                bytesSent: stats.bytesSent,
                packetsLost: stats.packetsLost,
                packetsLostFraction: totalPacketsLostFraction,
                packetsReceived: stats.packetsReceived,
                packetsSent: stats.packetsSent,
            },
        };
    };
    /**
     * Get stats from the PeerConnection and add it to our list of samples.
     */
    RTCMonitor.prototype._fetchSample = function () {
        var _this = this;
        this._getSample().then(function (sample) {
            _this._addSample(sample);
            _this._raiseWarnings();
            _this.emit('sample', sample);
        }).catch(function (error) {
            _this.disable();
            _this.emit('error', error);
        });
    };
    /**
     * Get stats from the PeerConnection.
     * @returns A universally-formatted version of RTC stats.
     */
    RTCMonitor.prototype._getSample = function () {
        var _this = this;
        return this._getRTCStats(this._peerConnection).then(function (stats) {
            var previousSample = null;
            if (_this._sampleBuffer.length) {
                previousSample = _this._sampleBuffer[_this._sampleBuffer.length - 1];
            }
            return _this._createSample(stats, previousSample);
        });
    };
    /**
     * Raise a warning and log its raised time.
     * @param statName - The name of the stat to raise.
     * @param thresholdName - The name of the threshold to raise
     * @param [data] - Any relevant sample data.
     */
    RTCMonitor.prototype._raiseWarning = function (statName, thresholdName, data) {
        var warningId = statName + ":" + thresholdName;
        if (this._activeWarnings.has(warningId)) {
            return;
        }
        this._activeWarnings.set(warningId, { timeRaised: Date.now() });
        this.emit('warning', __assign({}, data, { name: statName, threshold: {
                name: thresholdName,
                value: this._thresholds[statName][thresholdName],
            } }));
    };
    /**
     * Apply our thresholds to our array of RTCStat samples.
     */
    RTCMonitor.prototype._raiseWarnings = function () {
        var _this = this;
        if (!this._warningsEnabled) {
            return;
        }
        Object.keys(this._thresholds).forEach(function (name) { return _this._raiseWarningsForStat(name); });
    };
    /**
     * Apply thresholds for a given stat name to our array of
     * RTCStat samples and raise or clear any associated warnings.
     * @param statName - Name of the stat to compare.
     */
    RTCMonitor.prototype._raiseWarningsForStat = function (statName) {
        var samples = this._sampleBuffer;
        var limits = this._thresholds[statName];
        var clearCount = limits.clearCount || SAMPLE_COUNT_CLEAR;
        var raiseCount = limits.raiseCount || SAMPLE_COUNT_RAISE;
        var sampleCount = limits.sampleCount || this._maxSampleCount;
        var relevantSamples = samples.slice(-sampleCount);
        var values = relevantSamples.map(function (sample) { return sample[statName]; });
        // (rrowland) If we have a bad or missing value in the set, we don't
        // have enough information to throw or clear a warning. Bail out.
        var containsNull = values.some(function (value) { return typeof value === 'undefined' || value === null; });
        if (containsNull) {
            return;
        }
        var count;
        if (typeof limits.max === 'number') {
            count = countHigh(limits.max, values);
            if (count >= raiseCount) {
                this._raiseWarning(statName, 'max', { values: values });
            }
            else if (count <= clearCount) {
                this._clearWarning(statName, 'max', { values: values });
            }
        }
        if (typeof limits.min === 'number') {
            count = countLow(limits.min, values);
            if (count >= raiseCount) {
                this._raiseWarning(statName, 'min', { values: values });
            }
            else if (count <= clearCount) {
                this._clearWarning(statName, 'min', { values: values });
            }
        }
        if (typeof limits.maxDuration === 'number' && samples.length > 1) {
            relevantSamples = samples.slice(-2);
            var prevValue = relevantSamples[0][statName];
            var curValue = relevantSamples[1][statName];
            var prevStreak = this._currentStreaks.get(statName) || 0;
            var streak = (prevValue === curValue) ? prevStreak + 1 : 0;
            this._currentStreaks.set(statName, streak);
            if (streak >= limits.maxDuration) {
                this._raiseWarning(statName, 'maxDuration', { value: streak });
            }
            else if (streak === 0) {
                this._clearWarning(statName, 'maxDuration', { value: prevStreak });
            }
        }
    };
    return RTCMonitor;
}(events_1.EventEmitter));
exports.default = RTCMonitor;
//# sourceMappingURL=monitor.js.map