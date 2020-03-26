'use strict';

const fs = require('fs');
const pkg = require('../package.json');
const twilioFileString = fs.readFileSync('./templates/constants.js', 'utf8');
fs.writeFileSync('./lib/twilio/constants.js', `\
/**
 * This file is generated on build. To make changes, see /templates/constants.js
 */
${twilioFileString
    .replace('$packageName', pkg.name)
    .replace('$version', pkg.version)}`, 'utf8');
