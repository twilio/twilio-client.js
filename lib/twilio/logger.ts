/**
 * @module Voice
 * @internalapi
 */

import * as LogLevelModule from 'loglevel';
import { PACKAGE_NAME } from './constants';

/**
 * Options that may be passed to the {@link Logger} constructor for internal testing.
 * @private
 */
export interface LoggerOptions {
  /**
   * Custom loglevel module
   */
  LogLevelModule: any;
}

/**
 * {@link Logger} provides logging features throught the sdk using loglevel module
 * See https://github.com/pimterry/loglevel for documentation
 */
class Logger {
  /**
   * Logger log levels
   */
  static levels: LogLevelModule.LogLevel = LogLevelModule.levels;

  /**
   * Create the logger singleton instance if it doesn't exists
   * @returns The singleton {@link Logger} instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * The logger singleton instance
   */
  private static instance: Logger;

  /**
   * The loglevel logger instance that will be used in this {@link Logger}
   */
  private _log: LogLevelModule.Logger;

  /**
   * @constructor
   * @param [options] - Optional settings
   */
  constructor(options?: LoggerOptions) {
    this._log = (options && options.LogLevelModule ? options.LogLevelModule : LogLevelModule).getLogger(PACKAGE_NAME);
  }

  /**
   * Log a debug message
   * @param args - Any number of arguments to be passed to loglevel.debug
   */
  debug(...args: any[]): void {
    this._log.debug(...args);
  }

  /**
   * Log an error message
   * @param args - Any number of arguments to be passed to loglevel.error
   */
  error(...args: any[]): void {
    this._log.error(...args);
  }

  /**
   * Log an info message
   * @param args - Any number of arguments to be passed to loglevel.info
   */
  info(...args: any[]): void {
    this._log.info(...args);
  }

  /**
   * Set a default log level to disable all logging below the given level
   */
  setDefaultLevel(level: LogLevelModule.LogLevelDesc): void {
    this._log.setDefaultLevel(level);
  }

  /**
   * Log a warning message
   * @param args - Any number of arguments to be passed to loglevel.warn
   */
  warn(...args: any[]): void {
    this._log.warn(...args);
  }
}

export default Logger;
