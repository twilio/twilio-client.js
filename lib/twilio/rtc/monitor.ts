/**
 * @module Voice
 * @internalapi
 */

import { EventEmitter } from 'events';
import RTCSample from './sample';
import RTCWarning from './warning';

const getRTCStats = require('./stats');
const Mos = require('./mos');

// How many samples we use when testing metric thresholds
const SAMPLE_COUNT_METRICS = 5;

// How many samples that need to cross the threshold to
// raise or clear a warning.
const SAMPLE_COUNT_CLEAR = 0;
const SAMPLE_COUNT_RAISE = 3;

const SAMPLE_INTERVAL = 1000;
const WARNING_TIMEOUT = 5 * 1000;

const DEFAULT_THRESHOLDS: RTCMonitor.ThresholdOptions = {
  bytesReceived: { clearCount: 2, min: 1, raiseCount: 3, sampleCount: 3 },
  bytesSent: { clearCount: 2, min: 1, raiseCount: 3, sampleCount: 3 },
  jitter: { max: 30 },
  mos: { min: 3 },
  packetsLostFraction: { max: 1 },
  rtt: { max: 400 },
};

// Placeholders until we convert the respective files to TypeScript.
/**
 * @private
 */
export type IPeerConnection = any;

/**
 * @private
 */
export type IRTCStats = any;

/**
 * @private
 */
export type IMos = any;

/**
 * Count the number of values that cross the max threshold.
 * @private
 * @param max - The max allowable value.
 * @param values - The values to iterate over.
 * @returns The amount of values in which the stat crossed the threshold.
 */
function countHigh(max: number, values: number[]): number {
  return values.reduce((highCount, value) => highCount += (value > max) ? 1 : 0, 0);
}

/**
 * Count the number of values that cross the min threshold.
 * @private
 * @param min - The minimum allowable value.
 * @param values - The values to iterate over.
 * @returns The amount of values in which the stat crossed the threshold.
 */
function countLow(min: number, values: number[]): number {
  return values.reduce((lowCount, value) => lowCount += (value < min) ? 1 : 0, 0);
}

/**
 * {@link RTCMonitor} polls a peerConnection via PeerConnection.getStats
 * and emits warnings when stats cross the specified threshold values.
 */
class RTCMonitor extends EventEmitter {
  /**
   * A map of warnings with their raised time
   */
  private _activeWarnings: Map<string, RTCMonitor.WarningTimestamp> = new Map();

  /**
   * A map of stats with the number of exceeded thresholds
   */
  private _currentStreaks: Map<string, number> = new Map();

  /**
   * Method to get stats from a PeerConnection object. Overrides getRTCStats library
   */
  private _getRTCStats: (peerConnection: IPeerConnection) => IRTCStats;

  /**
   * For calculating Mos. Overrides Mos library
   */
  private _mos: IMos;

  /**
   * The PeerConnection to monitor.
   */
  private _peerConnection: IPeerConnection;

  /**
   * Sample buffer. Saves most recent samples
   */
  private _sampleBuffer: RTCSample[] = [];

  /**
   * The setInterval id for fetching samples.
   */
  private _sampleInterval: NodeJS.Timer;

  /**
   * // How many samples we use when testing metric thresholds.
   */
  private _maxSampleCount: number;

  /**
   * Threshold values for {@link RTCMonitor}
   */
  private _thresholds: RTCMonitor.ThresholdOptions;

  /**
   * Whether warnings should be enabled
   */
  private _warningsEnabled: boolean = true;

  /**
   * @constructor
   * @param [options] - Optional settings
   */
  constructor(options?: RTCMonitor.Options) {
    super();

    options = options || {};
    this._getRTCStats = options.getRTCStats || getRTCStats;
    this._mos = options.Mos || Mos;
    this._peerConnection = options.peerConnection;
    this._thresholds = {...DEFAULT_THRESHOLDS, ...options.thresholds};

    const thresholdSampleCounts = Object.values(this._thresholds)
      .map((threshold: RTCMonitor.ThresholdOptions) => threshold.sampleCount)
      .filter((sampleCount: number | undefined) => !!sampleCount);

    this._maxSampleCount = Math.max(SAMPLE_COUNT_METRICS, ...thresholdSampleCounts);

    if (this._peerConnection) {
      this.enable(this._peerConnection);
    }
  }

