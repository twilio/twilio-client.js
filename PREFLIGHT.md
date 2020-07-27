Preflight Test
==============

The SDK supports a preflight test API which can help determine Voice calling readiness. The API creates a test call and will provide information to help troubleshoot call related issues. This new API is a static member of the [Device](https://www.twilio.com/docs/voice/client/javascript/device#twilio-device) class and can be used by calling `Device.testPreflight(token, options)`. For example:

```ts
import { Device, PreflightTest } from 'twilio-client';

const preflightTest = Device.testPreflight(token, options);

preflightTest.on(PreflightTest.Events.Completed, (report) => {
  console.log(report);
});

preflightTest.on(PreflightTest.Events.Failed, (error) => {
  console.log(error);
});
```

## Parameters

### Token
`Device.testPreflight(token, options)` requires a [Twilio Access Token](https://www.twilio.com/docs/iam/access-tokens) to initiate the test call. This access token will be passed directly to the [Device's constructor](https://www.twilio.com/docs/voice/client/javascript/device#setup) and will be used to connect to a TwiML app that you associated with your [Twilio Access Token](https://www.twilio.com/docs/iam/access-tokens). In order to get better results, the TwiML app should be able to record audio from a microphone and play it back to the browser. Please see [Preflight Test TwiML App](PREFLIGHT_TWIML.md) for details.

### Options
The `PreflightTest.Options` parameter is a JavaScript object containing configuration settings. Available settings are listed below:

| Property | Default | Description |
|:---------|:--------|:------------|
| `codecPreferences` | `['pcmu', 'opus']` | An ordered list of preferred codecs. |
| `debug` | `false` | Can be `true` or `false`. Set this property to true to enable debug logging in your browser console. |
| `edge` | `roaming` | Specifies which Twilio `edge` to use when initiating the test call. Please see documentation on [edges](https://www.twilio.com/docs/voice/client/edges). |
| `fakeMicInput` | `false` | If set to `true`, the test call will ignore microphone input and will use a default audio file. If set to `false`, the test call will capture the audio from the microphone. |
| `iceServers` | `null` | An array of custom ICE servers to use to connect media. If you provide both STUN and TURN server configurations, the test will detect whether a TURN server is required to establish a connection. See [Using Twilio NTS for Generating STUN/TURN Credentials](#using-twilio-nts-for-generating-stunturn-credentials) |
| `signalingTimeoutMs` | `10000` | Ammount of time to wait for setting up signaling connection. |

### Using Twilio NTS for Generating STUN/TURN Credentials
The following example demonstrates how to use [Twilio's Network Traversal Service](https://www.twilio.com/stun-turn) to generate STUN/TURN credentials and how to specify a specific [edge location](https://www.twilio.com/docs/global-infrastructure/edge-locations).

```ts
import Client from 'twilio';
import { Device } from 'twilio-client';

// Generate the STUN and TURN server credentials with a ttl of 120 seconds
const client = Client(twilioAccountSid, authToken);
const token = await client.tokens.create({ ttl: 120 });

let iceServers = token.iceServers;

// By default, global will be used as the default edge location.
// You can replace global with a specific edge name for each of the iceServer configuration.
iceServers = iceServers.map(config => {
  let { url, urls, ...rest } = config;
  url = url.replace('global', 'ashburn');
  urls = urls.replace('global', 'ashburn');

  return { url, urls, ...rest };
});

// Use the TURN credentials using the iceServers parameter
const preflightTest = Device.testPreflight(token, { iceServers });

// Read from the report object to determine whether TURN is required to connect to media
preflightTest.on('completed', (report) => {
  console.log(report.isTurnRequired);
});
```

Events
------

The `PreflightTest` object that is returned by `Device.testPreflight(token, options)` is an [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter), and as such its events can be subscribed to via `preflightTest.on(eventName, handler)`. The following is a list of all supported events that might get emitted throughout the duration of the test.

#### .on('completed', handler(report))
Raised when `PreflightTest.status` has transitioned to `PreflightTest.Status.Completed`. During this time, the `report` is available and ready to be inspected. This will not trigger if a fatal error is encountered during the test. Example report:

```js
{
  "callSid": "CAa6a7a187a9cba2714d6fdccf472cc7b1",

  /**
   * The quality of the call, determined by the MOS (Mean Opinion Score) of the audio stream. Possible values include
   * PreflightTest.CallQuality.Excellent - If the average mos is over 4.2
   * PreflightTest.CallQuality.Great - If the average mos is between 4.1 and 4.2 both inclusive
   * PreflightTest.CallQuality.Good - If the average mos is between 3.7 and 4.0 both inclusive
   * PreflightTest.CallQuality.Fair - If the average mos is between 3.1 and 3.6 both inclusive
   * PreflightTest.CallQuality.Degraded - If the average mos is 3.0 or below
   */
  "callQuality": "excellent",

  /**
   * An array of WebRTC stats for the ICE candidates gathered when connecting to media.
   * Each item is an RTCIceCandidateStats object which provides information related to an ICE candidate.
   * See RTCIceCandidateStats for more details https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateStats
   */
  "iceCandidateStats": [...]

  /**
   * A WebRTC stats for the ICE candidate pair used to connect to media, if candidates were selected.
   * Each item is an RTCIceCandidateStats object which provides information related to an ICE candidate.
   * See RTCIceCandidateStats for more details https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidateStats
   */
  "selectedIceCandidatePairStats": {
    "localCandidate": {...},
    "remoteCandidate": {...}
  }

  /**
   * Whether a TURN server is required to connect to media.
   * This is dependent on the selected ICE candidates, and will be true if either is of type "relay",
   * false if both are of another type, or undefined if there are no selected ICE candidates.
   * See `PreflightTest.Options.iceServers` for more details.
   */
  "isTurnRequired": false,

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
   * The edge passed to `Device.testPreflight`.
   */
  "selectedEdge": "roaming",

  /**
   * The edge that the test call was connected to.
   */
  "edge": "ashburn",

  /**
   * Warnings detected during the test.
   * These are coming from Connection.on('warning').
   */
  "warnings": [...]
}
```

#### .on('connected', handler())
Raised when `PreflightTest.status` has transitioned to `PreflightTest.Status.Connected`. This means, the connection to Twilio has been established.

#### .on('failed', handler(error))
Raised when `PreflightTest.status` has transitioned to `PreflightTest.Status.Failed`. This happens when establishing a connection to Twilio has failed or when a test call has encountered a fatal error. This is also raised if `PreflightTest.stop` is called while the test is in progress. The error emitted from this event is coming from [Device.on('error)](https://www.twilio.com/docs/voice/client/javascript/device#error) and uses the same error format.

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
