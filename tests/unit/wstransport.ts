const assert = require('assert');
const sinon = require('sinon');

const WebSocketManager = require('../mock/WebSocketManager');
import WSTransport, { WSTransportState } from '../../lib/twilio/wstransport';

describe('WSTransport', () => {
  const wsManager = new WebSocketManager();
  const WebSocket = wsManager.MockWebSocket;
  let socket: any;
  let transport: WSTransport;

  beforeEach(() => {
    wsManager.reset();
    transport = new WSTransport('wss://foo.bar/signal', { WebSocket });
  });

  describe('constructor', () => {
    it('returns an instance of WSTransport', () => {
      assert(transport instanceof WSTransport);
    });

    it('does not construct a WebSocket', () => {
      assert.equal(wsManager.instances.length, 0);
    });
  });

  describe('#close', () => {
    describe('before anything else', () => {
      it('returns undefined', () => {
        assert.equal(transport.close(), undefined);
      });

      it('sets state to closed', () => {
        transport.close();
        assert.equal(transport.state, WSTransportState.Closed);
      });
    });

    describe('after calling #open', () => {
      beforeEach(() => {
        transport.open();
        socket = wsManager.instances[0];
      });

      it('returns undefined', () => {
        assert.equal(transport.close(), undefined);
      });

      it('releases the socket', () => {
        const sock = wsManager.instances[0];
        transport.close();
        assert.equal(sock.readyState, WebSocket.CLOSING);
      });

      it('sets state to closed', () => {
        transport.close();
        assert.equal(transport.state, WSTransportState.Closed);
      });
    });

    describe('after calling #open and then #close', () => {
      beforeEach(() => {
        transport.open();
        transport.close();
      });

      it('returns undefined', () => {
        assert.equal(transport.close(), undefined);
      });
    });
  });

  describe('#open, called', () => {
    describe('before anything else', () => {
      it('returns undefined', () => {
        assert.equal(transport.open(), undefined);
      });

      it('resets state to connecting', () => {
        transport.open();
        assert.equal(transport.state, WSTransportState.Connecting);
      });

      it('constructs a WebSocket', () => {
        transport.open();
        assert.equal(wsManager.instances.length, 1);
      });

      context('if WebSocket construction fails', () => {
        const BadWebSocket = () => { throw new Error('Die'); }

        it('should close the WSTransport', () => {
          transport = new WSTransport('wss://foo.bar/signal', { WebSocket: BadWebSocket });
          transport.on('error', () => { });
          transport.open();
          assert.equal(transport.state, WSTransportState.Closed);
        });

        it('should call onerror', (done) => {
          transport = new WSTransport('wss://foo.bar/signal', { WebSocket: BadWebSocket });
          transport.on('error', () => done());
          transport.open();
        });
      });
    });

    describe('after calling #open', () => {
      beforeEach(() => {
        transport.open();
        socket = wsManager.instances[0];
      });

      it('returns undefined', () => {
        assert.equal(transport.open(), undefined);
      });

      it('does not construct another WebSocket', () => {
        transport.open();
        assert.equal(wsManager.instances.length, 1);
      });
    });

    describe('after calling #open and then #close', () => {
      beforeEach(() => {
        transport.open();
        transport.close();
      });

      it('returns undefined', () => {
        assert.equal(transport.open(), undefined);
      });

      it('does construct another WebSocket', () => {
        transport.open();
        assert.equal(wsManager.instances.length, 2);
      });
    });
  });

  describe('#send, called', () => {
    describe('before anything else', () => {
      it('returns false', () => {
        assert.equal(transport.send('foo'), false);
      });
    });

    describe('called after calling #open', () => {
      beforeEach(() => {
        transport.open();
        socket = wsManager.instances[0];
      });

      it('returns false', () => {
        assert.equal(transport.send('foo'), false);
      });

      context('before the socket has connected', () => {
        it('should return false', () => {
          socket._readyState = WebSocket.CONNECTING;
          assert.equal(transport.send('foo'), false);
        });
      });

      context('after the socket has connected', () => {
        beforeEach(() => {
          socket._readyState = WebSocket.OPEN;
          socket.send = sinon.spy(socket.send.bind(socket));
        });

        it('should return true', () => {
          assert.equal(transport.send('foo'), true);
        });

        it('should send the message', () => {
          transport.send('foo');
          assert.equal((socket as any).send.callCount, 1);
        });
      });

      context('if the WebSocket fails to send', () => {
        beforeEach(() => {
          socket._readyState = WebSocket.OPEN;
          socket.close = sinon.spy(socket.close.bind(socket));
          socket.send = () => { throw new Error('Expected'); };
        });

        it('should return false', () => {
          assert.equal(transport.send('foo'), false);
        });

        it('should close the socket', () => {
          transport.send('foo');
          assert.equal(socket.close.callCount, 1);
        });
      });
    });

    describe('called after calling #open and then #close', () => {
      beforeEach(() => {
        transport.open();
        transport.close();
      });

      it('returns false', () => {
        assert.equal(transport.send('foo'), false);
      });
    });
  });

  describe('onSocketMessage', () => {
    beforeEach(() => {
      transport.open();
      socket = wsManager.instances[0];
    });

    context('when receiving a heartbeat', () => {
      it('should respond', () => {
        socket._readyState = WebSocket.OPEN;
        socket.dispatchEvent({ type: 'message', data: '\n' }); 
        assert.equal(socket.send.args[0][0], '\n');
      });

      it('should not emit', () => {
        transport.emit = sinon.spy();
        socket._readyState = WebSocket.OPEN;
        socket.dispatchEvent({ type: 'message', data: '\n' }); 
        assert.equal((transport as any).emit.callCount, 0);
      });
    });

    context('when receiving a message', () => {
      it('should not respond with a heartbeat', () => {
        socket._readyState = WebSocket.OPEN;
        socket.dispatchEvent({ type: 'message', data: 'foo' }); 
        assert.equal((socket as any).send.callCount, 0);
      });

      it('should emit the message', () => {
        transport.emit = sinon.spy();
        socket._readyState = WebSocket.OPEN;
        socket.dispatchEvent({ type: 'message', data: 'foo' }); 
        assert.equal((transport as any).emit.callCount, 1);
        assert.equal((transport as any).emit.args[0][1].data, 'foo');
      });
    });
  });

  describe('onSocketOpen', () => {
    beforeEach(() => {
      transport.open();
      socket = wsManager.instances[0];
    });

    it('should set state to open', () => {
      socket.dispatchEvent({ type: WSTransportState.Open });
      assert.equal(transport.state, WSTransportState.Open);
    });

    it('should emit open', () => {
      transport.emit = sinon.spy();
      socket.dispatchEvent({ type: WSTransportState.Open });
      assert.equal((transport as any).emit.callCount, 1);
      assert.equal((transport as any).emit.args[0][0], WSTransportState.Open);
    });
  });

  describe('onSocketError', () => {
    it('should emit error', () => {
      transport.open();
      socket = wsManager.instances[0];

      transport.emit = sinon.spy();
      socket.dispatchEvent({ type: 'error' });
      assert.equal((transport as any).emit.callCount, 1);
      assert.equal((transport as any).emit.args[0][0], 'error');
    });
  });

  describe('onSocketClose', () => {
    beforeEach(() => {
      transport.open();
      socket = wsManager.instances[0];
    });

    it('should set state to connecting', () => {
      socket.dispatchEvent({ type: 'close' });
      assert.equal(transport.state, WSTransportState.Connecting);
    });

    it('should attempt to reconnect by setting a backoff', () => {
      (transport as any)._backoff.backoff = sinon.spy();
      socket.dispatchEvent({ type: 'close' });
      assert.equal((transport as any)._backoff.backoff.callCount, 1);
    });

    it('should reset the backoff timer if the websocket was open longer than 10 seconds', () => {
      (transport as any)._timeOpened = Date.now() - 11000;
      (transport as any)._backoff.reset = sinon.spy();
      socket.dispatchEvent({ type: 'close' });
      assert.equal((transport as any)._backoff.reset.callCount, 1);
    });

    it('should reset the backoff timer if the websocket was open less than 10 seconds', () => {
      (transport as any)._timeOpened = Date.now() - 9000;
      (transport as any)._backoff.reset = sinon.spy();
      socket.dispatchEvent({ type: 'close' });
      assert.equal((transport as any)._backoff.reset.callCount, 0);
    });

    it('should emit close', () => {
      transport.emit = sinon.spy();
      socket.dispatchEvent({ type: 'close' });
      assert.equal((transport as any).emit.callCount, 1);
      assert.equal((transport as any).emit.args[0][0], 'close');
    });

    it('should unbind all listeners', () => {
      const ee = socket._eventEmitter;
      socket.dispatchEvent({ type: 'close' });

      assert.equal(ee.listenerCount('close'), 0);
      assert.equal(ee.listenerCount('error'), 0);
      assert.equal(ee.listenerCount('message'), 0);
      assert.equal(ee.listenerCount('open'), 0);
    });
  });

  describe('after backoff', () => {
    beforeEach(() => {
      (transport as any)._connect = sinon.spy();
    });

    it('should not attempt to reconnect if the state is closed', () => {
      transport.state = WSTransportState.Closed;
      (transport as any)._backoff.emit('ready');
      assert.equal((transport as any)._connect.callCount, 0);
    });

    it('should attempt to reconnect if the state is open', () => {
      transport.state = WSTransportState.Open;
      (transport as any)._backoff.emit('ready');
      assert.equal((transport as any)._connect.callCount, 1);
    });

    it('should attempt to reconnect if the state is connecting', () => {
      transport.state = WSTransportState.Connecting;
      (transport as any)._backoff.emit('ready');
      assert.equal((transport as any)._connect.callCount, 1);
    });
  });
});
