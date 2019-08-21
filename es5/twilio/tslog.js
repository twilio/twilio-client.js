"use strict";
/**
 * @module Tools
 * @internalapi
 */
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Valid LogLevels.
 */
var LogLevel;
(function (LogLevel) {
    LogLevel["Off"] = "off";
    LogLevel["Debug"] = "debug";
    LogLevel["Info"] = "info";
    LogLevel["Warn"] = "warn";
    LogLevel["Error"] = "error";
})(LogLevel = exports.LogLevel || (exports.LogLevel = {}));
/**
 * Methods to call on console to log each LogLevel.
 */
var logLevelMethods = (_a = {},
    _a[LogLevel.Debug] = 'info',
    _a[LogLevel.Info] = 'info',
    _a[LogLevel.Warn] = 'warn',
    _a[LogLevel.Error] = 'error',
    _a);
/**
 * Ranking of LogLevel keys to determine which logs to print for a given LogLevel.
 */
var logLevelRanks = (_b = {},
    _b[LogLevel.Debug] = 0,
    _b[LogLevel.Info] = 1,
    _b[LogLevel.Warn] = 2,
    _b[LogLevel.Error] = 3,
    _b[LogLevel.Off] = 4,
    _b);
/**
 * @internalapi
 */
var Log = /** @class */ (function () {
    /**
     * @param logLevel - The initial LogLevel threshold to display logs for.
     * @param options
     */
    function Log(_logLevel, options) {
        this._logLevel = _logLevel;
        this._console = console;
        if (options && options.console) {
            this._console = options.console;
        }
    }
    Object.defineProperty(Log.prototype, "logLevel", {
        /**
         * The current LogLevel threshold.
         */
        get: function () { return this._logLevel; },
        enumerable: true,
        configurable: true
    });
    /**
     * Log a console.info message if the current LogLevel threshold is 'debug'.
     * @param args - Any number of arguments to be passed to console.info
     */
    Log.prototype.debug = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        this.log.apply(this, [LogLevel.Debug].concat(args));
    };
    /**
     * Log a console.error message if the current LogLevel threshold is 'error' or lower.
     * @param args - Any number of arguments to be passed to console.error
     */
    Log.prototype.error = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        this.log.apply(this, [LogLevel.Error].concat(args));
    };
    /**
     * Log a console.info message if the current LogLevel threshold is 'info' or lower.
     * @param args - Any number of arguments to be passed to console.info
     */
    Log.prototype.info = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        this.log.apply(this, [LogLevel.Info].concat(args));
    };
    /**
     * Log a console message if the current LogLevel threshold is equal to or less than the
     *   LogLevel specified.
     * @param logLevel - The LogLevel to compare to the current LogLevel to determine
     *   whether the log should be printed.
     * @param args - Any number of arguments to be passed to console
     */
    Log.prototype.log = function (logLevel) {
        var _a;
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var methodName = logLevelMethods[logLevel];
        if (methodName && logLevelRanks[this.logLevel] <= logLevelRanks[logLevel]) {
            (_a = this._console)[methodName].apply(_a, args);
        }
    };
    /**
     * Set/update the LogLevel threshold to apply to all future logs.
     * @param logLevel - The new LogLevel to use as a threshold for logs.
     */
    Log.prototype.setLogLevel = function (logLevel) {
        this._logLevel = logLevel;
    };
    /**
     * Log a console.warn message if the current LogLevel threshold is 'warn' or lower.
     * @param args - Any number of arguments to be passed to console.warn
     */
    Log.prototype.warn = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        this.log.apply(this, [LogLevel.Warn].concat(args));
    };
    return Log;
}());
exports.default = Log;
//# sourceMappingURL=tslog.js.map