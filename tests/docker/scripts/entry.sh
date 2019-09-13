#!/bin/bash
# Entry script inside the container
set -e
echo Starting Docker script

echo "node version:"
node --version
echo "npm version:"
npm --version
echo "os info:"
uname -a

echo "Cleaning up sdk artifacts"
cd twilio-client.js
rm -rf es5
rm -rf dist
rm -rf docs
rm -rf node_modules

echo "Installing npm dependencies"
npm install

echo "Building artifacts"
npm run build:version
npm run build:errors
npm run build:es5
npm run build:ts
npm run build:dist
npm run build:dist-min

echo "Installing Chrome: $BVER"
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add -
echo "deb http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google.list
apt-get update
echo "Installing google-chrome-$BVER from apt-get"
apt-get install -y google-chrome-$BVER
rm -rf /var/lib/apt/lists/*

echo "Installing Firefox: $BVER"
if [ $BVER = "beta" ]
then
  FIREFOX_DOWNLOAD_URL="https://download.mozilla.org/?product=firefox-beta-latest-ssl&os=linux64&lang=en-US"
elif [ $BVER = "unstable" ]
then
  FIREFOX_DOWNLOAD_URL="https://download.mozilla.org/?product=firefox-nightly-latest-ssl&os=linux64&lang=en-US"
else
  FIREFOX_DOWNLOAD_URL="https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US"
fi

echo "Firefox Download URL: $FIREFOX_DOWNLOAD_URL"

mkdir /application
cd /application
wget -O - $FIREFOX_DOWNLOAD_URL | tar jx
export FIREFOX_BIN=/application/firefox/firefox

echo "Starting tests"
cd /app/twilio-client.js
npm run test:integration

echo Ending Docker script
