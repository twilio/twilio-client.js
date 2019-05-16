const webdriver = require('../../lib/webdriver');

function run(driver) {
  return webdriver.waitForResult(driver, 'p');
}

module.exports = {
  identities: ['incoming-sound-timeout-alice'],
  name: 'incoming-sound-timeout',
  should: 'call Device.incoming handlers when the incoming sound .play() times out',
  run: run
};
