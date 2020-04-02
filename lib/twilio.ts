import { EventEmitter } from 'events';
import Connection from './twilio/connection';
import Device from './twilio/device';
import { PStream } from './twilio/pstream';

let instance: Device | null | undefined;
Object.defineProperty(Device, 'instance', {
  get: () => instance,
  set: (_instance) => {
    if (_instance === null) {
      instance = null;
    }
  },
});

(Device as any).destroy = function destroySingleton() {
  if (instance) {
    instance.destroy();
  }
  bindSingleton();
};

/**
 * Create a new Device instance and bind its functions to the Device static. This maintains
 * backwards compatibility for the Device singleton behavior and will be removed in the next
 * breaking release.
 */
function bindSingleton() {
  instance = new Device();

  Object.getOwnPropertyNames(Device.prototype)
    .concat(Object.getOwnPropertyNames(EventEmitter.prototype))
    .filter((prop: keyof Device) => {
      return typeof Device.prototype[prop] === 'function';
    })
    .filter(prop => prop !== 'destroy')
    .forEach(prop => {
      (Device as any)[prop] = (Device.prototype as any)[prop].bind(instance);
    });
}

bindSingleton();

Object.getOwnPropertyNames(instance)
  .filter((prop: keyof Device) => typeof Device.prototype[prop] !== 'function')
  .forEach((prop: keyof Device) => {
    Object.defineProperty(Device, prop, {
      get: () => {
        if (instance) {
          return instance[prop];
        }
      },
      set: (_prop) => {
        if (instance) {
          (instance as any)[prop] = _prop;
        }
      },
    });
  });

export { Connection, Device, PStream };
