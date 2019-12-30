import { bindSingleton } from './bindSingleton';
import Connection from './twilio/connection';
import Device from './twilio/device';
import { PStream } from './twilio/pstream';

bindSingleton(Device);

export { Device, PStream, Connection };
