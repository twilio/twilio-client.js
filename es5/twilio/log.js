"use strict";
/**
 * @packageDocumentation
 * @module Voice
 * @internalapi
 */
Object.defineProperty(exports, "__esModule", { value: true });
var LogLevelModule = require("loglevel");
var constants_1 = require("./constants");
/**
 * {@link Log} provides logging features throught the sdk using loglevel module
 * See https://github.com/pimterry/loglevel for documentation
 */
var Log = /** @class */ (function () {
    /**
     * @constructor
     * @param [options] - Optional settings
     */
    function Log(options) {
        try {
            this._log = (options && options.LogLevelModule ? options.LogLevelModule : LogLevelModule).getLogger(constants_1.PACKAGE_NAME);
        }
        catch (_a) {
            // tslint:disable-next-line
            console.warn('Cannot create custom logger');
            this._log = console;
        }
    }
    /**
     * Create the logger singleton instance if it doesn't exists
     * @returns The singleton {@link Log} instance
     */
    Log.getInstance = function () {
        if (!Log.instance) {
            Log.instance = new Log();
        }
        return Log.instance;
    };
    /**
     * Log a debug message
     * @param args - Any number of arguments to be passed to loglevel.debug
     */
    Log.prototype.debug = function () {
        var _a;
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        (_a = this._log).debug.apply(_a, args);
    };
    /**
     * Log an error message
     * @param args - Any number of arguments to be passed to loglevel.error
     */
    Log.prototype.error = function () {
        var _a;
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        (_a = this._log).error.apply(_a, args);
    };
    /**
     * Log an info message
     * @param args - Any number of arguments to be passed to loglevel.info
     */
    Log.prototype.info = function () {
        var _a;
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        (_a = this._log).info.apply(_a, args);
    };
    /**
     * Set a default log level to disable all logging below the given level
     */
    Log.prototype.setDefaultLevel = function (level) {
        if (this._log.setDefaultLevel) {
            this._log.setDefaultLevel(level);
        }
        else {
            // tslint:disable-next-line
            console.warn('Logger cannot setDefaultLevel');
        }
    };
    /**
     * Log a warning message
     * @param args - Any number of arguments to be passed to loglevel.warn
     */
    Log.prototype.warn = function () {
        var _a;
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        (_a = this._log).warn.apply(_a, args);
    };
    /**
     * Log levels
     */
    Log.levels = LogLevelModule.levels;
    return Log;
}());
exports.default = Log;
//# sourceMappingURL=log.js.map