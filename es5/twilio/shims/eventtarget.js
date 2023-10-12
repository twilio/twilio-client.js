'use strict';

var EventEmitter = require('events').EventEmitter;

function EventTarget() {
  Object.defineProperties(this, {
    _eventEmitter: {
      value: new EventEmitter()
    },
    _handlers: {
      value: {}
    }
  });
}

EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
  return this._eventEmitter.emit(event.type, event);
};

EventTarget.prototype.addEventListener = function addEventListener() {
  var _eventEmitter;

  return (_eventEmitter = this._eventEmitter).addListener.apply(_eventEmitter, arguments);
};

EventTarget.prototype.removeEventListener = function removeEventListener() {
  var _eventEmitter2;

  return (_eventEmitter2 = this._eventEmitter).removeListener.apply(_eventEmitter2, arguments);
};

EventTarget.prototype._defineEventHandler = function _defineEventHandler(eventName) {
  var self = this;
  Object.defineProperty(this, 'on' + eventName, {
    get: function get() {
      return self._handlers[eventName];
    },
    set: function set(newHandler) {
      var oldHandler = self._handlers[eventName];

      if (oldHandler && (typeof newHandler === 'function' || typeof newHandler === 'undefined' || newHandler === null)) {
        self._handlers[eventName] = null;
        self.removeEventListener(eventName, oldHandler);
      }

      if (typeof newHandler === 'function') {
        self._handlers[eventName] = newHandler;
        self.addEventListener(eventName, newHandler);
      }
    }
  });
};

module.exports = EventTarget;