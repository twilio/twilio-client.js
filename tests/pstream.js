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

    it('should publish without retry', () => {
      const stub = sinon.stub(pstream, '_publish');
      pstream.reinvite(sdp, callsid);
      assert(stub.calledWithExactly('reinvite', { sdp, callsid }, false));
      stub.restore();
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
