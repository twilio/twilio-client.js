import Logger from '../../lib/twilio/logger';
import * as assert from 'assert';
import * as sinon from 'sinon';

const packageName = require('../../package.json').name;

describe('Logger', () => {
  let options: any;
  let _logger: any;

  beforeEach(() => {
    _logger = {
      debug: sinon.stub(),
      error: sinon.stub(),
      info: sinon.stub(),
      setDefaultLevel: sinon.stub(),
      warn: sinon.stub(),
    };
    options = {LogLevelModule: { getLogger :sinon.stub().returns(_logger)}};
  });
  describe('constructor', () => {
    it('should return the same instance when using getInstance', () => {
      assert.equal(Logger.getInstance(), Logger.getInstance());
    });

    it('should initialize using correct package name', () => {
      const logger = new Logger(options);
      sinon.assert.calledWith(options.LogLevelModule.getLogger, packageName);
    });
  });

  describe('after init', () => {
    let logger: Logger;
    let args: any;

    beforeEach(() => {
      logger = new Logger(options);
      args = ['foo', { bar: 'baz' }];
    });

    it('should call loglevel.setDefaultLevel', () => {
      logger.setDefaultLevel(Logger.levels.DEBUG);
      sinon.assert.calledWithExactly(_logger.setDefaultLevel, Logger.levels.DEBUG);
    });

    ['debug', 'error', 'info', 'warn'].forEach(methodName => {
      it(`should call loglevel ${methodName} method`, () => {
        (logger as any)[methodName](...args);
        sinon.assert.calledWithExactly.apply(sinon.assert, [_logger[methodName], ...args]);
      });
    });
  });
});
