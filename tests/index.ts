const root = global as any;
root.window = { navigator: { userAgent: '' }, removeEventListener: () => { }, addEventListener: () => { } };

root.XMLHttpRequest = () => { };
root.XMLHttpRequest.prototype.addEventListener = (name: string, cb: Function) => {
  if (name === 'load') {
    cb({ target: { response: 'foo' } });
  }
};
root.XMLHttpRequest.prototype.open = (method: string, url: string, async: boolean) => { };
root.XMLHttpRequest.prototype.send = () => { };
root.XMLHttpRequest.prototype.setRequestHeader = () => { };

root.Audio = () => { };
root.Audio.prototype.addEventListener = (eventName: string, handler: Function) => {
  if (eventName === 'canplaythrough') {
    setTimeout(handler);
  }
};
root.Audio.prototype.play = () => Promise.resolve();

root.HTMLAudioElement = () => { };
root.HTMLAudioElement.prototype.setSinkId = () => Promise.resolve();
root.HTMLAudioElement.prototype.play = () => Promise.resolve();

root.AudioContext = () => { };
root.AudioContext.prototype.createAnalyser = () => ({});
root.AudioContext.prototype.createBufferSource = () => ({
  addEventListener() { },
  dispatchEvent() { },
  connect() { },
  disconnect() { },
  start() { },
  stop() { }
});
root.AudioContext.prototype.createGain = () => ({
  connect() { },
  disconnect() { },
  gain: { value: 1 }
});
root.AudioContext.prototype.createMediaStreamSource = () => ({
  connect() { },
  disconnect() { }
});
root.AudioContext.prototype.decodeAudioData = () => ({
  stream: 'foo'
});

root.MediaStreamTrack = () => { };
root.MediaStreamTrack.prototype.stop = () => { };

root.requestAnimationFrame = () => { };

root.MediaStream = () => { };

root.navigator = {
  mediaDevices: {
    getUserMedia() { return Promise.resolve() },
    enumerateDevices() { return Promise.resolve([]) },
  },
  platform: 'platform',
  userAgent: 'userAgent'
};

root.RTCPeerConnection = root.window.RTCPeerConnection = function() { };

require('./audiohelper');
require('./outputdevicecollection');
require('./eventpublisher');
require('./peerconnection');
require('./util');
require('./stats');
require('./mos');
require('./getusermedia');
require('./pstream');
require('./sound');
require('./sdp');

require('./unit/asyncQueue');
require('./unit/candidate');
require('./unit/connection');
require('./unit/device');
require('./unit/deferred');
require('./unit/wstransport');
require('./unit/statsMonitor');
require('./unit/error');
require('./unit/log');
require('./unit/regions');
