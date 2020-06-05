import Connection from '../../lib/twilio/connection';
import Device from '../../lib/twilio/device';
import { generateAccessToken } from '../lib/token';
import { expectEvent, isFirefox, runDockerCommand, waitFor } from '../lib/util';
import * as assert from 'assert';
import { EventEmitter } from 'events';

type CB = any;

const DEBUG = false;
const EVENT_TIMEOUT = 20000;
const RTP_TIMEOUT = 60000;
const SUITE_TIMEOUT = 300000;
const USE_CASE_TIMEOUT = 180000;

describe('Reconnection', function() {
  this.timeout(SUITE_TIMEOUT);

  let connection1: Connection;
  let connection2: Connection;
  let device1: Device;
  let device2: Device;
  let identity1: string;
  let identity2: string;
  let token1: string;
  let token2: string;

  let options = {
    warnings: false,
    debug: DEBUG,
    enableIceRestart: false,
  };

  // Since both devices lives in the same machine, one device may receive
  // events faster than the other. We will then run the test on the device
  // who gets it first. The other device will receive hangup event which is
  // not part of this test.
  const bindTestPerConnection = (test: CB) => {
    return Promise.race([
      test(connection1),
      test(connection2)
    ]);
  };

  const bindTestPerDevice = (test: CB) => {
    return Promise.race([
      test(device1),
      test(device2)
    ]);
  };

  const setupDevices = () => {
    identity1 = 'id1-' + Date.now();
    identity2 = 'id2-' + Date.now();
    token1 = generateAccessToken(identity1);
    token2 = generateAccessToken(identity2);
    device1 = new Device();
    device2 = new Device();

    return Promise.all([
      expectEvent('ready', device1.setup(token1, options)),
      expectEvent('ready', device2.setup(token2, options)),
    ]).then(() => new Promise((resolve) => {
      device2.once(Device.EventName.Incoming, (connection) => {
        connection2 = connection;
        connection.accept();
        resolve();
      });
      connection1 = (device1['connect'] as any)({ To: identity2, Custom1: 'foo + bar', Custom2: undefined, Custom3: '我不吃蛋' });
    }));
  };

  const destroyDevices = () => {
    if (device1) {
      device1.disconnectAll();
      device1.destroy();
    }

    if (device2) {
      device2.disconnectAll();
      device2.destroy();
    }
  };

  describe('When enableIceRestart is false', function() {
    this.timeout(SUITE_TIMEOUT);

    describe('and ICE connection fails', function() {
      this.timeout(USE_CASE_TIMEOUT);

      before(async () => {
        await runDockerCommand('unblockMediaPorts');
        await setupDevices();
      });
      after(() => {
        destroyDevices();
        return runDockerCommand('unblockMediaPorts');
      });

      it('should not trigger reconnecting', async () => {
        await runDockerCommand('blockMediaPorts');
        await Promise.race([
          new Promise((resolve) => setTimeout(resolve, 10000)),
          bindTestPerConnection((conn: Connection) => expectEvent('reconnecting', conn)
            .then(() => Promise.reject(new Error('Detected reconnecting'))))
        ]);
      });

      it('should disconnect call with error 31003', () => {
        return waitFor(bindTestPerConnection((conn: Connection) => Promise.all([
          expectEvent('disconnect', conn),
          new Promise((resolve) => conn.once('error', (error) => error.code === 31003 && resolve()))
        ]).then(() =>  assert(conn.status() === Connection.State.Closed))), RTP_TIMEOUT);
      });
    });
  });

  describe('When enableIceRestart is true', function() {
    this.timeout(SUITE_TIMEOUT);

    before(() => {
      options.enableIceRestart = true;
    });

    after(() => {
      options.enableIceRestart = false;
    });

    describe('and ICE connection fails', function() {
      this.timeout(USE_CASE_TIMEOUT);

      before(async () => {
        await runDockerCommand('unblockMediaPorts');
        await setupDevices();
      });
      after(() => {
        destroyDevices();
        return runDockerCommand('unblockMediaPorts');
      });

      it('should trigger reconnecting', async () => {
        await runDockerCommand('blockMediaPorts');
        await waitFor(bindTestPerConnection((conn: Connection) => expectEvent('reconnecting', conn)
          .then(() => assert(conn.status() === Connection.State.Reconnecting))), EVENT_TIMEOUT);
      });

      it('should trigger reconnected', async () => {
        await runDockerCommand('unblockMediaPorts');
        await waitFor(bindTestPerConnection((conn: Connection) => expectEvent('reconnected', conn)
        .then(() => assert(conn.status() === Connection.State.Open))), EVENT_TIMEOUT);
      });

      // Firefox only allows reconnection once as it doesn't update iceConnectionState
      // and pcConnectionState back to 'connected' after issuing the first ice restart
      if (!isFirefox()) {
        it('should trigger reconnecting after reconnected', async () => {
          await runDockerCommand('blockMediaPorts');
          await waitFor(bindTestPerConnection((conn: Connection) => expectEvent('reconnecting', conn)
            .then(() => assert(conn.status() === Connection.State.Reconnecting))), EVENT_TIMEOUT);
        });
      }

      it('should disconnect call with error 31003', async () => {
        await runDockerCommand('blockMediaPorts');
        await waitFor(bindTestPerConnection((conn: Connection) => Promise.all([
          expectEvent('disconnect', conn),
          new Promise((resolve) => conn.once('error', (error) => error.code === 31003 && resolve()))
        ]).then(() =>  assert(conn.status() === Connection.State.Closed))), RTP_TIMEOUT);
      });
    });
  });

  // TODO: Re-enable after CLIENT-7771
  (isFirefox() ? describe.skip : describe)('When network disconnects', function() {
    this.timeout(USE_CASE_TIMEOUT);

    before(() => setupDevices());
    after(() => {
      destroyDevices();
      return runDockerCommand('resetNetwork');
    });

    it('should trigger device.offline', async () => {
      await runDockerCommand('disconnectFromAllNetworks');
      await waitFor(bindTestPerDevice((device: Device) => expectEvent('offline', device)), EVENT_TIMEOUT);
    });

    it('should disconnect call with error 31003', () => {
      return waitFor(bindTestPerConnection((conn: Connection) => Promise.all([
        expectEvent('disconnect', conn),
        new Promise((resolve) => conn.once('error', (error) => error.code === 31003 && resolve()))
      ]).then(() =>  assert(conn.status() === Connection.State.Closed))), RTP_TIMEOUT);
    });

    it('should trigger device.ready after network resumes', async () => {
      await runDockerCommand('resetNetwork');
      await waitFor(bindTestPerDevice((device: Device) => expectEvent('ready', device)), EVENT_TIMEOUT);
    });
  });
});
