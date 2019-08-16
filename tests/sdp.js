'use strict';

const assert = require('assert');

const { setCodecPreferences, setMaxBitrate } = require('../lib/twilio/rtc/sdp');

const { makeSdpWithTracks } = require('./lib/mocksdp');
const { combinationContext } = require('./lib/util');

describe('setCodecPreferences', () => {
  combinationContext([
    [
      ['planb', 'unified'],
      x => `${x} sdp`,
    ],
    [
      ['', 'pcmu,opus'],
      x => `when preferredCodecs is ${x ? 'not ' : ''}empty`,
    ],
  ], ([sdpType, preferredCodecs]) => {
    preferredCodecs = preferredCodecs ? preferredCodecs.split(',') : [];
    it(`should ${preferredCodecs.length ? 'update the' : 'preserve the existing'} audio codec order`, () => {
      const expectedCodecIds = preferredCodecs.length
        ? ['0', '109', '9', '8', '101']
        : ['109', '9', '0', '8', '101'];
      itShouldHaveCodecOrder(sdpType, preferredCodecs, expectedCodecIds);
    });
  });
});

describe('setMaxBitrate', () => {
  it('should set the maxaveragebitrate if opus rtpmap line is not found ', () => {
    const sdp = 'foo=a\na=rtpmap:0 PCMU/8000\na=fmtp:111\nbar=b';
    const newSdp = setMaxBitrate(sdp, 12345);
    assert.equal(newSdp, 'foo=a\na=rtpmap:0 PCMU/8000\na=fmtp:111;maxaveragebitrate=12345\nbar=b');
  });

  it('should set the maxaveragebitrate if opus rtpmap line is found ', () => {
    const sdp = 'foo=a\na=rtpmap:0 PCMU/8000\na=rtpmap:1337 opus/48000/2\na=fmtp:1337\nbar=b';
    const newSdp = setMaxBitrate(sdp, 12345);
    assert.equal(newSdp, 'foo=a\na=rtpmap:0 PCMU/8000\na=rtpmap:1337 opus/48000/2\na=fmtp:1337;maxaveragebitrate=12345\nbar=b');
  });
});

function itShouldHaveCodecOrder(sdpType, preferredCodecs, expectedCodecIds) {
  const sdp = makeSdpWithTracks(sdpType, {
    audio: ['audio-1', 'audio-2'],
  });
  const modifiedSdp = setCodecPreferences(sdp, preferredCodecs);
  modifiedSdp.split('\r\nm=').slice(1).forEach(section => {
    const kind = section.split(' ')[0];
    const codecIds = section.split('\r\n')[0].match(/([0-9]+)/g).slice(1);
    assert.equal(codecIds.join(' '), expectedCodecIds.join(' '));
  });
}
