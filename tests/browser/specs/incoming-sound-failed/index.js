const webdriver = require('../../lib/webdriver');

function run(driver) {
  return webdriver.waitForResult(driver, 'p');
}

module.exports = {
  identities: ['incoming-sound-failed-alice'],
  name: 'incoming-sound-failed',
  should: 'call Device.incoming handlers when the incoming sound .play() rejects',
  run: run
};
