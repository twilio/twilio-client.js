const assert = require('assert');
const EventTarget = require('./eventtarget');
const { inherits } = require('util');
const sinon = require('sinon');

const Sound = require('../lib/twilio/sound');

describe('Sound', () => {
  let AudioFactory;
  let sound;

  beforeEach(() => {
    MockAudio.clearInstances();
    MockLegacyAudio.clearInstances();
  });

  context('when setSinkId is not supported', () => {
    beforeEach(() => {
      AudioFactory = MockLegacyAudio;
      sound = new Sound('foo', 'foo.bar.com', { AudioFactory: MockLegacyAudio });
      AudioFactory.clearInstances();
    });

    it('should create a muted autoplay Audio element on creation', () => {
      sound = new Sound('foo', 'foo.bar.com', { AudioFactory: MockLegacyAudio });
      sinon.assert.calledOnce(AudioFactory);
      const [audio] = AudioFactory.instances;

      assert.equal(audio.muted, true);
      assert.equal(audio.preload, 'auto');
      assert.deepEqual(audio.src, 'foo.bar.com');
      sinon.assert.calledOnce(audio.play);
    });

    describe('setSinkIds', () => {
      it('should do nothing', () => {
        sound.setSinkIds(['foo', 'bar']);
        assert.deepEqual(sound._sinkIds, ['default']);
      });
    });

    describe('play', () => {
      it('should create a single Audio element for the default sinkId', () => {
        sound.play();
        sinon.assert.calledOnce(AudioFactory);
      });

      it('should set .isPlaying to true', () => {
        sound.play();
        assert(sound.isPlaying);
      });
      
      context('when called twice synchronously', () => {
        beforeEach(() => {
          sound.play();
        });

        it('should only play the last Audio element', () => {
          return sound.play().then(() => {
            sinon.assert.calledTwice(AudioFactory);
            sinon.assert.notCalled(AudioFactory.instances[0].play);
            sinon.assert.notCalled(AudioFactory.instances[0].pause);
            sinon.assert.calledOnce(AudioFactory.instances[1].play);
          });
        });
      });
      
      context('when called twice in order', () => {
        beforeEach(() => {
          return sound.play();
        });

        it('should pause the first Audio element', () => {
          return sound.play().then(() => {
            sinon.assert.calledTwice(AudioFactory);
            sinon.assert.calledOnce(AudioFactory.instances[0].play);
            sinon.assert.calledOnce(AudioFactory.instances[0].pause);
            sinon.assert.calledOnce(AudioFactory.instances[1].play);
            sinon.assert.notCalled(AudioFactory.instances[1].pause);
          });
        });
      });
    });

    describe('stop', () => {
      it('should not error when called before play', () => {
        sound.stop();
      });

      it('should call .pause on the active element', () => {
        return sound.play().then(() => {
          sound.stop();
          sinon.assert.calledOnce(AudioFactory.instances[0].play);
          sinon.assert.calledOnce(AudioFactory.instances[0].pause);
        });
      });
    });
  });

  context('when setSinkId is supported', () => {
    beforeEach(() => {
      AudioFactory = MockAudio;
      sound = new Sound('foo', 'foo.bar.com', { AudioFactory: MockAudio });
      AudioFactory.clearInstances();
    });

    it('should create a muted autoplay Audio element on creation', () => {
      sound = new Sound('foo', 'foo.bar.com', { AudioFactory: MockAudio });
      sinon.assert.calledOnce(AudioFactory);
      const [audio] = AudioFactory.instances;

      assert.equal(audio.muted, true);
      assert.equal(audio.preload, 'auto');
      assert.deepEqual(audio.src, 'foo.bar.com');
      sinon.assert.calledOnce(audio.play);
    });

    describe('setSinkIds', () => {
      it('should replace the _sinkIds elements in place', () => {
        const inputArray = ['foo', 'bar'];
        sound.setSinkIds(inputArray);
        assert.deepEqual(sound._sinkIds, ['foo', 'bar']);
        assert.notEqual(sound._sinkIds, inputArray);
      });

      it('should accept a single ID', () => {
        sound.setSinkIds('foo');
        assert.deepEqual(sound._sinkIds, ['foo']);
      });
    });

    describe('play', () => {
      it('should create a single Audio element for the default sinkId', () => {
        sound.play();
        sinon.assert.calledOnce(AudioFactory);
      });

      it('should set .isPlaying to true', () => {
        sound.play();
        assert(sound.isPlaying);
      });

      it('should create a single Audio element for each sinkId', () => {
        sound.setSinkIds(['foo', 'bar', 'baz']);
        return sound.play().then(() => {
          sinon.assert.calledThrice(AudioFactory);
          assert.equal(AudioFactory.instances[0].sinkId, 'foo');
          assert.equal(AudioFactory.instances[1].sinkId, 'bar');
          assert.equal(AudioFactory.instances[2].sinkId, 'baz');
        });
      });
      
      context('when called twice synchronously', () => {
        beforeEach(() => {
          sound.setSinkIds(['foo', 'bar', 'baz']);
          sound.play();
        });

        it('should only play the last Audio elements', () => {
          sinon.assert.calledThrice(AudioFactory);
          return sound.play().then(() => {
            sinon.assert.callCount(AudioFactory, 6);
            sinon.assert.notCalled(AudioFactory.instances[0].play);
            sinon.assert.notCalled(AudioFactory.instances[0].pause);
            sinon.assert.notCalled(AudioFactory.instances[1].play);
            sinon.assert.notCalled(AudioFactory.instances[1].pause);
            sinon.assert.notCalled(AudioFactory.instances[2].play);
            sinon.assert.notCalled(AudioFactory.instances[2].pause);
            sinon.assert.calledOnce(AudioFactory.instances[3].play);
            sinon.assert.calledOnce(AudioFactory.instances[4].play);
            sinon.assert.calledOnce(AudioFactory.instances[5].play);
          });
        });
      });
      
      context('when called twice in order', () => {
        beforeEach(() => {
          sound.setSinkIds(['foo', 'bar', 'baz']);
          return sound.play();
        });

        it('should pause all Audio elements except the last', () => {
          sinon.assert.calledThrice(AudioFactory);
          return sound.play().then(() => {
            sinon.assert.callCount(AudioFactory, 6);
            sinon.assert.calledOnce(AudioFactory.instances[0].play);
            sinon.assert.calledOnce(AudioFactory.instances[0].pause);
            sinon.assert.calledOnce(AudioFactory.instances[1].play);
            sinon.assert.calledOnce(AudioFactory.instances[1].pause);
            sinon.assert.calledOnce(AudioFactory.instances[2].play);
            sinon.assert.calledOnce(AudioFactory.instances[2].pause);
            sinon.assert.calledOnce(AudioFactory.instances[3].play);
            sinon.assert.notCalled(AudioFactory.instances[3].pause);
            sinon.assert.calledOnce(AudioFactory.instances[4].play);
            sinon.assert.notCalled(AudioFactory.instances[4].pause);
            sinon.assert.calledOnce(AudioFactory.instances[5].play);
            sinon.assert.notCalled(AudioFactory.instances[5].pause);
          });
        });
      });
    });

    describe('stop', () => {
      it('should not error when called before play', () => {
        sound.stop();
      });

      it('should call .pause on all active elements', () => {
        sound.setSinkIds(['foo', 'bar']);
        return sound.play().then(() => {
          sound.stop();
          sinon.assert.calledOnce(AudioFactory.instances[0].play);
          sinon.assert.calledOnce(AudioFactory.instances[0].pause);
          sinon.assert.calledOnce(AudioFactory.instances[1].play);
          sinon.assert.calledOnce(AudioFactory.instances[1].pause);
        });
      });
    });
  });
});

