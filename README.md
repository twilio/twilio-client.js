### Deprecation Notice
This repository does not contain the latest version of Twilio's Javascript Voice SDK. Although this major version will continue
to be supported, it will no longer receive new features. We recommend that all users upgrade to
[2.0](https://github.com/twilio/twilio-voice.js) at their earliest convenience, in order to receive access to new features as
they arrive.

## Twilio's JavaScript Voice SDK 2.0 is now GA!
This repository contains an outdated version of Twilio's Javascript Client SDK. We have now released 2.0 as Generally Available.
You can find the new repository containing the JavaScript Voice SDK 2.0 [here](https://github.com/twilio/twilio-voice.js).

This new major version cleans up a lot of the legacy API, such as:
- Removing deprecated methods
- Renaming classes and methods to be less ambiguous
- Implementing the new features from 1.x as defaults rather than behind feature flags
- Completely moving to the new TwilioError class which is standardized between Voice SDKs and contains much more detailed information about errors

Additionally, new features from this point onward will only be added to the 2.0 project, and not be backported to 1.x, so anyone looking to use the
latest features will want to be moved to the new 2.0 API.

Existing customers can review our migration guide [here](https://www.twilio.com/docs/voice/sdks/javascript/migrating-to-js-voice-sdk-20).

twilio-client.js
================

[![NPM](https://img.shields.io/npm/v/twilio-client.svg)](https://www.npmjs.com/package/twilio-client) [![CircleCI](https://circleci.com/gh/twilio/twilio-client.js/tree/master.svg?style=svg&circle-token=80e91c8284c21ff16d3003702e17b903c0b32f1d)](https://circleci.com/gh/twilio/twilio-client.js/tree/master)

twilio-client.js allows you to add real-time voice and PSTN calling to your web apps.

* [API Docs](https://twilio.github.io/twilio-client.js/index.html)
* [More Docs](https://www.twilio.com/docs/voice/client/javascript/overview)
* [Quickstart](https://www.twilio.com/docs/voice/client/javascript/quickstart)
* [Changelog](https://github.com/twilio/twilio-client.js/blob/master/CHANGELOG.md)

### Technical Support
If you need technical support, contact
[help@twilio.com](mailto:help@twilio.com).

Installation
------------

### NPM

We recommend using `npm` to add the Client SDK as a dependency.

```
npm install twilio-client --save
```

Using this method, you can `import` twilio-client.js using ES Module or TypeScript syntax:

```js
import { Device } from 'twilio-client';

```

Or using CommonJS:

```js
const Device = require('twilio-client').Device;
```

### CDN

Though not recommended, releases of twilio-client.js are also hosted on a CDN and you can include
these directly in your web app using a &lt;script&gt; tag.

```html
<script src="https://sdk.twilio.com/js/client/v1.14/twilio.js"></script>
```

Using this method, twilio-client.js will set a browser global:

```js
const Device = Twilio.Device;
```

Testing
-------

Running unit tests requires no setup aside from installation (above). You can run unit tests via:

```
npm run test:unit
```

Integration tests require some set up:

1. If the account you want to use doesn't already have a TwiML app set up, create one using the
   TwiML code below.
2. Copy config.example.yaml to config.yaml, replacing the placeholder information with valid credentials.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Client>
      <Identity>{{To}}</Identity>
      <Parameter name="duplicate" value="12345" />
      <Parameter name="duplicate" value="123456" />
      <Parameter name="custom + param" value="我不吃蛋" />
      <Parameter name="foobar" value="some + value" />
      <Parameter name="custom1" value="{{Custom1}}" />
      <Parameter name="custom2" value="{{Custom2}}" />
      <Parameter name="custom3" value="{{Custom3}}" />
    </Client>
  </Dial>
</Response>
```

Integration tests can be run via:

```
npm run test:integration
```

These tests will run via karma, one at a time, in your system's default Chrome and then Firefox.

Content Security Policy (CSP)
----------------------------

Use the following policy directives to enable [CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) that is compatible with twilio-client.js.

```
script-src https://media.twiliocdn.com https://sdk.twilio.com
media-src mediastream https://media.twiliocdn.com https://sdk.twilio.com
connect-src https://eventgw.twilio.com wss://chunderw-vpc-gll.twilio.com https://media.twiliocdn.com https://sdk.twilio.com
```

If you are providing a non-default value for `Device.Options.edge` or `Device.Options.region` parameter, you need to add the Signaling URI `wss://chunderw-vpc-gll-{regionId}.twilio.com` in your `connect-src` directive where `regionId` is the `Region ID` as defined in this [page](https://www.twilio.com/docs/global-infrastructure/edge-locations/legacy-regions). See examples below.

**If `Device.Options.region` is `us1`**

```
connect-src https://eventgw.twilio.com https://media.twiliocdn.com https://sdk.twilio.com wss://chunderw-vpc-gll-us1.twilio.com
```

**If `Device.Options.edge` is `ashburn`**

```
connect-src https://eventgw.twilio.com https://media.twiliocdn.com https://sdk.twilio.com wss://chunderw-vpc-gll-us1.twilio.com
```

**If `Device.Options.edge` is `['ashburn', 'sydney', 'roaming']`**

```
connect-src https://eventgw.twilio.com https://media.twiliocdn.com https://sdk.twilio.com wss://chunderw-vpc-gll-us1.twilio.com wss://chunderw-vpc-gll-au1.twilio.com wss://chunderw-vpc-gll.twilio.com
```

License
-------

See [LICENSE.md](https://github.com/twilio/twilio-client.js/blob/master/LICENSE.md)
