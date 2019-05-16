import Log, { LogLevel } from '../../lib/twilio/tslog';

import * as assert from 'assert';
import { SinonSpy } from 'sinon';
import * as sinon from 'sinon';

class MockConsole {
  constructor() { }
  info(...args: any[]) { }
  warn(...args: any[]) { }
  error(...args: any[]) { }
}

/* tslint:disable-next-line */
describe('Log', function() {
  let log: Log;
  let mockConsole: MockConsole;
  let infoSpy: SinonSpy;
  let errorSpy: SinonSpy;
  let warnSpy: SinonSpy;

  beforeEach(() => {
    mockConsole = new MockConsole();
    infoSpy = mockConsole.info = sinon.spy(mockConsole.info);
    warnSpy = mockConsole.warn = sinon.spy(mockConsole.warn);
    errorSpy = mockConsole.error = sinon.spy(mockConsole.error);

  });

  it('should not break when using real console', () => {
    log = new Log(LogLevel.Info);
    log.info('CONSOLE TEST');
  });

  describe('.setLogLevel', () => {
    it('should change .logLevel to the passed value', () => {
      log.setLogLevel(LogLevel.Debug);
      assert.equal(log.logLevel, LogLevel.Debug);
      log.setLogLevel(LogLevel.Info);
      assert.equal(log.logLevel, LogLevel.Info);
      log.setLogLevel(LogLevel.Warn);
      assert.equal(log.logLevel, LogLevel.Warn);
      log.setLogLevel(LogLevel.Error);
      assert.equal(log.logLevel, LogLevel.Error);
      log.setLogLevel(LogLevel.Off);
      assert.equal(log.logLevel, LogLevel.Off);
    });
  });

  context('when threshold is debug', () => {
    beforeEach(() => {
      log = new Log(LogLevel.Debug, { console: mockConsole });
    });

    it('.debug should call console.info', () => {
      log.debug('a', 1);
      assert.equal(infoSpy.callCount, 1);
      assert(infoSpy.calledWithExactly('a', 1));
    });

    it('.info should call console.info', () => {
      log.info('a', 1);
      assert.equal(infoSpy.callCount, 1);
      assert(infoSpy.calledWithExactly('a', 1));
    });

    it('.error should call console.error', () => {
      log.error('a', 1);
      assert.equal(errorSpy.callCount, 1);
      assert(errorSpy.calledWithExactly('a', 1));
    });

    it('.warn should call console.warn', () => {
      log.warn('a', 1);
      assert.equal(warnSpy.callCount, 1);
      assert(warnSpy.calledWithExactly('a', 1));
    });

    it('.log(LogLevel.Off) should not call any console method', () => {
      log.log(LogLevel.Off, 'a', 1);
      assert.equal(infoSpy.callCount, 0);
      assert.equal(warnSpy.callCount, 0);
      assert.equal(errorSpy.callCount, 0);
    });
  });

  context('when threshold is info', () => {
    beforeEach(() => {
      log = new Log(LogLevel.Info, { console: mockConsole });
    });

    it('.debug should not call console.info', () => {
      log.debug('a', 1);
      assert.equal(infoSpy.callCount, 0);
    });

    it('.info should call console.info', () => {
      log.info('a', 1);
      assert.equal(infoSpy.callCount, 1);
      assert(infoSpy.calledWithExactly('a', 1));
    });

    it('.error should call console.error', () => {
      log.error('a', 1);
      assert.equal(errorSpy.callCount, 1);
      assert(errorSpy.calledWithExactly('a', 1));
    });

    it('.warn should call console.warn', () => {
      log.warn('a', 1);
      assert.equal(warnSpy.callCount, 1);
      assert(warnSpy.calledWithExactly('a', 1));
    });

    it('.log(LogLevel.Off) should not call any console method', () => {
      log.log(LogLevel.Off, 'a', 1);
      assert.equal(infoSpy.callCount, 0);
      assert.equal(warnSpy.callCount, 0);
      assert.equal(errorSpy.callCount, 0);
    });
  });

  context('when threshold is warn', () => {
    beforeEach(() => {
      log = new Log(LogLevel.Warn, { console: mockConsole });
    });

    it('.debug should not call console.info', () => {
      log.debug('a', 1);
      assert.equal(infoSpy.callCount, 0);
    });

    it('.info should not call console.info', () => {
      log.info('a', 1);
      assert.equal(infoSpy.callCount, 0);
    });

    it('.error should call console.error', () => {
      log.error('a', 1);
      assert.equal(errorSpy.callCount, 1);
      assert(errorSpy.calledWithExactly('a', 1));
    });

    it('.warn should call console.warn', () => {
      log.warn('a', 1);
      assert.equal(warnSpy.callCount, 1);
      assert(warnSpy.calledWithExactly('a', 1));
    });

    it('.log(LogLevel.Off) should not call any console method', () => {
      log.log(LogLevel.Off, 'a', 1);
      assert.equal(infoSpy.callCount, 0);
      assert.equal(warnSpy.callCount, 0);
      assert.equal(errorSpy.callCount, 0);
    });
  });

  context('when threshold is error', () => {
    beforeEach(() => {
      log = new Log(LogLevel.Error, { console: mockConsole });
    });

    it('.debug should not call console.info', () => {
      log.debug('a', 1);
      assert.equal(infoSpy.callCount, 0);
    });

    it('.info should not call console.info', () => {
      log.info('a', 1);
      assert.equal(infoSpy.callCount, 0);
    });

    it('.error should call console.error', () => {
      log.error('a', 1);
      assert.equal(errorSpy.callCount, 1);
      assert(errorSpy.calledWithExactly('a', 1));
    });

    it('.warn should not call console.warn', () => {
      log.warn('a', 1);
      assert.equal(warnSpy.callCount, 0);
    });

    it('.log(LogLevel.Off) should not call any console method', () => {
      log.log(LogLevel.Off, 'a', 1);
      assert.equal(infoSpy.callCount, 0);
      assert.equal(warnSpy.callCount, 0);
      assert.equal(errorSpy.callCount, 0);
    });
  });

  context('when threshold is off', () => {
    beforeEach(() => {
      log = new Log(LogLevel.Off, { console: mockConsole });
    });

    it('.debug should not call console.info', () => {
      log.debug('a', 1);
      assert.equal(infoSpy.callCount, 0);
    });

    it('.info should not call console.info', () => {
      log.info('a', 1);
      assert.equal(infoSpy.callCount, 0);
    });

    it('.error should not call console.error', () => {
      log.error('a', 1);
      assert.equal(errorSpy.callCount, 0);
    });

    it('.warn should not call console.warn', () => {
      log.warn('a', 1);
      assert.equal(warnSpy.callCount, 0);
    });

    it('.log(LogLevel.Off) should not call any console method', () => {
      log.log(LogLevel.Off, 'a', 1);
      assert.equal(infoSpy.callCount, 0);
      assert.equal(warnSpy.callCount, 0);
      assert.equal(errorSpy.callCount, 0);
    });
  });
});
