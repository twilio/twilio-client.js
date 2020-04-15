Preflight Test
==============

The SDK supports a preflight test API which can help determine Voice calling readiness. The API creates a test call and will provide information to help troubleshoot call related issues. This new API is a static member of the [Device](https://www.twilio.com/docs/voice/client/javascript/device#twilio-device) class and can be used by calling `Device.testPreflight(token, options)`. For example:

```ts
const preflightTest = Device.testPreflight(token, options);
```

## Parameters

### Token
`Device.testPreflight(token, options)` requires a [Twilio Access Token](https://www.twilio.com/docs/iam/access-tokens) to initiate the test call. This access token will be passed directly to the [Device's constructor](https://www.twilio.com/docs/voice/client/javascript/device#setup) and will be used to connect to a TwiML app that you associated with your [Twilio Access Token](https://www.twilio.com/docs/iam/access-tokens). In order to get better results, the TwiML app should be able to record audio from a microphone and play it back to the browser. Please see [Preflight Test TwiML App](PREFLIGHT_TWIML.md) for details.

### Options
The `options` parameter is a JavaScript object containing configuration settings. Available settings are listed below:

| Property | Default | Description |
|:---------|:--------|:------------|
| `codecPreferences` | `['pcmu', 'opus']` | An ordered list of preferred codecs. |
| `debug` | `false` | Can be `true` or `false`. Set this property to true to enable debug logging in your browser console. |

Events
------

The `PreflightTest` object that is returned by `Device.testPreflight(token, options)` is an [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter), and as such its events can be subscribed to via `preflightTest.on(eventName, handler)`. The following is a list of all supported events that might get emitted throughout the duration of the test.

#### .on('completed', handler(report))
Raised when `PreflightTest.status` has transitioned to `completed`. During this time, the `report` is available and ready to be inspected. In some cases, this will not trigger if the test encounters a fatal error prior connecting to Twilio. Example report:

```js
{
  "callSid": "CAa6a7a187a9cba2714d6fdccf472cc7b1",

  /**
   * Network related time measurements which includes millisecond timestamps
   * and duration for each type of connection.
   */
  "networkTiming": {
    /**
     * Measurements for establishing DTLS connection.
     * This is measured from RTCDtlsTransport `connecting` to `connected` state.
     * See RTCDtlsTransport state
     * https://developer.mozilla.org/en-US/docs/Web/API/RTCDtlsTransport/state.
     */
    "dtls": {
      "start": 1584573229981,
      "end": 1584573230166,
      "duration": 185
    },

    /**
     * Measurements for establishing ICE connection.
     * This is measured from ICE connection `checking` to `connected` state.
     * See RTCPeerConnection.iceConnectionState
     * https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState.
     */
    "ice": {
      "start": 1584573229898,
      "end": 1584573229982,
      "duration": 84
    },

    /**
     * Measurements for establishing a PeerConnection.
     * This is measured from PeerConnection `connecting` to `connected` state.
     * See RTCPeerConnection.connectionState
     * https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState.
     */
    "peerConnection": {
      "start": 1584573229902,
      "end": 1584573230167,
      "duration": 265
    }
  },

  /**
   * RTC related stats that are extracted from WebRTC samples.
   * This information includes maximum, minimum, and average values calculated for each stat.
   */
  "stats": {
    "jitter": {
      "average": 35,
      "max": 35,
      "min": 35
    },
    "mos": {
      "average": 2,
      "max": 2,
      "min": 2
    },
    "rtt": {
      "average": 80.33,
      "max": 88,
      "min": 77
    }
  },

  /**
   * Timing measurement related to the test.
   * Includes millisecond timestamps and duration.
   */
  "testTiming": {
    "start": 1584573229085,
    "end": 1584573242279,
    "duration": 13194
  },

  /**
   * Calculated totals in RTC statistics samples.
   */
  "totals": {
    "bytesReceived": 62720,
    "bytesSent": 93760,
    "packetsLost": 0,
    "packetsLostFraction": 0,
    "packetsReceived": 392,
    "packetsSent": 586
  },

  /**
   * Array of samples collected during the test.
   * See sample object format here
   * https://www.twilio.com/docs/voice/client/javascript/connection#sample
   */
  "samples": [...],

  /**
   * The region passed to the `Twilio.Device`.
   */
  "selectedRegion": "foobar",

  /**
   * The region that the `Twilio.Device` actually connected to.
   */
  "region": "biffbazz",

  /**
   * Warnings detected during the test.
   * These are coming from Connection.on('warning').
   */
  "warnings": [...]
}
```

#### .on('connected', handler())
Raised when `PreflightTest.status` has transitioned to `connected`. This means, the connection to Twilio has been established.

#### .on('failed', handler(error))
Raised when `PreflightTest.status` has transitioned to `failed`. This happens when establishing a connection to Twilio has failed or when a test call has encountered a fatal error. This is also raised if `PreflightTest.stop` is called while the test is in progress. The error emitted from this event is coming from [Device.on('error)](https://www.twilio.com/docs/voice/client/javascript/device#error) and uses the same error format.

#### .on('sample', handler(sample))
This event is published every second and is raised when the [Connection](https://www.twilio.com/docs/voice/client/javascript/connection) gets a webrtc sample object. The `sample` object is coming from [Connection.on('sample')](https://www.twilio.com/docs/voice/client/javascript/connection#sample) and uses the same `sample` format.

#### .on('warning', handler(warningName, warningData))
Raised whenever the [Connection](https://www.twilio.com/docs/voice/client/javascript/connection) encounters a warning. This is coming from [Connection.on('warning')](https://www.twilio.com/docs/voice/client/javascript/connection#onwarning-handlerwarningname) and uses the same API format.

Properties
----------
You can access the following properties on the `PreflightTest` object:

* `callSid` - The callsid generated for the test call. This is set when the client has finished connecting to Twilio.
* `endTime` - A timestamp in milliseconds of when the test ended. This is set when the test has completed and raised the `completed` event.
* `latestSample` - The latest WebRTC sample collected. This is set whenever the connection emits a `sample`. Please see [Connection.on('sample')](https://www.twilio.com/docs/voice/client/javascript/connection#sample) API for more details.
* `report` - The report for this test. This is set when the test has completed and raised the `completed` event.
* `startTime` - A timestamp in milliseconds of when the test started. This is set right after calling `Device.testPreflight(token, options)`.
* `status` - The status of the test. Below are the possible values for this property.

  | Value | Description |
  |:------|:------------|
  | Completed | The connection to Twilio has been disconnected and the test call has completed. |
  | Connected | The connection to Twilio has been established. |
  | Connecting | Connecting to Twilio has started. |
  | Failed | The test has stopped and failed. |

Methods
-------

#### .stop()

Calling this method from the `PreflightTest` object will stop the existing test and will raise a `failed` event with an error code `31008` indicating that the call has been cancelled.
