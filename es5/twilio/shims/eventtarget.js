var EventEmitter = require('events').EventEmitter;
function EventTarget() {
    Object.defineProperties(this, {
        _eventEmitter: {
            value: new EventEmitter()
        },
        _handlers: {
            value: {}
        },
    });
}
EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
    return this._eventEmitter.emit(event.type, event);
};
EventTarget.prototype.addEventListener = function addEventListener() {
    return (_a = this._eventEmitter).addListener.apply(_a, arguments);
    var _a;
};
EventTarget.prototype.removeEventListener = function removeEventListener() {
    return (_a = this._eventEmitter).removeListener.apply(_a, arguments);
    var _a;
};
EventTarget.prototype._defineEventHandler = function _defineEventHandler(eventName) {
    var self = this;
    Object.defineProperty(this, "on" + eventName, {
        get: function () {
            return self._handlers[eventName];
        },
        set: function (newHandler) {
            var oldHandler = self._handlers[eventName];
            if (oldHandler
                && (typeof newHandler === 'function'
                    || typeof newHandler === 'undefined'
                    || newHandler === null)) {
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
//# sourceMappingURL=eventtarget.js.map