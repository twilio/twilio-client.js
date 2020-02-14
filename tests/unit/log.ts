import Log from '../../lib/twilio/log';
import * as assert from 'assert';
import * as sinon from 'sinon';

const packageName = require('../../package.json').name;

describe('Log', () => {
  let options: any;
  let _log: any;

  beforeEach(() => {
    _log = {
      debug: sinon.stub(),
      error: sinon.stub(),
      info: sinon.stub(),
      setDefaultLevel: sinon.stub(),
      warn: sinon.stub(),
    };
    options = {LogLevelModule: { getLogger :sinon.stub().returns(_log)}};
  });
  describe('constructor', () => {
    it('should return the same instance when using getInstance', () => {
      assert.equal(Log.getInstance(), Log.getInstance());
    });

    it('should initialize using correct package name', () => {
      const log = new Log(options);
      sinon.assert.calledWith(options.LogLevelModule.getLogger, packageName);
    });
  });

  describe('after init', () => {
    let log: Log;
    let args: any;

    beforeEach(() => {
      log = new Log(options);
      args = ['foo', { bar: 'baz' }];
    });

    it('should call loglevel.setDefaultLevel', () => {
      log.setDefaultLevel(Log.levels.DEBUG);
      sinon.assert.calledWithExactly(_log.setDefaultLevel, Log.levels.DEBUG);
    });

    ['debug', 'error', 'info', 'warn'].forEach(methodName => {
      it(`should call loglevel ${methodName} method`, () => {
        (log as any)[methodName](...args);
        sinon.assert.calledWithExactly.apply(sinon.assert, [_log[methodName], ...args]);
      });
    });
  });
});
