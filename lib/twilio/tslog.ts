/**
 * @module Tools
 * @internalapi
 */

/**
 * Valid LogLevels.
 */
export enum LogLevel {
  Off = 'off',
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

/**
 * Methods to call on console to log each LogLevel.
 */
const logLevelMethods: Record<string, string> = {
  [LogLevel.Debug]: 'info',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
};

/**
 * Ranking of LogLevel keys to determine which logs to print for a given LogLevel.
 */
const logLevelRanks: Record<string, number> = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
  [LogLevel.Off]: 4,
};

/**
 * Valid options for constructing a Log instance.
 */
export interface ILogOptions {
  /**
   * Override the console object for testing.
   */
  console: any;
}

/**
 * @internalapi
 */
export default class Log {
  private readonly _console: Console = console;

  /**
   * The current LogLevel threshold.
   */
  get logLevel() { return this._logLevel; }

  /**
   * @param logLevel - The initial LogLevel threshold to display logs for.
   * @param options
   */
  constructor(private _logLevel: LogLevel, options?: ILogOptions) {
    if (options && options.console) {
      this._console = options.console;
    }
  }

  /**
   * Log a console.info message if the current LogLevel threshold is 'debug'.
   * @param args - Any number of arguments to be passed to console.info
   */
  debug(...args: any[]): void {
    this.log(LogLevel.Debug, ...args);
  }

  /**
   * Log a console.error message if the current LogLevel threshold is 'error' or lower.
   * @param args - Any number of arguments to be passed to console.error
   */
  error(...args: any[]): void {
    this.log(LogLevel.Error, ...args);
  }

  /**
   * Log a console.info message if the current LogLevel threshold is 'info' or lower.
   * @param args - Any number of arguments to be passed to console.info
   */
  info(...args: any[]): void {
    this.log(LogLevel.Info, ...args);
  }

  /**
   * Log a console message if the current LogLevel threshold is equal to or less than the
   *   LogLevel specified.
   * @param logLevel - The LogLevel to compare to the current LogLevel to determine
   *   whether the log should be printed.
   * @param args - Any number of arguments to be passed to console
   */
  log(logLevel: LogLevel, ...args: any[]): void {
    const methodName = logLevelMethods[logLevel];
    if (methodName && logLevelRanks[this.logLevel] <= logLevelRanks[logLevel]) {
      (this._console as any)[methodName](...args);
    }
  }

  /**
   * Set/update the LogLevel threshold to apply to all future logs.
   * @param logLevel - The new LogLevel to use as a threshold for logs.
   */
  setLogLevel(logLevel: LogLevel): void {
    this._logLevel = logLevel;
  }

  /**
   * Log a console.warn message if the current LogLevel threshold is 'warn' or lower.
   * @param args - Any number of arguments to be passed to console.warn
   */
  warn(...args: any[]): void {
    this.log(LogLevel.Warn, ...args);
  }
}