  /**
   * Start sampling RTC statistics for this {@link RTCMonitor}.
   * @param peerConnection - A PeerConnection to monitor.
   * @returns The current {@link RTCMonitor}.
   */
  enable(peerConnection: IPeerConnection): this {
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
  }

  /**
   * Enable warnings for this {@link RTCMonitor}.
   * @returns The current {@link RTCMonitor}.
   */
  enableWarnings(): this {
    this._warningsEnabled = true;
    return this;
  }

  /**
   * Stop sampling RTC statistics for this {@link RTCMonitor}.
   * @returns The current {@link RTCMonitor}.
   */
  disable(): this {
    clearInterval(this._sampleInterval);
    delete this._sampleInterval;

    return this;
  }

  /**
   * Disable warnings for this {@link RTCMonitor}.
   * @returns The current {@link RTCMonitor}.
   */
  disableWarnings(): this {
    if (this._warningsEnabled) {
      this._activeWarnings.clear();
    }

    this._warningsEnabled = false;
    return this;
  }

  /**
   * Add a sample to our sample buffer and remove the oldest if we are over the limit.
   * @param sample - Sample to add
   */
  private _addSample(sample: RTCSample): void {
    const samples = this._sampleBuffer;
    samples.push(sample);

    // We store 1 extra sample so that we always have (current, previous)
    // available for all {sampleBufferSize} threshold validations.
    if (samples.length > this._maxSampleCount) {
      samples.splice(0, samples.length - this._maxSampleCount);
    }
  }

  /**
   * Clear an active warning.
   * @param statName - The name of the stat to clear.
   * @param thresholdName - The name of the threshold to clear
   * @param [data] - Any relevant sample data.
   */
  private _clearWarning(statName: string, thresholdName: string, data?: RTCWarning): void {
    const warningId = `${statName}:${thresholdName}`;
    const activeWarning = this._activeWarnings.get(warningId);

    if (!activeWarning || Date.now() - activeWarning.timeRaised < WARNING_TIMEOUT) { return; }
    this._activeWarnings.delete(warningId);

    this.emit('warning-cleared', {
      ...data,
      name: statName,
      threshold: {
        name: thresholdName,
        value: this._thresholds[statName][thresholdName],
      },
    });
  }

  /**
   * Create a sample object from a stats object using the previous sample, if available.
   * @param stats - Stats retrieved from getStatistics
   * @param [previousSample=null] - The previous sample to use to calculate deltas.
   * @returns A universally-formatted version of RTC stats.
   */
  private _createSample(stats: IRTCStats, previousSample: RTCSample | null): RTCSample {
    const previousBytesSent = previousSample && previousSample.totals.bytesSent || 0;
    const previousBytesReceived = previousSample && previousSample.totals.bytesReceived || 0;
    const previousPacketsSent = previousSample && previousSample.totals.packetsSent || 0;
    const previousPacketsReceived = previousSample && previousSample.totals.packetsReceived || 0;
    const previousPacketsLost = previousSample && previousSample.totals.packetsLost || 0;

    const currentBytesSent = stats.bytesSent - previousBytesSent;
    const currentBytesReceived = stats.bytesReceived - previousBytesReceived;
    const currentPacketsSent = stats.packetsSent - previousPacketsSent;
    const currentPacketsReceived = stats.packetsReceived - previousPacketsReceived;
    const currentPacketsLost = stats.packetsLost - previousPacketsLost;
    const currentInboundPackets = currentPacketsReceived + currentPacketsLost;
    const currentPacketsLostFraction = (currentInboundPackets > 0) ?
      (currentPacketsLost / currentInboundPackets) * 100 : 0;

    const totalInboundPackets = stats.packetsReceived + stats.packetsLost;
    const totalPacketsLostFraction = (totalInboundPackets > 0) ?
      (stats.packetsLost / totalInboundPackets) * 100 : 100;

    const rttValue = (typeof stats.rtt === 'number' || !previousSample) ? stats.rtt : previousSample.rtt;

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
  }

  /**
   * Get stats from the PeerConnection and add it to our list of samples.
   */
  private _fetchSample(): void {
    this._getSample().then(sample => {
      this._addSample(sample);
      this._raiseWarnings();
      this.emit('sample', sample);
    }).catch(error => {
      this.disable();
      this.emit('error', error);
    });
  }

