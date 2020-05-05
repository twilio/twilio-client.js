"use strict";
/**
 * @module Voice
 * @internalapi
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * {@link RTCIceCandidate} parses an ICE candidate gathered by the browser
 * and returns a RTCLocalIceCandidate object
 */
var RTCLocalIceCandidate = /** @class */ (function () {
    /**
     * @constructor
     * @param iceCandidate RTCIceCandidate coming from the browser
     */
    function RTCLocalIceCandidate(iceCandidate) {
        /**
         * Whether this is deleted from the list of candidate gathered
         */
        this.deleted = false;
        /**
         * Whether this is a remote candidate
         */
        this.isRemote = false;
        var cost;
        var parts = iceCandidate.candidate.split('network-cost ');
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
    RTCLocalIceCandidate.prototype.toPayload = function () {
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
    };
    return RTCLocalIceCandidate;
}());
exports.RTCLocalIceCandidate = RTCLocalIceCandidate;
//# sourceMappingURL=candidate.js.map