/**
 * MockAudio - Has setSinkId
 */
function MockAudio(src) {
  EventTarget.call(this);

  this.src = src;
  this.pause = sinon.spy(this.pause);
  this.play = sinon.spy(this.play);
  this.setSinkId = sinon.spy(this.setSinkId);
  MockAudio.instances.push(this);
}

inherits(MockAudio, EventTarget);

MockAudio.instances = [];
MockAudio.clearInstances = function() {
  this.instances.splice(0, this.instances.length);
  this.reset();
}

MockAudio.prototype.addEventListener = (eventName, handler) => {
  if (eventName === 'canplaythrough') {
    setTimeout(handler);
  }
}
MockAudio.prototype.load = () => { }
MockAudio.prototype.pause = () => { }
MockAudio.prototype.play = () => { }
MockAudio.prototype.setSinkId = function(sinkId) {
  this.sinkId = sinkId;
  return Promise.resolve();
}

MockAudio = sinon.spy(MockAudio);

/**
 * MockLegacyAudio - No setSinkId
 */
function MockLegacyAudio(src) {
  EventTarget.call(this);

  this.src = src;
  this.pause = sinon.spy(this.pause);
  this.play = sinon.spy(this.play);
  MockLegacyAudio.instances.push(this);
}

inherits(MockLegacyAudio, EventTarget);

MockLegacyAudio.instances = [];
MockLegacyAudio.clearInstances = function() {
  this.instances.splice(0, this.instances.length);
  this.reset();
}

MockLegacyAudio.prototype.addEventListener = (eventName, handler) => {
  if (eventName === 'canplaythrough') {
    setTimeout(handler);
  }
}
MockLegacyAudio.prototype.load = () => { }
MockLegacyAudio.prototype.pause = () => { }
MockLegacyAudio.prototype.play = () => { }
MockLegacyAudio = sinon.spy(MockLegacyAudio);
