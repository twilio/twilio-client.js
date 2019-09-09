const AudioPlayer = require('@twilio/audioplayer');
const InvalidArgumentError = require('./errors').InvalidArgumentError;

/**
 * @class
 * @param {string} name - Name of the sound
 * @param {string} url - URL of the sound
 * @param {Sound#ConstructorOptions} options
 * @property {boolean} isPlaying - Whether the Sound is currently playing audio.
 * @property {string} name - Name of the sound
 * @property {string} url - URL of the sound
 * @property {AudioContext} audioContext - The AudioContext to use if available for AudioPlayer.
 *//**
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
    throw new InvalidArgumentError('name and url are required arguments');
  }

  options = Object.assign({
    AudioFactory: typeof Audio !== 'undefined' ? Audio : null,
    maxDuration: 0,
    shouldLoop: false
  }, options);

  options.AudioPlayer = options.audioContext
    ? AudioPlayer.bind(AudioPlayer, options.audioContext)
    : options.AudioFactory;

  Object.defineProperties(this, {
    _activeEls: {
      value: new Map()
    },
    _Audio: {
      value: options.AudioPlayer
    },
    _isSinkSupported: {
      value: options.AudioFactory !== null
        && typeof options.AudioFactory.prototype.setSinkId === 'function'
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
      get() {
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
    // Play it (muted) as soon as possible so that it does not get incorrectly caught by Chrome's
    // "gesture requirement for media playback" feature.
    // https://plus.google.com/+FrancoisBeaufort/posts/6PiJQqJzGqX
    this.play(true);
  }
}

function destroyAudioElement(audioElement) {
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement.srcObject = null;
    audioElement.load();
  }
}

/**
 * Plays the audio element that was initialized using the speficied sinkId
 */
Sound.prototype._playAudioElement = function _playAudioElement(sinkId) {
  const audioElement = this._activeEls.get(sinkId);

  if (!audioElement) {
    throw new InvalidArgumentError(`sinkId: "${sinkId}" doesn't have an audio element`);
  }

  return audioElement.play()
    .then(() => audioElement)
    .catch((reason) => {
      destroyAudioElement(audioElement);
      this._activeEls.delete(sinkId);
      throw reason;
    });
};

/**
 * Update the sinkIds of the audio output devices this sound should play through.
 */
Sound.prototype.setSinkIds = function setSinkIds(ids) {
  if (!this._isSinkSupported) { return; }

  ids = ids.forEach ? ids : [ids];
  [].splice.apply(this._sinkIds, [0, this._sinkIds.length].concat(ids));
};

/**
 * Stop playing the sound.
 * @return {void}
 */
Sound.prototype.stop = function stop() {
  this._activeEls.forEach((audioEl, sinkId) => {
    if (this._sinkIds.includes(sinkId)) {
      audioEl.pause();
      audioEl.currentTime = 0;
    } else {
      // Destroy the ones that are not used anymore
      destroyAudioElement(audioEl);
      this._activeEls.delete(sinkId);
    }
  });

  clearTimeout(this._maxDurationTimeout);

  this._playPromise = null;
  this._maxDurationTimeout = null;
};

/**
 * Start playing the sound. Will stop the currently playing sound first.
 * If it exists, the audio element that was initialized for the sinkId will be used
 */
Sound.prototype.play = function play(isMuted) {
  if (this.isPlaying) {
    this.stop();
  }

  if (this._maxDuration > 0) {
    this._maxDurationTimeout = setTimeout(this.stop.bind(this), this._maxDuration);
  }

  const self = this;
  const playPromise = this._playPromise = Promise.all(this._sinkIds.map(function createAudioElement(sinkId) {
    if (!self._Audio) {
      return Promise.resolve();
    }

    let audioElement = self._activeEls.get(sinkId);
    if (audioElement) {
      audioElement.muted = isMuted;
      return self._playAudioElement(sinkId);
    }

    audioElement = new self._Audio(self.url);
    audioElement.loop = self._shouldLoop;
    audioElement.muted = isMuted;

    return (self._isSinkSupported
        ? audioElement.setSinkId(sinkId)
        : Promise.resolve()).then(function setSinkIdSuccess() {
      self._activeEls.set(sinkId, audioElement);
      return self._playAudioElement(sinkId);
    });
  }));

  return playPromise;
};

module.exports = Sound;
