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

const incomingSound = device.instance.soundcache.get('incoming');
incomingSound.setSinkIds(['default']);

device.incoming(() => {
  alert('foo');

  const duration = incomingSound._timeStarted
    ? Date.now() - incomingSound._timeStarted
    : 0;

  const resultMessage = (duration > 1000)
    ? 'Success'
    : 'Sound did not start playing before alert was opened';

  root.innerHTML = `<p>${resultMessage}</p>`;
});

device.instance._showIncomingConnection(null, function() {
  return incomingSound.play();
});