  /**
   * Get stats from the PeerConnection.
   * @returns A universally-formatted version of RTC stats.
   */
  private _getSample(): Promise<RTCSample> {
    return this._getRTCStats(this._peerConnection).then((stats: IRTCStats) => {
      let previousSample = null;
      if (this._sampleBuffer.length) {
        previousSample = this._sampleBuffer[this._sampleBuffer.length - 1];
      }

      return this._createSample(stats, previousSample);
    });
  }

  /**
   * Raise a warning and log its raised time.
   * @param statName - The name of the stat to raise.
   * @param thresholdName - The name of the threshold to raise
   * @param [data] - Any relevant sample data.
   */
  private _raiseWarning(statName: string, thresholdName: string, data?: RTCWarning): void {
    const warningId = `${statName}:${thresholdName}`;

    if (this._activeWarnings.has(warningId)) { return; }
    this._activeWarnings.set(warningId, { timeRaised: Date.now() });

    this.emit('warning', {
      ...data,
      name: statName,
      threshold: {
        name: thresholdName,
        value: this._thresholds[statName][thresholdName],
      },
    });
  }

  /**
   * Apply our thresholds to our array of RTCStat samples.
   */
  private _raiseWarnings(): void {
    if (!this._warningsEnabled) { return; }

    Object.keys(this._thresholds).forEach(name => this._raiseWarningsForStat(name));
  }

  /**
   * Apply thresholds for a given stat name to our array of
   * RTCStat samples and raise or clear any associated warnings.
   * @param statName - Name of the stat to compare.
   */
  private _raiseWarningsForStat(statName: string): void {
    const samples = this._sampleBuffer;
    const limits = this._thresholds[statName];

    const clearCount = limits.clearCount || SAMPLE_COUNT_CLEAR;
    const raiseCount = limits.raiseCount || SAMPLE_COUNT_RAISE;
    const sampleCount = limits.sampleCount || this._maxSampleCount;

    let relevantSamples = samples.slice(-sampleCount);
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
      if (count >= raiseCount) {
        this._raiseWarning(statName, 'max', { values });
      } else if (count <= clearCount) {
        this._clearWarning(statName, 'max', { values });
      }
    }

    if (typeof limits.min === 'number') {
      count = countLow(limits.min, values);
      if (count >= raiseCount) {
        this._raiseWarning(statName, 'min', { values });
      } else if (count <= clearCount) {
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
  }
}

namespace RTCMonitor {
  /**
   * Config options to be passed to the {@link RTCMonitor} constructor.
   * @private
   */
  export interface Options {
    /**
     * Method to get stats from a PeerConnection object
     */
    getRTCStats?: (peerConnection: IPeerConnection) => IRTCStats;

    /**
     * For calculating Mos. Overrides Mos library
     */
    Mos?: IMos;

    /**
     * The PeerConnection to monitor.
     */
    peerConnection?: IPeerConnection;

    /**
     * Optional custom threshold values.
     */
    thresholds?: ThresholdOptions;
  }

  /**
   * Speficic threshold value for {@link ThresholdOptions}
   * @private
   */
  export interface ThresholdOption {
    /**
     * How many samples that need to cross the threshold to clear a warning.
     * Overrides SAMPLE_COUNT_CLEAR
     */
    clearCount?: number;

    /**
     * Warning will be raised if tracked metric rises above this value.
     */
    max?: number;

    /**
     * Warning will be raised if tracked metric stays constant for
     * the specified number of consequent samples.
     */
    maxDuration?: number;

    /**
     * Warning will be raised if tracked metric falls below this value.
     */
    min?: number;

    /**
     * How many samples that need to cross the threshold to raise a warning.
     * Overrides SAMPLE_COUNT_RAISE
     */
    raiseCount?: number;

    /**
     * How many samples we use when testing metric thresholds.
     * Overrides _maxSampleCount
     */
    sampleCount?: number;
  }

  /**
   * Threshold values for {@link RTCMonitor}
   * @private
   */
  export interface ThresholdOptions {
    [key: string]: any;

    /**
     * Rules to apply to sample.jitter
     */
    jitter?: ThresholdOption;

    /**
     * Rules to apply to sample.mos
     */
    mos?: ThresholdOption;

    /**
     * Rules to apply to sample.packetsLostFraction
     */
    packetsLostFraction?: ThresholdOption;

    /**
     * Rules to apply to sample.rtt
     */
    rtt?: ThresholdOption;
  }

  /**
   * Timestamp for raised warnings
   * @private
   */
  export interface WarningTimestamp {
    /**
     * Timestamp in milliseconds
     */
    timeRaised: number;
  }
}

export default RTCMonitor;
