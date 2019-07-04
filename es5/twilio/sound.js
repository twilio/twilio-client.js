'use strict';

var AudioPlayer = require('@twilio/audioplayer');

/**
 * @class
 * @param {string} name - Name of the sound
 * @param {string} url - URL of the sound
 * @param {Sound#ConstructorOptions} options
 * @property {boolean} isPlaying - Whether the Sound is currently playing audio.
 * @property {string} name - Name of the sound
 * @property {string} url - URL of the sound
 * @property {AudioContext} audioContext - The AudioContext to use if available for AudioPlayer.
 */ /**
    * @typedef {Object} Sound#ConstructorOptions
    * @property {number} [maxDuration=0] - The maximum length of time to play the sound
    *   before stopping it.
    * @property {Boolean} [shouldLoop=false] - Whether the sound should be looped.
    */
function Sound(name, url, options) {
  if (!(this instanceof Sound)) {
    return new Sound(name, url, options);
  }

  if (!name || !url) {
    throw new Error('name and url are required arguments');
  }

  options = Object.assign({
    AudioFactory: typeof Audio !== 'undefined' ? Audio : null,
    maxDuration: 0,
    shouldLoop: false
  }, options);

  options.AudioPlayer = options.audioContext ? AudioPlayer.bind(AudioPlayer, options.audioContext) : options.AudioFactory;

  Object.defineProperties(this, {
    _activeEls: {
      value: new Set()
    },
    _Audio: {
      value: options.AudioPlayer
    },
    _isSinkSupported: {
      value: options.AudioFactory !== null && typeof options.AudioFactory.prototype.setSinkId === 'function'
    },
    _maxDuration: {
      value: options.maxDuration
    },
    _maxDurationTimeout: {
      value: null,
      writable: true
    },
    _playPromise: {
      value: null,
      writable: true
    },
    _shouldLoop: {
      value: options.shouldLoop
    },
    _sinkIds: {
      value: ['default']
    },
    isPlaying: {
      enumerable: true,
      get: function get() {
        return !!this._playPromise;
      }
    },
    name: {
      enumerable: true,
      value: name
    },
    url: {
      enumerable: true,
      value: url
    }
  });

  if (this._Audio) {
    preload(this._Audio, url);
  }
}

function preload(AudioFactory, url) {
  var el = new AudioFactory(url);
  el.preload = 'auto';
  el.muted = true;

  // Play it (muted) as soon as possible so that it does not get incorrectly caught by Chrome's
  // "gesture requirement for media playback" feature.
  // https://plus.google.com/+FrancoisBeaufort/posts/6PiJQqJzGqX
  el.play();
}

/**
 * Update the sinkIds of the audio output devices this sound should play through.
 */
Sound.prototype.setSinkIds = function setSinkIds(ids) {
  if (!this._isSinkSupported) {
    return;
  }

  ids = ids.forEach ? ids : [ids];
  [].splice.apply(this._sinkIds, [0, this._sinkIds.length].concat(ids));
};

/**
 * Stop playing the sound.
 * @return {void}
 */
Sound.prototype.stop = function stop() {
  this._activeEls.forEach(function (audioEl) {
    audioEl.pause();
    audioEl.src = '';
    audioEl.load();
  });

  this._activeEls.clear();

  clearTimeout(this._maxDurationTimeout);

  this._playPromise = null;
  this._maxDurationTimeout = null;
};

/**
 * Start playing the sound. Will stop the currently playing sound first.
 */
Sound.prototype.play = function play() {
  if (this.isPlaying) {
    this.stop();
  }

  if (this._maxDuration > 0) {
    this._maxDurationTimeout = setTimeout(this.stop.bind(this), this._maxDuration);
  }

  var self = this;
  var playPromise = this._playPromise = Promise.all(this._sinkIds.map(function createAudioElement(sinkId) {
    if (!self._Audio) {
      return Promise.resolve();
    }

    var audioElement = new self._Audio(self.url);
    audioElement.loop = self._shouldLoop;

    audioElement.addEventListener('ended', function () {
      self._activeEls.delete(audioElement);
    });

    /**
     * (rrowland) Bug in Chrome 53 & 54 prevents us from calling Audio.setSinkId without
     *   crashing the tab. https://bugs.chromium.org/p/chromium/issues/detail?id=655342
     */
    return new Promise(function (resolve) {
      audioElement.addEventListener('canplaythrough', resolve);
    }).then(function () {
      // If stop has already been called, or another play has been initiated,
      // bail out before setting up the element to play.
      if (!self.isPlaying || self._playPromise !== playPromise) {
        return Promise.resolve();
      }

      return (self._isSinkSupported ? audioElement.setSinkId(sinkId) : Promise.resolve()).then(function setSinkIdSuccess() {
        self._activeEls.add(audioElement);
        return audioElement.play();
      }).then(function playSuccess() {
        return audioElement;
      }, function playFailure(reason) {
        self._activeEls.delete(audioElement);
        throw reason;
      });
    });
  }));

  return playPromise;
};

module.exports = Sound;