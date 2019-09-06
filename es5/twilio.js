'use strict';

var Device = require('./twilio/device').default;

var _require = require('events'),
    EventEmitter = _require.EventEmitter;

var instance = void 0;
Object.defineProperty(Device, 'instance', {
  get: function get() {
    return instance;
  },
  set: function set(_instance) {
    if (_instance === null) {
      instance = null;
    }
  }
});

Device.destroy = function destroySingleton() {
  instance.destroy();
  bindSingleton();
};

/**
 * Create a new Device instance and bind its functions to the Device static. This maintains
 * backwards compatibility for the Device singleton behavior and will be removed in the next
 * breaking release.
 */
function bindSingleton() {
  instance = new Device();

  Object.getOwnPropertyNames(Device.prototype).concat(Object.getOwnPropertyNames(EventEmitter.prototype)).filter(function (prop) {
    return typeof Device.prototype[prop] === 'function';
  }).filter(function (prop) {
    return prop !== 'destroy';
  }).forEach(function (prop) {
    Device[prop] = Device.prototype[prop].bind(instance);
  });
}

bindSingleton();

Object.getOwnPropertyNames(instance).filter(function (prop) {
  return typeof Device.prototype[prop] !== 'function';
}).forEach(function (prop) {
  Object.defineProperty(Device, prop, {
    get: function get() {
      return instance[prop];
    },
    set: function set(_prop) {
      instance[prop] = _prop;
    }
  });
});

exports.Device = Device;
exports.PStream = require('./twilio/pstream').PStream;
exports.Connection = require('./twilio/connection').Connection;