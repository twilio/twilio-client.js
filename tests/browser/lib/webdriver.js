'use strict';

const By = require('selenium-webdriver').By;
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const StaleElementReferenceError = require('selenium-webdriver/lib/error').StaleElementReferenceError;
const until = require('selenium-webdriver').until;
const webdriver = require('selenium-webdriver');

const chromeOptions = new chrome.Options()
  .addArguments('allow-file-access-from-files')
  .addArguments('use-fake-device-for-media-stream')
  .addArguments('use-fake-ui-for-media-stream');

const firefoxProfile = new firefox.Profile();
firefoxProfile.setPreference('media.navigator.permission.disabled:true');
firefoxProfile.setPreference('media.navigator.permission.disabled:true');
const firefoxOptions = new firefox.Options().setProfile(firefoxProfile);

/**
 * Build a Chrome-based {@link WebDriver}.
 * @returns {WebDriver}
 */
function buildWebDriverForChrome() {
  return new webdriver.Builder()
    .forBrowser('chrome')
    .setChromeOptions(chromeOptions)
    .build();
}

/**
 * Build a Firefox-based {@link WebDriver}.
 * @returns {WebDriver}
 */
function buildWebDriverForFirefox() {
  return new webdriver.Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(firefoxOptions)
    .build();
}

/**
 * This function calls another function that returns a Promise. If that Promise
 * rejects with a {@link StaleElementReferenceError}, the function will be
 * retried (indefinitely).
 * @param {func(): Promise<T>}
 * @returns {Promise<T>}
 */
function retryOnStaleElementReferenceError(func) {
  return func().catch(error => {
    if (error instanceof StaleElementReferenceError) {
      return retryOnStaleElementReferenceError(func);
    }
    throw error;
  });
}

/**
 * Wait until an element is found and its text matches the RegExp. This function
 * will retry on {@link StaleElementReferenceError}s.
 * @param {WebDriver} driver
 * @param {string} querySelector
 * @param {RegExp} regExp
 * @returns {Promise<void>}
 */
function waitUntilElementLocatedAndTextMatches(driver, querySelector, regExp) {
  const by = By.css(querySelector);

  function waitUntilElementTextMatches() {
    return driver
      .wait(until.elementLocated(by))
      .then(element => driver.wait(until.elementTextMatches(element, regExp)));
  }

  return retryOnStaleElementReferenceError(waitUntilElementTextMatches);
}

/**
 * Wait until we receive a success or failure from the test
 * @param {WebDriver} driver
 * @returns {Promise<void>}
 */
function waitForResult(driver, querySelector) {
  const by = By.css(querySelector);

  return waitUntilElementLocatedAndTextMatches(driver, querySelector, /.+/).then(() => {
    return driver.findElement(by).getText();
  }).then(body => {
    if(!/^success$/i.test(body)) {
      throw new Error(`Test failed: ${body}`);
    }
  });
}

/**
 * Wait until an alert is shown.
 * @param {WebDriver} driver
 * @param {string} querySelector
 * @param {RegExp} regExp
 * @returns {Promise<void>}
 */
function waitUntilAlertIsPresent(driver) {
  return driver.wait(until.alertIsPresent());
}

exports.buildWebDriverForChrome = buildWebDriverForChrome;
exports.buildWebDriverForFirefox = buildWebDriverForFirefox;
exports.waitUntilElementLocatedAndTextMatches = waitUntilElementLocatedAndTextMatches;
exports.waitUntilAlertIsPresent = waitUntilAlertIsPresent;
exports.waitForResult = waitForResult;
