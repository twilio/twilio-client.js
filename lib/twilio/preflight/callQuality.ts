/**
 * @packageDocumentation
 * @module Voice
 * @publicapi
 */

/**
 * The quality of the call determined by different mos ranges.
 * Mos is calculated base on the WebRTC stats - rtt, jitter, and packet lost.
 */
enum CallQuality {
  /**
   * If the average mos is over 4.2.
   */
  Excellent = 'excellent',

  /**
   * If the average mos is between 4.1 and 4.2 both inclusive.
   */
  Great = 'great',

  /**
   * If the average mos is between 3.7 and 4.0 both inclusive.
   */
  Good = 'good',

  /**
   * If the average mos is between 3.1 and 3.6 both inclusive.
   */
  Fair = 'fair',

  /**
   * If the average mos is 3.0 or below.
   */
  Degraded = 'degraded',
}

export default CallQuality;
