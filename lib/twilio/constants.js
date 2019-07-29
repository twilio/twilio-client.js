const pkg = require('../../package.json');

module.exports.SOUNDS_BASE_URL = 'https://media.twiliocdn.com/sdk/js/client/sounds/releases/1.0.0';
module.exports.RELEASE_VERSION = pkg.version;

/**
 * All errors we plan to use need to be defined here.
 */
module.exports.USED_ERRORS = [
  'MediaErrors.UserMediaDenied',
  'SignalingErrors.ConnectionDisconnected'
];
