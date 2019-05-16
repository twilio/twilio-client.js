'use strict';

const root = document.getElementById('root');

/**
 * Get a {@link Location}'s query parameters.
 * @param {Location} location
 * @returns {Map<string, Array<string>>} queryParameters
 */
function getQueryParameters(location) {
  return (location.search.split('?')[1] || '').split('&').reduce((queryParameters, keyValuePair) => {
    let [key, value] = keyValuePair.split('=');
    key = decodeURIComponent(key);
    value = decodeURIComponent(value);
    queryParameters.set(key, (queryParameters.get(key) || []).concat([value]));
    return queryParameters;
  }, new Map());
}

const tokens = (getQueryParameters(location).get('tokens') || [])[0] || '';
const token = tokens.split(',')[0];
const device = Twilio.Device.setup(token);

const start = Date.now();

device.incoming(() => {
  let result = 'Success';
  const elapsed = Date.now() - start;

  // Giving a 100ms tolerance to the incoming ringtone timeout of 2s
  if (elapsed > 2100) {
    result = 'Device.incoming did not fire within 2 seconds of attempting to play the sound';
  } else if (elapsed < 1900) {
    result = 'Device.incoming was fired before the expected 2 second timeout';
  }

    root.innerHTML = `<p>${result}</p>`;
});

device.instance._showIncomingConnection(null, function() {
  // We should time out
  return new Promise(() => { });
});
