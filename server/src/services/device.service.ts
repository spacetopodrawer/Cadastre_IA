import { DeviceInfo } from '../types/roles';
import { ROLES, DEVICE_TYPES } from '../config/roles.config';

export class DeviceService {
  private devices: Map<string, DeviceInfo> = new Map();

  async registerDevice(device: Omit<DeviceInfo, 'id' | 'isOnline' | 'isApproved' | 'lastSeenAt'>): Promise<DeviceInfo> {
    const deviceId = this.generateDeviceId();
    const now = new Date();
    
    const newDevice: DeviceInfo = {
      ...device,
      id: deviceId,
      isOnline: true,
      isApproved: !ROLES[device.userRole]?.requiresApproval,
      lastSeenAt: now
    };

    this.devices.set(deviceId, newDevice);
    return newDevice;
  }

  async getDevice(deviceId: string): Promise<DeviceInfo | undefined> {
    return this.devices.get(deviceId);
  }

  async getUserDevices(userId: string): Promise<DeviceInfo[]> {
    return Array.from(this.devices.values()).filter(device => device.userId === userId);
  }

  async updateDeviceStatus(deviceId: string, isOnline: boolean): Promise<DeviceInfo | null> {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    const updatedDevice = {
      ...device,
      isOnline,
      lastSeenAt: new Date()
    };

    this.devices.set(deviceId, updatedDevice);
    return updatedDevice;
  }

  async approveDevice(deviceId: string, approve: boolean): Promise<DeviceInfo | null> {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    const updatedDevice = {
      ...device,
      isApproved: approve
    };

    this.devices.set(deviceId, updatedDevice);
    return updatedDevice;
  }

  async removeDevice(deviceId: string): Promise<boolean> {
    return this.devices.delete(deviceId);
  }

  async getDevicesByStatus(isOnline: boolean): Promise<DeviceInfo[]> {
    return Array.from(this.devices.values()).filter(device => device.isOnline === isOnline);
  }

  async getPendingApprovals(): Promise<DeviceInfo[]> {
    return Array.from(this.devices.values()).filter(
      device => !device.isApproved && ROLES[device.userRole]?.requiresApproval
    );
  }

  private generateDeviceId(): string {
    return 'dev_' + Math.random().toString(36).substr(2, 9);
  }

  // Méthode utilitaire pour vérifier les limites d'appareils
  async checkDeviceLimits(userId: string, userRole: string): Promise<{ canAdd: boolean; reason?: string }> {
    const userDevices = await this.getUserDevices(userId);
    const roleConfig = ROLES[userRole];
    
    if (!roleConfig) {
      return { canAdd: false, reason: 'Rôle utilisateur invalide' };
    }

    if (userDevices.length >= roleConfig.maxDevices) {
      return {
        canAdd: false,
        reason: `Limite de ${roleConfig.maxDevices} appareils atteinte pour ce rôle`
      };
    }

    return { canAdd: true };
  }

  // Nettoyage des appareils inactifs
  async cleanupInactiveDevices(inactiveDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

    let removedCount = 0;
    
    for (const [id, device] of this.devices.entries()) {
      if (device.lastSeenAt < cutoffDate) {
        this.devices.delete(id);
        removedCount++;
      }
    }

    return removedCount;
  }
}

export const deviceService = new DeviceService();
