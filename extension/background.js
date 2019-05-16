'use strict';

const token = Twilio.getNewToken();
Twilio.Device.setup(token, { debug: true });

Twilio.Device.offline(function(device) {
	console.log("Twilio.Device is offline, so getting a new token");
	Twilio.Device.setup(Twilio.getNewToken());
});

Twilio.Device.error(function(error) {
	console.log(error.message);
	console.log("Twilio.Device is offline due to an error, so getting a new token");
	Twilio.Device.setup(Twilio.getNewToken());
});
