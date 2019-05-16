const webdriver = require('../../lib/webdriver');

function run(driver) {
  return webdriver.waitUntilAlertIsPresent(driver).then(() => {
    return new Promise(resolve => {
      setTimeout(() => {
        driver.switchTo().alert().accept();
        resolve(webdriver.waitForResult(driver, 'p'));
      }, 1000);
    });
  });
}

module.exports = {
  identities: ['incoming-alert-alice'],
  name: 'incoming-alert',
  should: 'play the incoming sound if an alert is thrown in the Device.incoming handler',
  run: run
};
