TwiML App - Record and Play
===========================

If `PreflightTest.Options.fakeMicInput` is set to `false`, `Device.testPreflight(token, options)` API requires a [token](https://www.twilio.com/docs/iam/access-tokens) with a TwiML app that can record an audio from a microphone and the ability to play the recorded audio back to the browser. In order to achieve this, we need two TwiML endpoints: one to capture and record the audio, and another one to play the recorded audio.

TwiML Bins
----------

In this example, we will use TwiML Bins for our TwiML app. Start by going to the [TwiML Bin](https://www.twilio.com/console/twiml-bins) page in the Twilio Console.

### TwiML App - Playback
Create a new TwiML Bin with the plus button on that screen and use `Playback` as the friendly name. Then use the following template under the TwiML section.

```xml
<?xml version="1.0" encoding="UTF-8"?>

<Response>
  <Say>You said:</Say>
  <Play loop="1">{{RecordingUrl}}</Play>
  <Say>Now waiting for a few seconds to gather audio performance metrics.</Say>
  <Pause length="3">
  <Say>Hanging up now.</Say>
</Response>
```

Go ahead and click the **Create** button and copy the TwiML Bin's url located at the top of the screen.

### TwiML App - Record
Using the [TwiML Bin](https://www.twilio.com/console/twiml-bins) page, let's create another TwiML Bin by clicking the plus button on that screen and use `Record` as the friendly name. Then replace the action url in the following template with your **TwiML Bin's Playback** url that you created previously. Let's use this template under the TwiML section.

```xml
<?xml version="1.0" encoding="UTF-8"?>

<Response>
  <Say>Record a message in 3, 2, 1</Say>
  <Record maxLength="5" action="https://my-record-twiml-url"></Record>
  <Say>Did not detect a message to record</Say>
</Response>
```

Go ahead and click the **Create** button and copy the TwiML Bin's url located at the top of the screen.

Creating the TwiML App
-----------------------

Now that we have created our TwiML Bins, let's create our TwiML app by going to the [TwiML Apps](https://www.twilio.com/console/voice/twiml/apps) page. Click the plus button on that screen and enter a friendly name that you prefer. Under Voice request url, enter the **TwiML Bin's Record** url that you created in the previous section, and then click the **Create** button.

On that same page, open the TwiML app that you just created by clicking on it and make note of the `SID`. You can now use this TwiML app to generate your [token](https://www.twilio.com/docs/iam/access-tokens) when calling `Device.testPreflight(token, options)` API.


TwiML App - Echo
================

If `PreflightTest.Options.fakeMicInput` is set to `true`, `Device.testPreflight(token, options)` API requires a [token](https://www.twilio.com/docs/iam/access-tokens) with a single TwiML app that can capture and play an audio. Following the [previous steps](#twiml-bins), create a TwiML Bin using the following template, and name it `Echo`.

```xml
<?xml version="1.0" encoding="UTF-8"?>

<Response>
  <Echo/>
</Response>
```

Now that we have our `Echo` TwiML Bin, [create your TwiML App](#creating-the-twiml-app) and use the `echo` TwiML Bin's url under Voice request url. Make note of the TwiML App `SID` and use it to generate the [token](https://www.twilio.com/docs/iam/access-tokens).
