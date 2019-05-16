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

device.incoming(() => {
  root.innerHTML = `<p>Success</p>`;
});

device.instance._showIncomingConnection(null, function() {
  return Promise.reject(new Error('Planned failure'));
});
