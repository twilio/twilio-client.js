import IOutputDeviceCollection from './outputdevicecollection';

export default interface IAudioHelper {
  /**
   * A Map of all audio input devices currently available to the browser by their device ID.
   */
  readonly availableInputDevices: Map<string, MediaDeviceInfo>;

  /**
   * A Map of all audio output devices currently available to the browser by their device ID.
   */
  readonly availableOutputDevices: Map<string, MediaDeviceInfo>;

  /**
   * The active input device. Having no inputDevice specified by `setInputDevice()`
   * will disable input selection related functionality.
   */
  readonly inputDevice: MediaDeviceInfo | null;

  /**
   * The current input stream.
   */
  readonly inputStream: MediaStream | null;

  /**
   * False if the browser does not support `HTMLAudioElement.setSinkId()` or
   * `MediaDevices.enumerateDevices()` and Twilio cannot facilitate output selection functionality.
   */
  readonly isOutputSelectionSupported: boolean;

  /**
   * False if the browser does not support AudioContext and Twilio can not analyse the volume
   * in real-time.
   */
  readonly isVolumeSupported: boolean;

  /**
   * The current set of output devices that incoming ringtone audio is routed through.
   * These are the sounds that may play while the user is away from the machine or not wearing
   * their headset. It is important that this audio is heard. If all specified
   * devices lost, this Set will revert to contain only the "default" device.
   */
  readonly ringtoneDevices: IOutputDeviceCollection;

  /**
   * The current set of output devices that call audio (`[voice, outgoing, disconnect, dtmf]`)
   * is routed through. These are the sounds that are initiated by the user, or played while
   * the user is otherwise present at the endpoint. If all specified devices are lost,
   * this Set will revert to contain only the "default" device.
   */
  readonly speakerDevices: IOutputDeviceCollection;

  /**
   * Fired when the list of available devices has changed.
   * @param lostActiveDevices - An array of all currently-active
   *   devices that were removed with this device change. An empty array if the current
   *   active devices remain unchanged. A non-empty array is an indicator that the user
   *   experience has likely been impacted.
   */
  on(eventName: 'deviceChange', handler: (lostActiveDevices: MediaDeviceInfo[]) => void): any;

  /**
   * Replace the current input device with a new device by ID.
   * @param deviceId - An ID of a device to replace the existing
   *   input device with.
   */
  setInputDevice(deviceId: string): Promise<void>;

  /**
   * Unset the input device, stopping the tracks. This should only be called when not in a connection, and
   *   will not allow removal of the input device during a live call.
   */
  unsetInputDevice(): Promise<void>;
}
