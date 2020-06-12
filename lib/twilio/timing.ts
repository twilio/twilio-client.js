/**
 * @packageDocumentation
 * @module Voice
 * @publicapi
 */

/**
 * Timing measurements that provides operational milestones.
 */
export interface TimeMeasurement {
  /**
   * Number milliseconds elapsed for this measurement
   */
  duration?: number;

  /**
   * A millisecond timestamp the represents the end of a process
   */
  end?: number;

  /**
   * A millisecond timestamp the represents the start of a process
   */
  start: number;
}

/**
 * Represents a warning configuration for a specific timing metric.
 */
export interface TimingWarningConfig {
  /**
   * The end state for when to stop measuring time.
   * The [[TimeMeasurement.end]] is captured when this state is reached.
   */
  endState: string;

  /**
   * The name of the warning.
   */
  name: string;

  /**
   * The start state for when to start measuring time.
   * The [[TimeMeasurement.start]] is captured when this state is reached.
   */
  startState: string;

  /**
   * [[TimingWarningConfig.name]] warning is raised when [[TimeMeasurement.duration]] exceeds the threshold value.
   */
  threshold: number;
}

/**
 * Represents network related time measurements.
 */
export interface NetworkTiming {
  /**
   * Measurements for establishing DTLS connection.
   * This is measured from RTCDtlsTransport `connecting` to `connected` state.
   * See [RTCDtlsTransport state](https://developer.mozilla.org/en-US/docs/Web/API/RTCDtlsTransport/state).
   */
  dtls?: TimeMeasurement;

  /**
   * Measurements for establishing ICE connection.
   * This is measured from ICE connection `checking` to `connected` state.
   * See [RTCPeerConnection.iceConnectionState](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState).
   */
  ice?: TimeMeasurement;

  /**
   * Measurements for establishing a PeerConnection.
   * This is measured from PeerConnection `connecting` to `connected` state.
   * See [RTCPeerConnection.connectionState](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState).
   */
  peerConnection?: TimeMeasurement;
}
