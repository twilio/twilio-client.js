/**
 * @module Voice
 * @internalapi
 */

/**
 * Sample RTC statistics coming from {@link RTCMonitor}
 * @private
 */
export default interface RTCSample {
  [key: string]: any;

  /**
   * Bytes received in last second.
   */
  bytesReceived: number;

  /**
   * Bytes sent in last second.
   */
  bytesSent: number;

  /**
   * Audio codec used, either pcmu or opus
   */
  codecName: string;

  /**
   * Packets delay variation
   */
  jitter: number;

  /**
   * Mean opinion score, 1.0 through roughly 4.5
   */
  mos: number;

  /**
   * Number of packets lost in last second.
   */
  packetsLost: number;

  /**
   * Packets lost to inbound packets ratio in last second.
   */
  packetsLostFraction: number;

  /**
   * Number of packets received in last second.
   */
  packetsReceived: number;

  /**
   * Number of packets sent in last second.
   */
  packetsSent: number;

  /**
   * Round trip time, to the server back to the client.
   */
  rtt: number;

  /**
   * Timestamp
   */
  timestamp: number;

  /**
   * Totals for packets and bytes related information
   */
  totals: RTCSampleTotals;
}

/**
 * Totals included in RTC statistics samples
 * @private
 */
interface RTCSampleTotals {
  /**
   * Total bytes received in last second.
   */
  bytesReceived: number;

  /**
   * Total bytes sent in last second.
   */
  bytesSent: number;

  /**
   * Total packets lost in last second.
   */
  packetsLost: number;

  /**
   * Total packets lost to total inbound packets ratio
   */
  packetsLostFraction: number;

  /**
   * Total packets received in last second.
   */
  packetsReceived: number;

  /**
   * Total packets sent in last second.
   */
  packetsSent: number;
}
