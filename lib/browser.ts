/* ! $name.js $version

$license
 */
/* eslint-disable */
declare const $bundle: any;
declare const $entry: any;
declare const define: any;

((root: any) => {
  const bundle = $bundle;
  const Voice = bundle($entry);
  /* globals define */
  if (typeof define === 'function' && define.amd) {
    define([], () => Voice);
  } else {
    const Twilio = (root.Twilio = root.Twilio || {});
    Twilio.Connection = Twilio.Connection || Voice.Connection;
    Twilio.Device = Twilio.Device || Voice.Device;
    Twilio.PStream = Twilio.PStream || Voice.PStream;
  }
})(
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
    ? global
    : this,
);
