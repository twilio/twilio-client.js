/**
 * @module Voice
 * @internalapi
 */
/**
 * Payload object we send to insights
 * @private
 */
interface RTCIceCandidatePayload {
    candidate_type: string;
    deleted: boolean;
    ip: string;
    is_remote: boolean;
    'network-cost': number | undefined;
    port: number;
    priority: number;
    protocol: string;
    transport_id: string;
}
/**
 * Represents an ICE candidate coming from the browser
 * https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidate
 * @private
 */
export declare type RTCIceCandidate = any;
/**
 * {@link RTCIceCandidate} parses an ICE candidate gathered by the browser
 * and returns a RTCLocalIceCandidate object
 */
export declare class RTCLocalIceCandidate {
    /**
     * Candidate's type
     * https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateType
     */
    private candidateType;
    /**
     * Whether this is deleted from the list of candidate gathered
     */
    private deleted;
    /**
     * Candidate's IP address
     */
    private ip;
    /**
     * Whether this is a remote candidate
     */
    private isRemote;
    /**
     * A number from 0 to 999 indicating the cost of network
     * where larger values indicate a stronger preference for not using that network
     */
    private networkCost;
    /**
     * Candidate's port number
     */
    private port;
    /**
     * A number indicating candidate's priority
     */
    private priority;
    /**
     * Candidate's protocol - udp or tcp
     */
    private protocol;
    /**
     * Also known as sdpMid, specifying the candidate's media stream identification tag which uniquely
     * identifies the media stream within the component with which the candidate is associated
     */
    private transportId;
    /**
     * @constructor
     * @param iceCandidate RTCIceCandidate coming from the browser
     */
    constructor(iceCandidate: RTCIceCandidate);
    /**
     * Get the payload object for insights
     */
    toPayload(): RTCIceCandidatePayload;
}
export {};
