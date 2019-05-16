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

const token = (getQueryParameters(location).get('token') || [])[0] || '';

Twilio.Device.ready(device => {
  root.innerHTML = `<p>Setup successful</p>`;
});

const device = Twilio.Device.setup(token);
