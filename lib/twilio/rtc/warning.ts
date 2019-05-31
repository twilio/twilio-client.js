/**
 * @module Voice
 * @internalapi
 */

import RTCSample from './sample';

/**
 * Warning data for a stat
 * @private
 */
export default interface RTCWarning {
  /**
   * Name of the stat for this {@link RTCWarning}.
   */
  name?: string;

  /**
   * Threshold data for this {@link RTCWarning}.
   */
  threshold?: ThresholdWarningData;

  /**
   * Value for the stat in this {@link RTCWarning}.
   */
  value?: number;

  /**
   * A list of sample data
   */
  values?: RTCSample[];
}

/**
 * Threshold data for a {@link RTCWarning}.
 * @private
 */
interface ThresholdWarningData {
  /**
   * Name of this threshold
   */
  name: string;

  /**
   * Value for this threshold
   */
  value: number;
}
