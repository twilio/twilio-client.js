import { RTCLocalIceCandidate } from '../../lib/twilio/rtc/candidate';
import * as assert from 'assert';

describe('Candidate', () => {
  let data: any;
  let output: any;

  beforeEach(() => {
    data = {
      type: 'host',
      address: '192.168.1.1',
      candidate: 'network-id 2 network-cost 20',
      port: 63982,
      priority: 123,
      protocol: 'udp',
      sdpMid: 'audio'
    };

    output = {
      candidate_type: 'host',
      deleted: false,
      ip: '192.168.1.1',
      is_remote: false,
      'network-cost': 20,
      port: 63982,
      priority: 123,
      protocol: 'udp',
      transport_id: 'audio'
    };
  });

  it('Should return valid RTCIceCandidate', () => {
    assert.deepEqual(new RTCLocalIceCandidate(data).toPayload(), output);
  });

  it('Should return undefined when a property is not supported', () => {
    delete data.address;
    assert.equal(new RTCLocalIceCandidate(data).toPayload().ip, undefined);
  });

  it('Should use ip if exists', () => {
    data.ip = 'foo';
    assert.equal(new RTCLocalIceCandidate(data).toPayload().ip, 'foo');
  });

  it('Should return empty cost if it does not exists', () => {
    data.candidate = 'foo';
    assert.equal(new RTCLocalIceCandidate(data).toPayload()['network-cost'], undefined);
  });

  it('Should return default values for deleted and remote', () => {
    const result = new RTCLocalIceCandidate(data).toPayload();
    assert(!result.deleted);
    assert(!result.is_remote);
  });
});
