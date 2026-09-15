import {
  pushDeviceRepository,
  mapPushDevice,
  type DbPushDevice,
} from '../../db/repositories/push-device.repository.js';
import type {
  PushDevice,
  RegisterPushDeviceRequest,
} from '@teamtrack/shared-types';

export class PushDeviceService {
  async registerDevice(
    userId: string,
    input: RegisterPushDeviceRequest
  ): Promise<PushDevice> {
    const row = await pushDeviceRepository.registerOrUpdateDevice({
      userId,
      platform: input.platform,
      provider: input.provider,
      pushToken: input.pushToken,
      appVersion: input.appVersion,
      deviceName: input.deviceName,
    });

    return mapPushDevice(row);
  }

  async listDevices(userId: string): Promise<PushDevice[]> {
    const rows = await pushDeviceRepository.listDevicesByUserId(userId);
    return rows.map(mapPushDevice);
  }

  async deleteDevice(userId: string, deviceId: string): Promise<boolean> {
    return pushDeviceRepository.deleteDevice(userId, deviceId);
  }

  async getDevice(userId: string, deviceId: string): Promise<PushDevice | null> {
    const row = await pushDeviceRepository.findUserDevice(userId, deviceId);
    return row ? mapPushDevice(row) : null;
  }
}

export const pushDeviceService = new PushDeviceService();
