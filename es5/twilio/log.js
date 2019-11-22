/**
 * Bestow logging powers.
 *
 * @exports mixinLog as Twilio.mixinLog
 * @memberOf Twilio
 *
 * @param {object} object The object to bestow logging powers to
 * @param {string} [prefix] Prefix log messages with this
 *
 * @return {object} Return the object passed in
 */
function mixinLog(object, prefix) {
    /**
     * Logs a message or object.
     *
     * <p>There are a few options available for the log mixin. Imagine an object
     * <code>foo</code> with this function mixed in:</p>
     *
     * <pre><code>var foo = {};
     * Twilio.mixinLog(foo);
     *
     * </code></pre>
     *
     * <p>To enable or disable the log: <code>foo.log.enabled = true</code></p>
     *
     * <p>To modify the prefix: <code>foo.log.prefix = 'Hello'</code></p>
     *
     * <p>To use a custom callback instead of <code>console.log</code>:
     * <code>foo.log.handler = function() { ... };</code></p>
     *
     * @param *args Messages or objects to be logged
     */
    function log() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!log.enabled) {
            return;
        }
        var format = log.prefix ? log.prefix + " " : '';
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            log.handler(typeof arg === 'string'
                ? format + arg
                : arg);
        }
    }
    function defaultWarnHandler(x) {
        /* eslint-disable no-console */
        if (typeof console !== 'undefined') {
            if (typeof console.warn === 'function') {
                console.warn(x);
            }
            else if (typeof console.log === 'function') {
                console.log(x);
            }
        }
        /* eslint-enable no-console */
    }
    function deprecated() {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        if (!log.warnings) {
            return;
        }
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            log.warnHandler(arg);
        }
    }
    log.enabled = true;
    log.prefix = prefix || '';
    /** @ignore */
    log.defaultHandler = function (x) {
        // eslint-disable-next-line no-console
        if (typeof console !== 'undefined') {
            console.log(x);
        }
    };
    log.handler = log.defaultHandler;
    log.warnings = true;
    log.defaultWarnHandler = defaultWarnHandler;
    log.warnHandler = log.defaultWarnHandler;
    log.deprecated = deprecated;
    log.warn = deprecated;
    object.log = log;
}
exports.mixinLog = mixinLog;
//# sourceMappingURL=log.js.map