'use strict';

const express = require('express');
const path = require('path');

const app = new express();

const testNames = process.argv.slice(2);
testNames.forEach(testName => {
  app.use(`/${testName}`, express.static(path.join(__dirname, 'specs', testName, 'public')));
});

app.use('/static', express.static(path.join(__dirname, '../../dist')));
app.options('/', (req, res) => res.sendStatus(200));

app.listen(5000);
