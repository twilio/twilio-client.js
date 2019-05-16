const EventTarget = require('../eventtarget');
const sinon = require('sinon');

/**
 * A WebSocket manager. Keeps track of all MockWebSocket instances it creates.
 * @property {Array<MockWebSocket>} instances
 */
function WebSocketManager() {
  const instances = this.instances = [];

  this.reset = function() {
    instances.splice(0, this.instances.length);
  }

  /**
   * This is a mock WebSocket. It doesn't include everything a true WebSocket
   * implementation would have, but it is close.
   */
  class MockWebSocket extends EventTarget {
    /**
     * @param {string} url
     * @param {string|Array<string>} [protocolOrProtocols]
     */
    constructor(url, protocolOrProtocols) {
      super();

      instances.push(this);

      Object.defineProperties(this, {
        _readyState: {
          value: MockWebSocket.CONNECTING,
          writable: true
        },
        _onclose: {
          value: null,
          writable: true
        },
        _onerror: {
          value: null,
          writable: true
        },
        _onmessage: {
          value: null,
          writable: true
        },
        _onopen: {
          value: null,
          writable: true
        },
        CONNECTING: {
          enumerable: true,
          value: 0
        },
        OPEN: {
          enumerable: true,
          value: 1
        },
        CLOSING: {
          enumerable: true,
          value: 2
        },
        CLOSED: {
          enumerable: true,
          value: 3
        },
        binaryType: {
          enumerable: true,
          value: 'blob'
        },
        bufferedAmount: {
          enumerable: true,
          value: 0
        },
        extensions: {
          enumerable: true,
          value: ''
        },
        protocol: {
          enumerable: true,
          value: typeof protocolOrProtocols === 'string'
            ? protocolOrProtocols
            : Array.isArray(protocolOrProtocols)
              ? protocolOrProtocols[0]
              : ''
        },
        url: {
          enumerable: true,
          value: url
        }
      });

      this.close = sinon.spy(this.close.bind(this));
      this.send = sinon.spy(this.send.bind(this));
    }

    /**
     * @param {number} [code]
     * @param {string} [reason]
     * @returns {void}
     * @throws {InvalidAccessError}
     * @throws {SyntaxError}
     */
    close() {
      this.setReadyState(MockWebSocket.CLOSING);
      setTimeout(() => {
        this.setReadyState(MockWebSocket.CLOSED);
      });
    }

    get onopen() {
      return this._onopen;
    }

    set onopen(onopen) {
      if (this.onopen) {
        this.removeEventListener('open', this.onopen);
      }
      if (typeof onopen === 'function') {
        this._onopen = onopen;
        this.addEventListener('open', onopen);
      } else {
        this._onopen = null;
      }
    }

    get onerror() {
      return this._onerror;
    }

    set onerror(onerror) {
      if (this.onerror) {
        this.removeEventListener('error', this.onerror);
      }
      if (typeof onerror === 'function') {
        this._onerror = onerror;
        this.addEventListener('error', onerror);
      } else {
        this._onerror = null;
      }
    }

    get onclose() {
      return this._onclose;
    }

    set onclose(onclose) {
      if (this.onclose) {
        this.removeEventListener('close', this.onclose);
      }
      if (typeof onclose === 'function') {
        this._onclose = onclose;
        this.addEventListener('close', onclose);
      } else {
        this._onclose = null;
      }
    }

    get onmessage() {
      return this._onmessage;
    }

    set onmessage(onmessage) {
      if (this.onmessage) {
        this.removeEventListener('message', this.onmessage);
      }
      if (typeof onmessage === 'function') {
        this._onmessage = onmessage;
        this.addEventListener('message', onmessage);
      } else {
        this._onmessage = null;
      }
    }

    get readyState() {
      return this._readyState;
    }

    /**
     * Set the WebSocket's `readyState`, raising the expected events.
     * @param {number} readyState
     * @returns {void}
     */
    setReadyState(readyState) {
      this._readyState = readyState;
      switch (readyState) {
        case MockWebSocket.OPEN:
          this.dispatchEvent({ type: 'open' });
          break;
        case MockWebSocket.CLOSING:
          break;
        case MockWebSocket.CLOSED:
          this.dispatchEvent({ type: 'close' });
          break;
      }
    }

    /**
     * @param {string|ArrayBuffer|Blob} data
     * @returns {void}
     * @throws {InvalidStateError}
     * @throws {SyntaxError}
     */
    send() {
      if (this.readyState !== MockWebSocket.OPEN) {
        throw new Error('InvalidStateError');
      }
    }
  }

  MockWebSocket.CONNECTING = 0;
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSING = 2;
  MockWebSocket.CLOSED = 3;

  this.MockWebSocket = MockWebSocket;
}

module.exports = WebSocketManager;
