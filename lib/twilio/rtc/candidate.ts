/**
 * @module Voice
 * @internalapi
 */

/**
 * Parse an ICE candidate gathered by the browser and returns a RTCIceCandidate object
 * @param candidate ICE candidate coming from the browser
 * @returns RTCIceCandidate object
 */
export const getRTCIceCandidate = (ca: BrowserIceCandidate): RTCIceCandidate => {
  let cost;
  const parts = ca.candidate.split('network-cost ');

  if (parts[1]) {
    cost = parseInt(parts[1], 10);
  }

  return {
    'candidate_type': ca.type,
    'deleted': false,
    'ip': ca.ip || ca.address,
    'is_remote': false,
    'network-cost': cost,
    'port': ca.port,
    'priority': ca.priority,
    'protocol': ca.protocol,
    'transport_id': ca.sdpMid,
  };
};

/**
 * Represents an ICE candidate coming from the browser
 * @private
 */
export type BrowserIceCandidate = any;

/**
 * ICE Candidate gathered during ICE gathering phase
 * @private
 */
export interface RTCIceCandidate {
  /**
   * Candidate's type
   * https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateType
   */
  candidate_type: string;

  /**
   * Whether this is deleted from the list of candidate gathered
   */
  deleted: boolean;

  /**
   * Candidate's IP address
   */
  ip: string;

  /**
   * Whether this is a remote candidate
   */
  is_remote: boolean;

  /**
   * A number from 0 to 999 indicating the cost of network
   * where larger values indicate a stronger preference for not using that network
   */
  'network-cost': number | undefined;

  /**
   * Candidate's port number
   */
  port: number;

  /**
   * A number indicating candidate's priority
   */
  priority: number;

  /**
   * Candidate's protocol - udp or tcp
   */
  protocol: string;

  /**
   * Also known as sdpMid, specifying the candidate's media stream identification tag which uniquely
   * identifies the media stream within the component with which the candidate is associated
   */
  transport_id: string;
}
