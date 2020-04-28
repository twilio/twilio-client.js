1.10.3 (In Progress)
===================

Bug Fixes
---------

* Fixed an issue where `rtcSample.rtt` raised by `Connection.on('sample', rtcSample => ...)` was reported in seconds instead of milliseconds in Firefox. If your application is converting `rtcSample.rtt` to milliseconds in Firefox, please update your application to account for this change. (CLIENT-7014)
* Fixed an issue where a call doesn't get disconnected after the signaling server emits a `cancel` event. (CLIENT-7576)

Additions
---------

* Added tests for Signaling payloads. (CLIENT-4533)

1.10.2 (Apr 22, 2020)
===================

Bug Fixes
---------

* Fixed an issue where an Angular project will not build when the SDK is used as a module. (CLIENT-7544)
* Fixed an issue where certain device event handlers, when an exception is thrown, causes some connection event handlers to stop working. This causes potential side effects such as incoming ringtone not being able to stop after receiving a call.
  #### Example
  In the following example, `connection.on('accept')` will not trigger if `device.on('connect')` throws an error. With this fix, `connection.on('accept')` handler should now receive the event.

  ```ts
  connection.on('accept', () => {
    console.log('This is my "accept" handler.');
  });

  device.on('connect', () => {
    throw 'Something went wrong.';
  });
  ```

  #### Events affected
  The following are the events affected and should be fixed with this release.

  | Device Events           | Affected Connection Events  |
  |:------------------------|:----------------------------|
  | device.on('connect')    | connection.on('accept')     |
  | device.on('error')      | connection.on('error')      |
  | device.on('cancel')     | connection.on('cancel')     |
  | device.on('disconnect') | connection.on('disconnect') |

  #### More information about NodeJS Events
  As mentioned in our public [documentation](https://www.twilio.com/docs/voice/client/javascript/connection#handler-methods), the [Device](https://www.twilio.com/docs/voice/client/javascript/device) and [Connection](https://www.twilio.com/docs/voice/client/javascript/connection) objects are [EventEmitters](https://nodejs.org/api/events.html). This release doesn't change the default behavior of `EventEmitters`, where if one of the handlers on the ***same*** `EventEmitter` object throws an exception, the rest of the event handlers will not receive the event. Consider the following example.

  ```ts
  const myEmitter = new EventEmitter();

  // Subscribe some event handlers
  myEmitter.on('testevent', () => console.log('This is my handler 1'));
  myEmitter.on('testevent', () => {
    console.log('This is my handler 2');
    throw 'Something went wrong';
  });
  myEmitter.on('testevent', () => console.log('This is my handler 3'));

  // Emit an event
  myEmitter.emit('testevent');
  ```
  In the above example, `testevent` has three handlers and are on the ***same*** EventEmitter object `myEmitter`. If one of the handlers, in this case handler number 2, throws an error, the rest of the event handlers will not receive the event. In this case, handler 3 will not receive `testevent`. This is a normal behavior on `EventEmitters` and this SDK release doesn't change this behavior. This release only fixes the issue where if the events are comming from two different `EventEmitter` objects - `Connection` and `Device`;

1.10.1 (Apr 6, 2020)
===================

Improvements
---------

* Typescript declarations are now included with our NPM package. (CLIENT-7427, GH-36)

  In the following example, `Device`, `Connection`, and their functions should have the correct typings.

  ```
  import { Device, Connection } from 'twilio-client';

  const token = ...;
  const deviceOptions = ...;
  const device: Device = new Device(token, deviceOptions);

  const connection: Connection = device.connect(...);
  ...
  connection.disconnect();
  ```

Bug Fixes
---------

* Fixed an issue where `Device.on('incoming')` event is not raised when the incoming sound is stopped right after playing it. This is a timing issue which can happen if multiple incoming connections comes in almost at the same time. (CLIENT-7482, GH-129)
* Fixed an issue causing Android chrome to throw the error `This browser does not support audio output selection`. We now check if this is supported on the browser before attempting to update the output device. (CLIENT-7373, GH-124)

1.10.0 (Feb 19, 2020)
===================

Improvements
---------

* Added the ability to access the SDK logger instance using the [loglevel npm module](https://github.com/pimterry/loglevel). Please refer to the [loglevel documentation](https://github.com/pimterry/loglevel) for a list of logger APIs.

For example, to set the log level:

```
import { getLogger } from 'loglevel';

const logger = getLogger(Device.packageName);
// Set log level on subsequent page loads and refreshes
logger.setLevel('DEBUG');
```

* https://sdk.twilio.com is now being used for serving the sound files. (CLIENT-7221)
* Updated npm dependencies to support node version 12. (CLIENT-7024)
* We now log [RTCDtlsTransport](https://developer.mozilla.org/en-US/docs/Web/API/RTCDtlsTransport/state) state changes to Insights. This will help with isolating issues should they arise. (CLIENT-6913)

1.9.7 (Dec 6, 2019)
===================

Added an experimental feature to enable
[Aggressive ICE Candidate Nomination](https://tools.ietf.org/html/rfc5245#section-8.1.1.2). This feature can be enabled by setting `forceAggressiveIceNomination` to true. If your deployment is on devices with one network interface and your RTT to Twilio's Servers is typically greater than 96 milliseconds, this feature may help reduce call connect time. As this is an experimental feature, we dont recommend enabling this until after testing it thoroughly in your deployment.

Example:

```
Device.setup(TOKEN, {
  forceAggressiveIceNomination: true
});
```

1.9.6 (Nov 22, 2019)
===================

Improvements
---------

* New improvements to [media reconnection](https://www.twilio.com/docs/voice/client/javascript/connection#onreconnecting-handlererror). ICE restart is now also requested when ICE gathering fails (transitions to complete and no ICE candidates were gathered), or ICE gathering exceeds 15 seconds and no ICE candidates were gathered.
* Locally gathered ICE candidates are now logged for debugging purposes. (CLIENT-6957)

1.9.5 (Nov 5, 2019)
===================

Improvements
---------

* You can now connect to our interconnect region in Singapore by setting the region option to `sg1-ix`. See [Twilio Client Regions](https://www.twilio.com/docs/voice/client/regions) for the list of supported regions. Note that with this release, to support new regions without requiring an SDK update, we have removed the check for the region name passed to `Device.setup`. If an unsupported region is supplied, `Device.on('error')` will be called. (CLIENT-6831)

* We now log PeerConnection state changes to Insights. This will help with isolating issues should they arise. (CLIENT-6869)

1.9.4 (Oct 28, 2019)
===================

Improvements
---------

* We now report `audioInputLevel` and `audioOutputLevel` within the last second in the connection sample object `Connection.on('sample', handler(sample))`. (CLIENT-6779)

Bug Fixes
---------

* Update querystring to clear cached audio files without CORS headers. (CLIENT-6832)
* Fixed an issue where `constant-audio-input-level` warning is not being emitted. (CLIENT-6779)

1.9.3 (Oct 15, 2019)
===================

Bug Fixes
---------

* Fixed an issue where audio files sometimes shows CORS errors on the console. (CLIENT-6786, CLIENT-6805)

1.9.2 (Oct 3, 2019)
===================

Bug Fixes
---------

* Fixed an issue on Safari where `sample.mos`, emitted from `Connection.on('sample', handler(sample))`, is always null. (CLIENT-6664)

1.9.1 (Sept 13, 2019)
===================

Improvements
---------

* The Device sounds are now cached. They are only downloaded when `Device.setup()` is invoked. (CLIENT-6632)

1.9.0 (Sept 10, 2019)
===================

New Features
------------
### Max Average Bandwidth API
By default, the Opus codec is set up with a transmission rate of around 32 kbps (40-50kbps on the wire). With this release, you are able to set a custom max average bitrate to better control how much bandwidth your VoIP application should use. See [RFC-7587 section 7.1](https://tools.ietf.org/html/draft-ietf-payload-rtp-opus-11#section-7.1) for information about Max Average Bitrate.

The main purpose of this API is to set a lower max average bitrate to minimise bandwidth usage. This is particularly useful in deployments where bandwidth is at a premium. Where bandwidth is not of concern, you do not need to use this API. Max Average Bitrate can be set to as low as 6,000bps and as high as 51,000 bps. Values outside this range are ignored and the default Opus operation mode is used. See API Docs for more information.

As would be expected, lowering the max average bitrate impacts audio quality. We don’t recommend setting max average bitrate to a value below 8,000 bps. On the other hand, setting values over 32,000 bps will have negligible audio quality improvements.

For example, to set a new max average bitrate to 16,000 bps:`

```
Device.setup(TOKEN, {
  codecPreferences: ['opus', 'pcmu'],
  maxAverageBitrate: 16000,
});
```

Bug Fixes
---------

* Fixed an issue causing multiple devices that are created in the same tab to get disconnected when one of the devices disconnects a connection. (CLIENT-6581)

1.8.1 (Aug 28, 2019)
====================

Bug Fixes
---------

* Fixed an issue causing audio levels to be reported as zero when running as an extension, or when the browser tab is inactive or minimized. (CLIENT-6539)

* Fixed an issue causing `Connection.status()` to return `pending` instead of `closed` after calling `Connection.reject()`. (CLIENT-6534)


1.8.0 (Aug 20, 2019)
====================

New Features
------------
### Media Reconnection States and Events
This feature, when `enableIceRestart` is enabled, allows for detecting when media connection fails which will trigger automatic media reconnection, and for detecting when media connection is restored. (CLIENT-6444)

#### New Events
* `Connection.on('reconnecting', handler(error))` - raised when media connection fails and automatic reconnection has been started. During this period, `Connection.status()` will be set to `reconnecting`.
  * `error` - Error object `{ code: 53405, message: 'Media connection failed.' }`
  * Media reconnection triggers
    * [ICE Connection state](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState) transitions to `disconnect` and bytes sent and received in the last 3 seconds is zero.
    * [ICE Connection state](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState) or [PeerConnection state](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState) transitions to `failed`. Only Chrome browser will attempt an ICE restart with this trigger. Other browsers will immediately disconnect the call and raise an error `31003`. This is due to browsers not fully supporting connection states during an ICE restart.
* `Connection.on('reconnected', handler())` - raised when media connection has been restored which is detected when media starts flowing. Once reconnected, `Connection.status()` will be set to `open`.

#### Retries
ICE restarts will be retried in the event that previous ICE restarts are unsuccessful. Retry attempts will happen when [ICE Connection state](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceConnectionState) or [PeerConnection state](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState) transitions to `failed`. If more than 30 seconds has elapsed during this transition, the call will disconnect and raise an error `31003`.

Improvements
------------
* Added de1-ix to valid list of regions. (CLIENT-6455)
* Added `Device.version` to return sdk version
* When applicable, errors emitted through Device.on('error') and Connection.on('error') now contain a twilioError field, providing more information about the error. This twilioError represents the new TwilioError format that will become the default Error format in 2.0. (CLIENT-5908, CLIENT-5909)
```
// Error object
{
  code: number,
  message: string,
  ...
  // New twilioError property
  twilioError: {
    causes: Array<string>,
    code: number,
    description: string,
    explanation: string,
    solutions: Array<string>,
    message: string,
    stack: string
  }
}
```

Bug Fixes
---------
* Fixed an issue causing local environment information to get bundled into the build artifact in local npm builds. (CLIENT-6392)
* Fixed an issue where ringing will not stop when network is disconnected. (CLIENT-6336)

1.7.6 (Jul 23, 2019)
====================
New Features
------------
### Automatic Media Reconnection
This feature was first introduced in 1.7.4 and was enabled by default.
With this release, we have introduced the `enableIceRestart` reconnect flag to enable or disable *Automatic Media Reconnection*. The default is disabled. This will allow you to transition your code to utilise this feature. (CLIENT-6400, CLIENT-6407)

Improvements
------------
* We now show an error in the console if the page is not loaded over https for unsupported browsers. (CLIENT-6361)


Bug Fixes
---------

* Fixed a bug where active connection gets disconnected when the token expires. (CLIENT-6383)
* Fixed a bug where an answer during ICE reconnection is applied without a valid offer, resulting into a console error `Failed to set remote answer sdp: Called in wrong state: kStable`. (CLIENT-6372)


1.7.5 (Jul 5, 2019)
====================

Improvements
------------

* Checking whether plan-b or unified-plan is default on the browser now happens on `Device.setup()` or on device initialization with a token, instead of on page load. (CLIENT-6279)

Bug Fixes
---------

* Fixed a bug where ICE restarts will continue to retry when a call gets disconnected while ringing. (CLIENT-6319)
* `Device.destroy` now disconnects all connections. (CLIENT-6319)
* Fixed a bug where answer is applied multiple times after creating an offer. (CLIENT-6335)
* Fixed a bug where low-bytes warning is raised if total bytes sent and received is zero or not supported. (CLIENT-6341)
* Fixed a bug where ICE restart will not stop when connection drops on Firefox. (CLIENT-6342)

Known Issues
------------
*Updated July 16, 2019*

The introduction of *Automatic Media Reconnection* in 1.7.4 is enabled by default. This functionality may affect program flow if you rely on [Device.on('error', …)](https://www.twilio.com/docs/voice/client/javascript/device#error) with error code 31003 to update your UI or reconnect logic. This error is not thrown at the time of media interruption any longer. It is now sent after ICE restart is attempted and fails which may take 10s of seconds.


1.7.4 (June 21, 2019)
====================

New Features
------------
### Automatic Media Reconnection
A call may be inadvertently disconnected when media is temporarily lost. With this release, we will attempt to reconnect the media before dropping the call with a process known as [ICE restart](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Session_lifetime#ICE_restart).

If you are relying on [Device.on('error', …)](https://www.twilio.com/docs/voice/client/javascript/device#error) with error code 31003,  to update your UI or to initiate a reconnect, you will need to update your code to use [Device.on('offline', …)](https://www.twilio.com/docs/voice/client/javascript/device#offline) instead. The 31003 error code may not be reported for some time as ICE restarts are continually attempted.

*Updated July 16, 2019*

We have identified this as a potential breaking change and we will include an opt-in feature switch in the 1.7.6 release. We apologize for any inconvenience this may have caused you.

Improvements
------------
* We now report bytesSent and bytesReceived within the last second in the webrtc sample object (`RTCSample`).
* We now begin monitoring for warnings 5 seconds after the start of a call (originally at 20 seconds).

Bug Fixes
---------

* Fixed a bug where changing the input device then later calling `Connection.mute()` will not work.
* Fixed a bug causing some signaling errors to not trigger an error event from Connection.


1.7.3 (May 16, 2019)
====================

Improvements
------------

* We now report audio codec and whether DSCP is enabled to Insights Metrics.
* Added new getter on Connection, `Connection.codec`, which will be populated with the audio codec used
  in the call as soon as the SDK receives that information from WebRTC. We currently do not get the audio
  code from FireFox.
* We now emit a webrtc sample object (`RTCSample`) every second through a new event, `Connection.on('sample')`.

Bug Fixes
---------

* Fixed a bug causing the input stream to not be released after a Connection is created without calling
  `Device.audio.setInputDevice` and then later calling `Device.audio.setInputDevice` during the call
  when using a browser that supports the unified-plan SDP semantic.
* Fixed an issue where audio ring tone plays on a different output device after reconnecting an external output device.


1.7.2 (May 3, 2019)
===================

Bug Fixes
---------

* Fixed an issue where some audio resources weren't being released after a call. Thank you to
  Tsuchihashi-lvgs for helping us isolate this issue.


1.7.1 (Apr 29, 2019)
===================

Unified Plan support
--------------------
* If you are using twilio-client.js versions 1.7.0 or older, changing audio input devices during a call will break on Safari 12.2 onwards.
* twilio-client.js will now use the browser default SDP format. For Google Chrome 72+, Safari 12.2+ and Firefox since forever, the default format is Unified Plan. See this [advisory](https://support.twilio.com/hc/en-us/articles/360012910993-Breaking-Changes-in-Twilio-Client-JavaScript-SDKs-December-2018-) for SDP format migration impact

Improvements
------------
* Updated the algorithm used to report the "Audio input level" and "Audio output level" Insight metrics. The levels are obtained directly from an AudioContext and are no longer read out from webrtc's legacy stats


1.7.0 (Apr 4, 2019)
===================

Additions
---------

* Added the `codecPreferences` option to `Device.setup` options. Passing an array of ordered codec
  names will change the preferred audio codecs for voice media. Default is `['pcmu', 'opus']`.

1.6.10 (Mar 20, 2019)
====================

Bug Fixes
---------

* In Chrome 72, the implementation of DSCP support and related APIs changed. As a result, prior versions
  of twilio.js stopped tagging audio packets with EF. This release restores EF tagging when
  Device.Options.dscp == true (this is the default), by setting RtpEncoder.networkPriority to "high"
  in addition to applying the "googDscp" PeerConnection constraint.

1.6.9 (Feb 21, 2019)
====================

* Added `device.audio.setAudioConstraints()` and `device.audio.unsetAudioConstraints()`. These
  methods allow the setting of a MediaTrackConstraints object to be applied to every time
  `device.audio.setInputDevice()` is called, and any time an active input device is lost and
  the SDK gets new user media to fall back to another input device. If an input device is already set
  via `device.audio.setInputDevice()`, these methods will immediately call `setInputDevice()` internally
  and return the resulting Promise, otherwise they will return a resolved Promise. The currently
  set audio constraints can be seen on the new read-only field, `device.audio.audioConstraints`, which
  defaults to `null`. Example:
  ```
  device.audio.setAudioConstraints({ echoCancellation: true });
  await device.audio.setInputDevice('default');
  // Now we have a live input audio track, opened with echoCancellation:true
  device.audio.setAudioConstraints({
    autoGainControl: false,
    echoCancellation: false,
    noiseSuppression: false,
  }).then(() => {
    // We successfully applied the new constraints and should automatically hear the difference.
    // Future calls to setInputDevice will also use these constraints until they're cleared.
  }, err => {
    // Something went wrong, most likely err is an OverconstrainedError. Let's roll back.
    await device.audio.unsetAudioConstraints();
    // We should now have a working input audio track again
  });
  ```

1.6.8 (Feb 13, 2019)
===================

Bug Fixes
---------

* Applied a workaround to a Chrome regression introduced in M72 affecting `speakerDevices.test()`
  and `ringtoneDevices.test()`: https://bugs.chromium.org/p/chromium/issues/detail?id=930876

Browser Support
---------------

* We are now using RTCP values for RTT where available. Initially, this will not affect Chrome
  because Chrome has [not yet implemented support](https://bugs.chromium.org/p/webrtc/issues/detail?id=9545).
  Additionally, having access to RTT will allow FireFox to calculate and report MOS, however FireFox is
  currently affected by [a regression](https://bugzilla.mozilla.org/show_bug.cgi?id=1525341) causing
  jitter to be reported as 0, which will make MOS scores appear slightly better than they actually
  are until it's fixed.

1.6.7 (Feb 12, 2019)
===================

Insights
--------

* Now sending ice gathering state change events to Insights as `ice-gathering-state`.

Bug Fixes
---------

* Fixed a regression introduced in 1.6.0 causing falsey TwiML params to be stripped.
* `Twilio.Device.audio.disconnect()` will now toggle whether the disconnect sound should play while
  already on an active call.

Additions
---------

* Increased default websocket backoff maximum from 3000ms to 20000ms, and added the `backoffMaxMs`
  option to Device.setup() options that takes a time in milliseconds to override this default. The
  minimum allowable value is 3000ms.

1.6.6 (Feb 5, 2019)
===================

Dependencies
------------

* Updated `ws` dependency to latest. Only affects npm package because the CDN artifact of twilio.js uses
  the browser's WebSocket implementation.

1.6.5 (Dec 3, 2018)
===================

Bug Fixes
---------

* Fixed a bug introduced in 1.6.3 preventing metrics from being published.

1.6.4 (Nov 30, 2018)
====================

Additions
---------

* Now sending NetworkInformation stats to Insights.

1.6.3 (Nov 19, 2018)
===================

Bug Fixes
---------

* Stopped sending Insights events that aren't associated with a CallSid or TempCallSid as they can't
  be tracked.

Additions
---------

* Added Device.setup option `{ fakeLocalDTMF: true }` that uses imitation DTMF sounds instead of the default
  real DTMF sounds, preventing an issue where DTMF tones would sometimes register twice.


1.6.2 (Nov 8, 2018)
===================

Additions
---------

* Added `{ sdpSemantics: 'plan-b' }` to the default [RTCConfiguration](https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration)
  object to ensure forward compatibility until unified plan is fully supported in the SDK.
* Added an `rtcConfiguration` field to IDeviceOptions, which takes an [RTCConfiguration](https://developer.mozilla.org/en-US/docs/Web/API/RTCConfiguration)
  object that gets passed to any created RTCPeerConnections. Example:

```
Device.setup(token, {
  rtcConfiguration: { iceTransportPolicy: 'relay' },
});
```

1.6.1 (Oct 3, 2018)
===================

Bug Fixes
---------

* Re-assigning the master output device mid-call, particularly when calling `device.disconnectAll()`,
  will no longer throw an exception or pause script execution.
* Fixed `closeProtection` feature
* Added EventEmitter interface (`on`, `addListener`, `removeListener`, etc...) to Device singleton.

1.6.0 (Aug 29, 2018)
===================

Additions
---------

* Added the ability to receive and handle incoming calls while on an active call behind a
  new flag, `allowIncomingWhileBusy`. When set to `true`, Device's default behavior of
  silently ignoring the incoming call is removed, and the incoming call will instead cause
  Device to emit an "incoming" event. If accepted, the prior active call will be immediately
  disconnected, and the incoming call will be accepted, replacing the prior active call.

  ```js
  Twilio.Device.setup(token, { allowIncomingWhileBusy: true });
  ```

* Added support for custom incoming parameters from TwiML as `Map<string, string> Connection.customParameters`.
  When a TwiML application sends custom parameters using the `<Parameter>` noun, these parameters will be
  added to `.customParameters`. For example:

  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Dial>
      <Client>
        <Identity>alice</Identity>
        <Param name="foo" value="bar"/>
        <Param name="baz" value="123"/>
      </Client>
    </Dial>
  </Response>
  ```

  ```js
  device.on('incoming', connection => {
    assert.equal(connection.customParameters.get('foo'), 'bar');
    assert.equal(connection.customParameters.get('baz'), '123');
  });
  ```

1.5.1 (Aug 15, 2018)
====================

Bug Fixes
---------

* Updated Insights logic to point to new endpoint, fully supporting Insights when using Access Tokens

1.5.0 (Aug 8, 2018)
===================

Additions
---------

* `Twilio.Device` may now be instantiated multiple times via

    ```js
    const device = new Twilio.Device(token, options);
    ```

* `Twilio.Device.setup()` may now be called with Access Tokens, in addition to Capability Tokens (CLIENT-4646)
* `Twilio.Device.destroy()` will now completely clear out the Device, allowing `Device.setup()`
   to be called with a new set of options (CLIENT-4951)

Bug Fixes
---------

* We now ensure all Audio resources are cleaned up after closing a Connection (CLIENT-4901)

Deprecations
------------

* The handler functions (cancel, connect, disconnect, error, incoming, offline, ready) have been deprecated
  in favor of using the [EventEmitter interface](https://nodejs.org/api/events.html), which `Device`
  extends. Using the handlers will log a deprecation warning, and as of the next breaking release
  the handlers will be removed. For example, `Device.offline(handler)` should be re-written as
  `Device.on('offline', handler)`. Additionally, listeners can be removed via
  `Device.removeListener('offline', handler)`.

1.4.33 (Jul 5, 2019)
===================

Bug Fixes
---------

* Fixed an issue causing incoming ringtone to continue playing after receiving a Connection error.

1.4.32 (Apr 19, 2018)
===================

Bug Fixes
---------

* Fixed an issue causing region passed to Device.setup to be ignored.

1.4.31 (Apr 16, 2018)
====================

Bug Fixes
---------

* Fixed an issue causing WebSocket requests to sometimes be sent out of order after
  recovering from a lapse in network connectivity.

1.4.30 (Mar 28, 2018)
=====================

Additions
---------

* Fixed an issue where an internal listener wasn't being cleaned up when disconnecting a call,
  resulting in EventEmitter warnings when opening more than 10 calls in a row.
* Added a `Device.isSupported` boolean property, which is `true` if the current browser supports
  all of the features necessary to run twilio-client.js. Example usage:

  ```js
  if (Device.isSupported) {
    Device.setup(token);
  } else {
    // Browser does not support twilio-client.js. Device.setup() will throw if called.
  }
  ```

1.4.29 (Mar 6, 2018)
====================

Bug Fixes
---------

* Fixed an issue that broke Webpack- and likely Browserify-based builds.
