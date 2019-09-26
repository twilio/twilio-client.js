#!/usr/bin/env node
'use strict';

const { Server, stopper } = require('karma');
const DockerProxyServer = require('../tests/docker/proxy/server');
const isDocker = require('is-docker')();
const configFile = process.argv[2];

let dockerProxy = null;
if (isDocker) {
  console.log('Running tests inside docker!');
  dockerProxy = new DockerProxyServer();
  dockerProxy.startServer();
}

const server = new Server({ configFile }, process.exit);
server.start();
process.once('exit', () => stopper.stop({}));
process.once('SIGINT', () => process.exit());
