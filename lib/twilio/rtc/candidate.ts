/**
 * @module Voice
 * @internalapi
 */

/**
 * Payload object we send to insights
 * @private
 */
interface RTCIceCandidatePayload {
  candidate_type: string,
  deleted: boolean,
  ip: string,
  is_remote: boolean,
  'network-cost': number | undefined,
  port: number,
  priority: number,
  protocol: string,
  transport_id: string,
};

/**
 * Represents an ICE candidate coming from the browser
 * https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate
 * @private
 */
export type IRTCIceCandidate = any;

/**
 * {@link RTCIceCandidate} parses an ICE candidate gathered by the browser
 * and returns a RTCLocalIceCandidate object
 */
export class RTCLocalIceCandidate {
  /**
   * Candidate's type
   * https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateType
   */
  private candidateType: string;

  /**
   * Whether this is deleted from the list of candidate gathered
   */
  private deleted: boolean = false;

  /**
   * Candidate's IP address
   */
  private ip: string;

  /**
   * Whether this is a remote candidate
   */
  private isRemote: boolean = false;

  /**
   * A number from 0 to 999 indicating the cost of network
   * where larger values indicate a stronger preference for not using that network
   */
  private networkCost: number | undefined;

  /**
   * Candidate's port number
   */
  private port: number;

  /**
   * A number indicating candidate's priority
   */
  private priority: number;

  /**
   * Candidate's protocol - udp or tcp
   */
  private protocol: string;

  /**
   * Also known as sdpMid, specifying the candidate's media stream identification tag which uniquely
   * identifies the media stream within the component with which the candidate is associated
   */
  private transportId: string;

  /**
   * @constructor
   * @param iceCandidate RTCIceCandidate coming from the browser
   */
  constructor(iceCandidate: IRTCIceCandidate) {
    let cost;
    const parts = iceCandidate.candidate.split('network-cost ');

    if (parts[1]) {
      cost = parseInt(parts[1], 10);
    }

    this.candidateType = iceCandidate.type;
    this.ip = iceCandidate.ip || iceCandidate.address;
    this.networkCost = cost;
    this.port = iceCandidate.port;
    this.priority = iceCandidate.priority;
    this.protocol = iceCandidate.protocol;
    this.transportId = iceCandidate.sdpMid;
  }

  /**
   * Get the payload object for insights
   */
  toPayload(): RTCIceCandidatePayload {
    return {
      'candidate_type': this.candidateType,
      'deleted': this.deleted,
      'ip': this.ip,
      'is_remote': this.isRemote,
      'network-cost': this.networkCost,
      'port': this.port,
      'priority': this.priority,
      'protocol': this.protocol,
      'transport_id': this.transportId,
    };
  }
}
