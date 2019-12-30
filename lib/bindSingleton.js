var { EventEmitter } = require('events');

export function bindSingleton(Device) {
  let instance;

  /**
   * Create a new Device instance and bind its functions to the Device static. This maintains
   * backwards compatibility for the Device singleton behavior and will be removed in the next
   * breaking release.
   */
  function bindDevice() {
    instance = new Device();

    Object.getOwnPropertyNames(Device.prototype)
      .concat(Object.getOwnPropertyNames(EventEmitter.prototype))
      .filter(prop => typeof Device.prototype[prop] === 'function')
      .filter(prop => prop !== 'destroy')
      .forEach(prop => {
        Device[prop] = Device.prototype[prop].bind(instance);
      });
  }

  Object.defineProperty(Device, 'instance', {
    get: () => instance,
    set: _instance => {
      if (_instance === null) {
        instance = null;
      }
    }
  });

  Device.destroy = function destroySingleton() {
    instance.destroy();
    bindDevice();
  };

  bindDevice();

  Object.getOwnPropertyNames(instance)
    .filter(prop => typeof Device.prototype[prop] !== 'function')
    .forEach(prop => {
      Object.defineProperty(Device, prop, {
        get: () => instance[prop],
        set: _prop => {
          instance[prop] = _prop;
        }
      });
    });
}
