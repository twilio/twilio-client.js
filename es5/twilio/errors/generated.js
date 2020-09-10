"use strict";
/* tslint:disable max-classes-per-file max-line-length */
/**
 * @packageDocumentation
 * @module Voice
 * @publicapi
 * @internal
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
// TypeScript doesn't allow extending Error so we need to run constructor logic on every one of these
// individually. Ideally this logic would be run in a constructor on a TwilioError class but
// due to this limitation TwilioError is an interface.
// https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes
function construct(context, messageOrError, originalError) {
    if (typeof messageOrError === 'string') {
        context.message = messageOrError;
        if (originalError instanceof Error) {
            context.originalError = originalError;
        }
    }
    else if (messageOrError instanceof Error) {
        context.originalError = messageOrError;
    }
}
var AuthorizationErrors;
(function (AuthorizationErrors) {
    var AccessTokenInvalid = /** @class */ (function (_super) {
        __extends(AccessTokenInvalid, _super);
        function AccessTokenInvalid(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 20101;
            _this.description = 'Invalid access token';
            _this.explanation = 'Twilio was unable to validate your Access Token';
            _this.solutions = [];
            Object.setPrototypeOf(_this, AuthorizationErrors.AccessTokenInvalid.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return AccessTokenInvalid;
    }(Error));
    AuthorizationErrors.AccessTokenInvalid = AccessTokenInvalid;
    var AccessTokenExpired = /** @class */ (function (_super) {
        __extends(AccessTokenExpired, _super);
        function AccessTokenExpired(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 20104;
            _this.description = 'Access token expired or expiration date invalid';
            _this.explanation = 'The Access Token provided to the Twilio API has expired, the expiration time specified in the token was invalid, or the expiration time specified was too far in the future';
            _this.solutions = [];
            Object.setPrototypeOf(_this, AuthorizationErrors.AccessTokenExpired.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return AccessTokenExpired;
    }(Error));
    AuthorizationErrors.AccessTokenExpired = AccessTokenExpired;
    var AuthenticationFailed = /** @class */ (function (_super) {
        __extends(AuthenticationFailed, _super);
        function AuthenticationFailed(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 20151;
            _this.description = 'Authentication Failed';
            _this.explanation = 'The Authentication with the provided JWT failed';
            _this.solutions = [];
            Object.setPrototypeOf(_this, AuthorizationErrors.AuthenticationFailed.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return AuthenticationFailed;
    }(Error));
    AuthorizationErrors.AuthenticationFailed = AuthenticationFailed;
})(AuthorizationErrors = exports.AuthorizationErrors || (exports.AuthorizationErrors = {}));
var ClientErrors;
(function (ClientErrors) {
    var BadRequest = /** @class */ (function (_super) {
        __extends(BadRequest, _super);
        function BadRequest(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 31400;
            _this.description = 'Bad Request (HTTP/SIP)';
            _this.explanation = 'The request could not be understood due to malformed syntax.';
            _this.solutions = [];
            Object.setPrototypeOf(_this, ClientErrors.BadRequest.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return BadRequest;
    }(Error));
    ClientErrors.BadRequest = BadRequest;
})(ClientErrors = exports.ClientErrors || (exports.ClientErrors = {}));
var GeneralErrors;
(function (GeneralErrors) {
    var UnknownError = /** @class */ (function (_super) {
        __extends(UnknownError, _super);
        function UnknownError(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 31000;
            _this.description = 'Unknown Error';
            _this.explanation = 'An unknown error has occurred. See error details for more information.';
            _this.solutions = [];
            Object.setPrototypeOf(_this, GeneralErrors.UnknownError.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return UnknownError;
    }(Error));
    GeneralErrors.UnknownError = UnknownError;
    var ConnectionError = /** @class */ (function (_super) {
        __extends(ConnectionError, _super);
        function ConnectionError(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 31005;
            _this.description = 'Connection error';
            _this.explanation = 'A connection error occurred during the call';
            _this.solutions = [];
            Object.setPrototypeOf(_this, GeneralErrors.ConnectionError.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return ConnectionError;
    }(Error));
    GeneralErrors.ConnectionError = ConnectionError;
    var TransportError = /** @class */ (function (_super) {
        __extends(TransportError, _super);
        function TransportError(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 31009;
            _this.description = 'Transport error';
            _this.explanation = 'No transport available to send or receive messages';
            _this.solutions = [];
            Object.setPrototypeOf(_this, GeneralErrors.TransportError.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return TransportError;
    }(Error));
    GeneralErrors.TransportError = TransportError;
})(GeneralErrors = exports.GeneralErrors || (exports.GeneralErrors = {}));
var SignalingErrors;
(function (SignalingErrors) {
    var ConnectionError = /** @class */ (function (_super) {
        __extends(ConnectionError, _super);
        function ConnectionError(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [];
            _this.code = 53000;
            _this.description = 'Signaling connection error';
            _this.explanation = 'Raised whenever a signaling connection error occurs that is not covered by a more specific error code.';
            _this.solutions = [];
            Object.setPrototypeOf(_this, SignalingErrors.ConnectionError.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return ConnectionError;
    }(Error));
    SignalingErrors.ConnectionError = ConnectionError;
    var ConnectionDisconnected = /** @class */ (function (_super) {
        __extends(ConnectionDisconnected, _super);
        function ConnectionDisconnected(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [
                'The device running your application lost its Internet connection.',
            ];
            _this.code = 53001;
            _this.description = 'Signaling connection disconnected';
            _this.explanation = 'Raised whenever the signaling connection is unexpectedly disconnected.';
            _this.solutions = [
                'Ensure the device running your application has access to a stable Internet connection.',
            ];
            Object.setPrototypeOf(_this, SignalingErrors.ConnectionDisconnected.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return ConnectionDisconnected;
    }(Error));
    SignalingErrors.ConnectionDisconnected = ConnectionDisconnected;
})(SignalingErrors = exports.SignalingErrors || (exports.SignalingErrors = {}));
var MediaErrors;
(function (MediaErrors) {
    var ClientLocalDescFailed = /** @class */ (function (_super) {
        __extends(ClientLocalDescFailed, _super);
        function ClientLocalDescFailed(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [
                'The Client may not be using a supported WebRTC implementation.',
                'The Client may not have the necessary resources to create or apply a new media description.',
            ];
            _this.code = 53400;
            _this.description = 'Client is unable to create or apply a local media description';
            _this.explanation = 'Raised whenever a Client is unable to create or apply a local media description.';
            _this.solutions = [
                'If you are experiencing this error using the JavaScript SDK, ensure you are running it with a supported WebRTC implementation.',
            ];
            Object.setPrototypeOf(_this, MediaErrors.ClientLocalDescFailed.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return ClientLocalDescFailed;
    }(Error));
    MediaErrors.ClientLocalDescFailed = ClientLocalDescFailed;
    var ClientRemoteDescFailed = /** @class */ (function (_super) {
        __extends(ClientRemoteDescFailed, _super);
        function ClientRemoteDescFailed(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [
                'The Client may not be using a supported WebRTC implementation.',
                'The Client may be connecting peer-to-peer with another Participant that is not using a supported WebRTC implementation.',
                'The Client may not have the necessary resources to apply a new media description.',
            ];
            _this.code = 53402;
            _this.description = 'Client is unable to apply a remote media description';
            _this.explanation = 'Raised whenever the Client receives a remote media description but is unable to apply it.';
            _this.solutions = [
                'If you are experiencing this error using the JavaScript SDK, ensure you are running it with a supported WebRTC implementation.',
            ];
            Object.setPrototypeOf(_this, MediaErrors.ClientRemoteDescFailed.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return ClientRemoteDescFailed;
    }(Error));
    MediaErrors.ClientRemoteDescFailed = ClientRemoteDescFailed;
    var ConnectionError = /** @class */ (function (_super) {
        __extends(ConnectionError, _super);
        function ConnectionError(messageOrError, originalError) {
            var _this = _super.call(this, '') || this;
            _this.causes = [
                'The Client was unable to establish a media connection.',
                'A media connection which was active failed liveliness checks.',
            ];
            _this.code = 53405;
            _this.description = 'Media connection failed';
            _this.explanation = 'Raised by the Client or Server whenever a media connection fails.';
            _this.solutions = [
                'If the problem persists, try connecting to another region.',
                'Check your Client\'s network connectivity.',
                'If you\'ve provided custom ICE Servers then ensure that the URLs and credentials are valid.',
            ];
            Object.setPrototypeOf(_this, MediaErrors.ConnectionError.prototype);
            construct(_this, messageOrError, originalError);
            return _this;
        }
        return ConnectionError;
    }(Error));
    MediaErrors.ConnectionError = ConnectionError;
})(MediaErrors = exports.MediaErrors || (exports.MediaErrors = {}));
/**
 * @private
 */
exports.errorsByCode = new Map([
    [20101, AuthorizationErrors.AccessTokenInvalid],
    [20104, AuthorizationErrors.AccessTokenExpired],
    [20151, AuthorizationErrors.AuthenticationFailed],
    [31400, ClientErrors.BadRequest],
    [31000, GeneralErrors.UnknownError],
    [31005, GeneralErrors.ConnectionError],
    [31009, GeneralErrors.TransportError],
    [53000, SignalingErrors.ConnectionError],
    [53001, SignalingErrors.ConnectionDisconnected],
    [53400, MediaErrors.ClientLocalDescFailed],
    [53402, MediaErrors.ClientRemoteDescFailed],
    [53405, MediaErrors.ConnectionError],
]);
Object.freeze(exports.errorsByCode);
//# sourceMappingURL=generated.js.map