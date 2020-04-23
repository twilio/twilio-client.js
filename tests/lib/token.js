const Twilio = require('twilio');
const env = require('../env.js');

function generateAccessToken(identity, ttl, appSid) {
  const accessToken = new Twilio.jwt.AccessToken(env.accountSid,
    env.apiKeySid,
    env.apiKeySecret,
    { ttl: ttl || 300, identity });

  accessToken.addGrant(new Twilio.jwt.AccessToken.VoiceGrant({
    incomingAllow: true,
    outgoingApplicationSid: appSid || env.appSid,
  }));

  return accessToken.toJwt();
}

function generateCapabilityToken() {
  const outgoingScope = new Twilio.jwt.ClientCapability.OutgoingClientScope({
    applicationSid: env.appSid
  });

  const token = new Twilio.jwt.ClientCapability({
    accountSid: env.accountSid,
    authToken: env.authToken,
  });

  token.addScope(outgoingScope);
  return token.toJwt();
}

module.exports = { generateAccessToken, generateCapabilityToken };
