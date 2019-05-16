const CapabilityToken = require('./capabilityToken');
const fs = require('fs');
const yaml = require('js-yaml');

const creds = yaml.safeLoad(fs.readFileSync('./config.yaml', 'utf8')).prod;

window.Twilio.getNewToken = function() {
  const token = new CapabilityToken({
    accountSid: creds.account_sid,
    authToken: creds.auth_token });

  token.addScope(new CapabilityToken.IncomingClientScope('alice'));
  token.addScope(new CapabilityToken.OutgoingClientScope({
    applicationSid: creds.app_sid,
    clientName: 'alice'
  }));

  return token.toJwt();
}
