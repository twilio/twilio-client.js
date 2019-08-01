const RELEASE_VERSION = '$version';
module.exports.SOUNDS_BASE_URL = 'https://media.twiliocdn.com/sdk/js/client/sounds/releases/1.0.0';
module.exports.RELEASE_VERSION = RELEASE_VERSION;

/**
 * All errors we plan to use need to be defined here.
 */
module.exports.USED_ERRORS = [
  'AuthorizationErrors.AccessTokenExpired',
  'AuthorizationErrors.AccessTokenInvalid',
  'AuthorizationErrors.AuthenticationFailed',
  'ClientErrors.BadRequest',
  'GeneralErrors.ConnectionError',
  'GeneralErrors.TransportError',
  'GeneralErrors.UnknownError',
  'MediaErrors.ClientLocalDescFailed',
  'MediaErrors.ClientRemoteDescFailed',
  'MediaErrors.ConnectionError',
  'SignalingErrors.ConnectionDisconnected',
  'SignalingErrors.ConnectionError',
];
