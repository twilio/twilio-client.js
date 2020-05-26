const PACKAGE_NAME = '$packageName';
const RELEASE_VERSION = '$version';
const SOUNDS_BASE_URL = 'https://sdk.twilio.com/js/client/sounds/releases/1.0.0';

module.exports.COWBELL_AUDIO_URL = `${SOUNDS_BASE_URL}/cowbell.mp3?cache=${RELEASE_VERSION}`;
module.exports.ECHO_TEST_DURATION = 20000;
module.exports.PACKAGE_NAME = PACKAGE_NAME;
module.exports.RELEASE_VERSION = RELEASE_VERSION;
module.exports.SOUNDS_BASE_URL = SOUNDS_BASE_URL;

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
