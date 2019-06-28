const assert = require('assert');
const EventEmitter = require('events').EventEmitter;
const EventTarget = require('../lib/twilio/shims/eventtarget');
const sinon = require('sinon');

const { PStream } = require('../lib/twilio/pstream');

describe('PStream', () => {
  let pstream;
  beforeEach(() => {
    pstream = new PStream('foo', 'wss://foo.bar/signal', {
      TransportFactory
    });
  });

  describe('constructor', () => {
    it('returns an instance of PStream', () => {
      assert(pstream instanceof PStream);
    });

    it('should begin in disconnected status', () => {
      assert.equal(pstream.status, 'disconnected');
    });
  });

  describe('when transport fires onopen', () => {
    it('should set status to connected', () => {
      pstream.transport.emit('open');
      assert.equal(pstream.status, 'connected');
    });

    it('should send a LISTEN with the token', () => {
      pstream.transport.send = sinon.spy();
      pstream.transport.emit('open');
      assert.equal(pstream.transport.send.callCount, 1);
      assert.equal(JSON.parse(pstream.transport.send.args[0][0]).type, 'listen');
    });


    it('should call transport.send for any queued messages', () => {
      pstream.transport.send = () => false;
      pstream.publish('foo', { });
      pstream.publish('foo', { });
      pstream.publish('foo', { });
      pstream.transport.send = sinon.spy();
      pstream.transport.emit('open');
      assert.equal(pstream.transport.send.callCount, 4);
    });

    it('should remove successfully sent queued messages and retain any failed', () => {
      pstream.transport.send = message => JSON.parse(message).type === 'foo';
      pstream.publish('foo', { });
      pstream.publish('foo', { });
      pstream.publish('bar', { });
      pstream.publish('bar', { });
      pstream.publish('bar', { });

      pstream.transport.send = sinon.spy(() => true);
      pstream.transport.emit('open');
      assert.equal(pstream.transport.send.callCount, 4);
    });
  });

  describe('when transport fires onclose', () => {
    it('should set status to disconnected regardless of status', () => {
      ['disconnected', 'connected', 'offline'].forEach(status => {
        pstream.status = status;
        pstream.transport.emit('close');
        assert.equal(pstream.status, 'disconnected');
      });
    });

    context('when status is connected', () => {
      it('should fire offline', (done) => {
        pstream.status = 'connected';
        pstream.on('offline', () => done());
        pstream.transport.emit('close');
      });
    });
  });

  describe('when transport fires onerror', () => {
    it('should fire error with the right format when only error is sent', (done) => {
      const err = { code: 1234, message: 'foo' };

      pstream.on('error', ({ error }) => {
        if (error === err) {
          done();
        } else {
          done(new Error('Error payload not correct format'));
        }
      });
      pstream.transport.emit('error', err);
    });

    it('should fire error with the right format when only error is sent', (done) => {
      const err = { code: 1234, message: 'foo' };

      pstream.on('error', ({ error }) => {
        if (error === err) {
          done();
        } else {
          done(new Error('Error payload not correct format'));
        }
      });
      pstream.transport.emit('error', { error: err, callSid: 'CA000' });
    });

    it('should not affect status', () => {
      ['disconnected', 'connected', 'offline'].forEach(status => {
        pstream.status = status;
        pstream.transport.emit('error');
        assert.equal(pstream.status, status);
      });
    });
  });

  describe('when transport fires onmessage', () => {
    it('should emit an event matching the message type', () => {
      return Promise.all(['foo', 'bar'].map(type => {
        return new Promise(resolve => {
          pstream.on(type, resolve);
          pstream.transport.emit('message', { data: JSON.stringify({ type })});
        });
      }));
    });

    it('should set status to offline if it receives a close message', () => {
      return new Promise((resolve, reject) => {
        pstream.on('close', () => {
          pstream.status === 'offline' ? resolve() : reject();
        });
        pstream.transport.emit('message', { data: JSON.stringify({ type: 'close' })});
      });
    });

    it('should only emit offline once if it receives multiple close messages', () => {
      let count = 0;
      pstream.on('offline', () => { count++; });
      pstream.transport.emit('message', { data: JSON.stringify({ type: 'close' })});
      pstream.transport.emit('message', { data: JSON.stringify({ type: 'close' })});
      pstream.transport.emit('message', { data: JSON.stringify({ type: 'close' })});
      assert.equal(count, 1);
    });
  });

  describe('setToken', () => {
    it('should return undefined', () => {
      assert.equal(pstream.setToken(), undefined);
    });

    it('should update .token', () => {
      pstream.setToken('foobar');
      assert.equal(pstream.token, 'foobar');
    });

    it('should call ._publish', () => {
      pstream._publish = sinon.spy();
      pstream.setToken('foobar');
      assert.equal(pstream._publish.callCount, 1);
    });
  });

  describe('register', () => {
    it('should return undefined', () => {
      assert.equal(pstream.register(), undefined);
    });

    it('should call ._publish', () => {
      pstream._publish = sinon.spy();
      pstream.register();
      assert.equal(pstream._publish.callCount, 1);
    });
  });

  describe('destroy', () => {
    it('should return this', () => {
      assert.equal(pstream.destroy(), pstream);
    });

    it('should close the transport', () => {
      pstream.transport.close = sinon.spy();
      pstream.destroy();
      assert.equal(pstream.transport.close.callCount, 1);
    });
  });

  describe('publish', () => {
    it('should return undefined', () => {
      assert.equal(pstream.publish(), undefined);
    });

    it('should call transport.send', () => {
      pstream.transport.send = sinon.spy();
      pstream.publish();
      assert.equal(pstream.transport.send.callCount, 1);
    });
  });

  describe('_publish', () => {
    context('when transport.send fails', () => {
      beforeEach(() => {
        pstream.transport.send = sinon.spy(() => false);
      });

      it('should queue the message to send on reconnect if shouldRetry is true', () => {
        pstream._publish('foo', { }, true);
        assert.equal(pstream._messageQueue.length, 1);
      });

      it('should not queue the message to send on reconnect if shouldRetry is false', () => {
        pstream._publish('foo', { }, false);
        assert.equal(pstream._messageQueue.length, 0);
      });
    });

    context('when transport.send succeeds', () => {
      beforeEach(() => {
        pstream.transport.send = sinon.spy(() => true);
      });

      it('should not queue the message to send on reconnect if shouldRetry is true', () => {
        pstream._publish('foo', { }, true);
        assert.equal(pstream._messageQueue.length, 0);
      });

      it('should not queue the message to send on reconnect if shouldRetry is false', () => {
        pstream._publish('foo', { }, false);
        assert.equal(pstream._messageQueue.length, 0);
      });
    });
  });

  describe('reinvite', () => {
    const callsid = 'foo';
    const sdp = 'bar';

    const getMessage = (type) => ({
      data: JSON.stringify({
        type, payload: { sdp, callsid }
      })
    });

    let wait;

    beforeEach(() => {
      wait = (timer) => new Promise(r => setTimeout(r, timer || 0));
    });

    it('should resolve once', () => {
      const callback = sinon.stub();
      const error = sinon.stub();
      pstream.reinvite(sdp, callsid).then(callback).catch(error);
      pstream._handleTransportMessage(getMessage('answer'));
      pstream._handleTransportMessage(getMessage('answer'));

      return wait().then(() => {
        assert(error.notCalled);
        sinon.assert.callCount(callback, 1);
        assert.equal(pstream._reinviteDeferreds.get(callsid), undefined);
      });
    });

    it('should reject once', () => {
      const callback = sinon.stub();
      const error = sinon.stub();
      pstream.reinvite(sdp, callsid).then(callback).catch(error);
      pstream._handleTransportMessage(getMessage('hangup'));
      pstream._handleTransportMessage(getMessage('hangup'));

      return wait().then(() => {
        assert(callback.notCalled);
        sinon.assert.callCount(error, 1);
        assert.equal(pstream._reinviteDeferreds.get(callsid), undefined);
      });
    });

    it('should return payload information', (done) => {
      pstream.reinvite(sdp, callsid).then((payload) => {
        assert.equal(payload.callsid, callsid);
        assert.equal(payload.sdp, sdp);
        done();
      });
      pstream._handleTransportMessage(getMessage('answer'));
    });

    it('should return previous promise if reinvite is called multiple times using the same callsid', () => {
      const promise1 = pstream.reinvite(sdp, callsid);
      const promise2 = pstream.reinvite(sdp, callsid);

      assert.notEqual(promise1, undefined);
      assert.notEqual(promise2, undefined);
      assert.equal(promise1, promise2);
    });

    it('should return new promise if reinvite is called multiple times with different callsid', () => {
      const promise1 = pstream.reinvite(sdp, callsid);
      const promise2 = pstream.reinvite(sdp, callsid + 'foo');

      assert.notEqual(promise1, undefined);
      assert.notEqual(promise2, undefined);
      assert.notEqual(promise1, promise2);
    });

    [{ type: 'answer', fn: 'then' }, { type: 'hangup', fn: 'catch' }].forEach(item => {
      it(`should ${item.type} latest reinvite`, () => {
        // Simulate a scenario where we don't receive a response from the server on the first call
        let reinviteCount = 0;
        pstream._publish = () => {
          if (reinviteCount > 0) {
            wait(10).then(() => pstream._handleTransportMessage(getMessage(item.type)));
            reinviteCount++;
          }
        };

        const callback = sinon.stub();

        pstream.reinvite(sdp, callsid);
        reinviteCount++;

        wait(20).then(() => {
          pstream.reinvite(sdp, callsid)[item.fn](callback);
          reinviteCount++;
        });

        return wait(50).then(() => sinon.assert.callCount(callback, 1));
      });

      it(`should always publish reinvite and receive ${item.type}`, () => {
        const numReinvites = 8;
        const timerIncrement = 5;
        const callback = sinon.stub();
        pstream._publish = sinon.stub().callsFake(() => {
          wait(timerIncrement).then(() => pstream._handleTransportMessage(getMessage(item.type)));
        });

        for (let i = 1; i <= numReinvites; i++) {
          wait((numReinvites * timerIncrement) + timerIncrement).then(() => pstream.reinvite(sdp, callsid)[item.fn](callback));
        }

        return wait((numReinvites * timerIncrement * 2) + timerIncrement).then(() => {
          sinon.assert.callCount(callback, numReinvites);
          sinon.assert.callCount(pstream._publish, numReinvites);
        });
      });
    });
  });
});

class TransportFactory extends EventEmitter {
  constructor() {
    super();
    this._socket = new EventTarget();
  }

  close() { }
  open() { }
  send() { }
}
