'use strict';

const assert = require('assert');

const { setCodecPreferences } = require('../lib/twilio/rtc/sdp');

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
