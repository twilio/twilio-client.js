"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @packageDocumentation
 * @module Voice
 * @preferred
 * @publicapi
 */
var events_1 = require("events");
var connection_1 = require("../connection");
var device_1 = require("../device");
/**
 * Runs some tests to identify issues, if any, prohibiting successful calling.
 */
var PreflightTest = /** @class */ (function (_super) {
    __extends(PreflightTest, _super);
    /**
     * Construct a {@link PreflightTest} instance.
     * @constructor
     * @param token - A Twilio JWT token string.
     * @param options
     */
    function PreflightTest(token, options) {
        var _this = _super.call(this) || this;
        /**
         * Network related timing measurements for this test
         */
        _this._networkTiming = {};
        /**
         * The options passed to {@link PreflightTest} constructor
         */
        _this._options = {
            codecPreferences: [connection_1.default.Codec.PCMU, connection_1.default.Codec.Opus],
            debug: false,
        };
        /**
         * Current status of this test
         */
        _this._status = PreflightTest.Status.Connecting;
        Object.assign(_this._options, options);
        _this._errors = [];
        _this._samples = [];
        _this._warnings = [];
        _this._startTime = Date.now();
        try {
            _this._device = new (options.deviceFactory || device_1.default)(token, {
                codecPreferences: _this._options.codecPreferences,
                debug: _this._options.debug,
            });
        }
        catch (error) {
            // We want to return before failing so the consumer can capture the event
            setTimeout(function () {
                _this._onFailed(error);
            });
            return _this;
        }
        _this._device.on('ready', function () {
            _this._onDeviceReady();
        });
        _this._device.on('error', function (error) {
            _this._onDeviceError(error);
        });
        return _this;
    }
    /**
     * Stops the current test and raises a failed event.
     */
    PreflightTest.prototype.stop = function () {
        var _this = this;
        var error = {
            code: 31008,
            message: 'Call cancelled',
        };
        this._device.once('offline', function () { return _this._onFailed(error); });
        this._device.destroy();
    };
    /**
     * Returns the report for this test.
     */
    PreflightTest.prototype._getReport = function () {
        var testTiming = { start: this._startTime };
        if (this._endTime) {
            testTiming.end = this._endTime;
            testTiming.duration = this._endTime - this._startTime;
        }
        return {
            callSid: this._callSid,
            errors: this._errors,
            networkTiming: this._networkTiming,
            samples: this._samples,
            stats: this._getRTCStats(),
            testTiming: testTiming,
            totals: this._getRTCSampleTotals(),
            warnings: this._warnings,
        };
    };
    /**
     * Returns RTC stats totals for this test
     */
    PreflightTest.prototype._getRTCSampleTotals = function () {
        if (!this._latestSample) {
            return;
        }
        return __assign({}, this._latestSample.totals);
    };
    /**
     * Returns RTC related stats captured during the test call
     */
    PreflightTest.prototype._getRTCStats = function () {
        var _this = this;
        if (!this._samples || !this._samples.length) {
            return;
        }
        return ['jitter', 'mos', 'rtt'].reduce(function (statObj, stat) {
            var _a;
            var values = _this._samples.map(function (s) { return s[stat]; });
            return __assign(__assign({}, statObj), (_a = {}, _a[stat] = {
                average: values.reduce(function (total, value) { return total + value; }) / values.length,
                max: Math.max.apply(Math, values),
                min: Math.min.apply(Math, values),
            }, _a));
        }, {});
    };
    /**
     * Called when the test has been completed
     */
    PreflightTest.prototype._onCompleted = function () {
        this._releaseHandlers();
        this._endTime = Date.now();
        this._status = PreflightTest.Status.Completed;
        this._report = this._getReport();
        this.emit(PreflightTest.Events.Completed, this._report);
    };
    /**
     * Called on {@link Device} error event
     * @param error
     */
    PreflightTest.prototype._onDeviceError = function (error) {
        if (PreflightTest.nonFatalErrors.includes(error.code)) {
            this._errors.push(error);
            this.emit(PreflightTest.Events.Error, error);
            return;
        }
        // This is a fatal error so we will fail the test.
        this._device.destroy();
        this._onFailed(error);
    };
    /**
     * Called on {@link Device} ready event
     */
    PreflightTest.prototype._onDeviceReady = function () {
        var _this = this;
        this._connection = this._device.connect();
        this._setupConnectionHandlers(this._connection);
        this._device.once('disconnect', function () {
            _this._device.once('offline', function () { return _this._onCompleted(); });
            _this._device.destroy();
        });
    };
    /**
     * Called when there is a fatal error
     * @param error
     */
    PreflightTest.prototype._onFailed = function (error) {
        this._releaseHandlers();
        this._endTime = Date.now();
        this._status = PreflightTest.Status.Failed;
        this.emit(PreflightTest.Events.Failed, error);
    };
    /**
     * Clean up all handlers for device and connection
     */
    PreflightTest.prototype._releaseHandlers = function () {
        [this._device, this._connection].forEach(function (emitter) {
            if (emitter) {
                emitter.eventNames().forEach(function (name) { return emitter.removeAllListeners(name); });
            }
        });
    };
    /**
     * Setup the event handlers for the {@link Connection} of the test call
     * @param connection
     */
    PreflightTest.prototype._setupConnectionHandlers = function (connection) {
        var _this = this;
        connection.on('warning', function (name, data) {
            _this._warnings.push({ name: name, data: data });
            _this.emit(PreflightTest.Events.Warning, name, data);
        });
        connection.once('accept', function () {
            _this._callSid = connection.mediaStream.callSid;
            _this._status = PreflightTest.Status.Connected;
            _this.emit(PreflightTest.Events.Connected);
        });
        connection.on('sample', function (sample) {
            // This is the first sample and no mos yet
            if (typeof sample.mos !== 'number' && !_this._samples.length) {
                return;
            }
            _this._latestSample = sample;
            _this._samples.push(sample);
            _this.emit(PreflightTest.Events.Sample, sample);
        });
        // TODO: Update the following once the SDK supports emitting these events
        // Let's shim for now
        [{
                reportLabel: 'peerConnection',
                type: 'pcconnection',
            }, {
                reportLabel: 'ice',
                type: 'iceconnection',
            }, {
                reportLabel: 'dtls',
                type: 'dtlstransport',
            }].forEach(function (_a) {
            var type = _a.type, reportLabel = _a.reportLabel;
            var handlerName = "on" + type + "statechange";
            var originalHandler = connection.mediaStream[handlerName];
            connection.mediaStream[handlerName] = function (state) {
                var timing = _this._networkTiming[reportLabel]
                    = _this._networkTiming[reportLabel] || { start: 0 };
                if (state === 'connecting' || state === 'checking') {
                    timing.start = Date.now();
                }
                else if (state === 'connected') {
                    timing.end = Date.now();
                    timing.duration = timing.end - timing.start;
                }
                originalHandler(state);
            };
        });
    };
    Object.defineProperty(PreflightTest.prototype, "callSid", {
        /**
         * The callsid generated for the test call.
         */
        get: function () {
            return this._callSid;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PreflightTest.prototype, "endTime", {
        /**
         * A timestamp in milliseconds of when the test ended.
         */
        get: function () {
            return this._endTime;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PreflightTest.prototype, "latestSample", {
        /**
         * The latest WebRTC sample collected.
         */
        get: function () {
            return this._latestSample;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PreflightTest.prototype, "report", {
        /**
         * The report for this test.
         */
        get: function () {
            return this._report;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PreflightTest.prototype, "startTime", {
        /**
         * A timestamp in milliseconds of when the test started.
         */
        get: function () {
            return this._startTime;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(PreflightTest.prototype, "status", {
        /**
         * The status of the test.
         */
        get: function () {
            return this._status;
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Non-fatal errors. We use this to determine whether we should fail the test or not.
     */
    PreflightTest.nonFatalErrors = [
        // Insights connection failure
        31400,
    ];
    return PreflightTest;
}(events_1.EventEmitter));
exports.PreflightTest = PreflightTest;
(function (PreflightTest) {
    /**
     * Possible events that a [[PreflightTest]] might emit.
     */
    var Events;
    (function (Events) {
        /**
         * See [[PreflightTest.completedEvent]]
         */
        Events["Completed"] = "completed";
        /**
         * See [[PreflightTest.connectedEvent]]
         */
        Events["Connected"] = "connected";
        /**
         * See [[PreflightTest.errorEvent]]
         */
        Events["Error"] = "error";
        /**
         * See [[PreflightTest.failedEvent]]
         */
        Events["Failed"] = "failed";
        /**
         * See [[PreflightTest.sampleEvent]]
         */
        Events["Sample"] = "sample";
        /**
         * See [[PreflightTest.warningEvent]]
         */
        Events["Warning"] = "warning";
    })(Events = PreflightTest.Events || (PreflightTest.Events = {}));
    /**
     * Possible status of the test.
     */
    var Status;
    (function (Status) {
        /**
         * Connection to Twilio has initiated.
         */
        Status["Connecting"] = "connecting";
        /**
         * Connection to Twilio has been established.
         */
        Status["Connected"] = "connected";
        /**
         * The connection to Twilio has been disconnected and the test call has completed.
         */
        Status["Completed"] = "completed";
        /**
         * The test has stopped and failed.
         */
        Status["Failed"] = "failed";
    })(Status = PreflightTest.Status || (PreflightTest.Status = {}));
})(PreflightTest = exports.PreflightTest || (exports.PreflightTest = {}));
exports.PreflightTest = PreflightTest;
//# sourceMappingURL=preflight.js.map