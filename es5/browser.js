'use strict';

/*! $name.js $version

$license
 */
/* eslint-disable */
(function (root) {
  var bundle = $bundle;
  var Voice = bundle($entry);
  /* globals define */
  if (typeof define === 'function' && define.amd) {
    define([], function () {
      return Voice;
    });
  } else {
    var Twilio = root.Twilio = root.Twilio || {};
    Twilio.Connection = Twilio.Connection || Voice.Connection;
    Twilio.Device = Twilio.Device || Voice.Device;
    Twilio.PStream = Twilio.PStream || Voice.PStream;
    Twilio.PreflightTest = Twilio.PreflightTest || Voice.PreflightTest;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : undefined);