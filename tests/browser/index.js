'use strict';

const REALM = 'prod';
const TIMEOUT = 10000;

const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const twilio = require('twilio');
const waitForServer = require('./lib/waitforserver');
const webdriver = require('./lib/webdriver');
const yaml = require('js-yaml');

const { generateCapabilityToken } = require('../lib/token');

// Get creds, or throw exception on error
let credentials;
try {
  credentials = yaml.safeLoad(fs.readFileSync(path.join(__dirname, '../../config.yaml'), 'utf8'))[REALM];
} catch (e) {
  console.log(e);
}

// Get a list of the tests to run by enumerating folders in our spec folder
const specPath = __dirname + '/specs';
const testNames = fs.readdirSync(specPath)
  .filter(file => fs.statSync(path.join(specPath, file)).isDirectory())

const host = 'localhost';
const port = 5000;

describe('Twilio Client Selenium Tests', function() {
  this.timeout(TIMEOUT);

  const chromeDriver = webdriver.buildWebDriverForChrome();
  const firefoxDriver = webdriver.buildWebDriverForFirefox();
  let server;

  before(() => {
    server = spawn('node', ['server.js'].concat(testNames), {
      cwd: __dirname,
      detached: true,
      env: process.env,
      stdio: 'ignore'
    });

    return waitForServer(host, port, TIMEOUT);
  });

  after(() => {
    process.kill(-server.pid);
  });

  describe('Chrome', () => runSuite(chromeDriver));
  describe('Firefox', () => runSuite(firefoxDriver));
});

/**
 * Run the suite.
 * @param {WebDriver} driver
 * @returns {void}
 */
function runSuite(driver) {
  testNames.forEach(testName => {
    const test = require(path.join(specPath, testName, '/index.js'));
    it('should ' + test.should, () => {
      return beforeTest(driver, test.name, test.identities).then(() => test.run(driver));
    });
  });

  after(() => driver.quit());
}

function beforeTest(driver, testName, identities) {
  const tokens = identities.map(generateCapabilityToken).join(',');
  return driver.get(`http://${host}:${port}/${testName}?&tokens=${tokens}`);
}
