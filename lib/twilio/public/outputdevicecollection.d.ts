export default interface IOutputDeviceCollection {
  /**
   * Delete a device from the collection. If no devices remain, the 'default'
   * device will be added as the sole device. If no 'default' device exists,
   * the first available device will be used.
   * @param device - The device to delete from the collection
   * @returns whether the device was present before it was deleted
   */
  delete(device: MediaDeviceInfo): boolean;

  /**
   * Get the current set of devices.
   */
  get(): Set<MediaDeviceInfo>;

  /**
   * Replace the current set of devices with a new set of devices.
   * @param deviceIdOrIds - An ID or array of IDs of devices to replace the existing devices with.
   * @returns Rejects if this feature is not supported, any of the supplied IDs are not found,
   * or no IDs are passed.
   */
  set(deviceIdOrIds: string | string[]): Promise<void>;

  /**
   * Test the devices by playing audio through them.
   * @param [soundUrl] - An optional URL. If none is specified, we will
   *   play a default test tone.
   * @returns Resolves with the result of the underlying HTMLAudioElements' `play()` calls.
   */
  test(soundUrl?: string): Promise<any>;
}
