import { v4 as uuidv4 } from 'uuid';
import { DeviceType } from '../config/roles.config';
import { DeviceRegistration, DevicePolicy, DEVICE_POLICIES } from '../config/device.config';
import { auditService } from './auditService';

// Simule une base de données en mémoire
const devicesDB: Map<string, DeviceRegistration> = new Map();

export const deviceService = {
  async registerDevice(deviceData: Omit<DeviceRegistration, 'deviceId' | 'lastActive' | 'isApproved'>): Promise<DeviceRegistration> {
    const deviceId = uuidv4();
    const newDevice: DeviceRegistration = {
      ...deviceData,
      deviceId,
      lastActive: new Date(),
      isApproved: !DEVICE_POLICIES[deviceData.deviceType].requiresApproval,
      requiresApproval: DEVICE_POLICIES[deviceData.deviceType].requiresApproval,
      isOnline: true
    };
    
    devicesDB.set(deviceId, newDevice);
    
    await auditService.logAction({
      userId: deviceData.userId,
      action: 'DEVICE_REGISTERED',
      targetId: deviceId,
      details: `Nouvel appareil enregistré: ${deviceData.deviceName}`,
      ipAddress: deviceData.ipAddress,
      userAgent: deviceData.userAgent
    });
    
    return newDevice;
  },

  async approveDevice(deviceId: string, approvedBy: string): Promise<DeviceRegistration> {
    const device = devicesDB.get(deviceId);
    if (!device) {
      throw new Error('Appareil non trouvé');
    }
    
    device.isApproved = true;
    device.requiresApproval = false;
    devicesDB.set(deviceId, device);
    
    await auditService.logAction({
      userId: approvedBy,
      action: 'DEVICE_APPROVED',
      targetId: deviceId,
      details: `Appareil ${device.deviceName} approuvé`
    });
    
    return device;
  },

  async removeDevice(deviceId: string, requestedBy: string): Promise<void> {
    const device = devicesDB.get(deviceId);
    if (!device) {
      throw new Error('Appareil non trouvé');
    }
    
    await auditService.logAction({
      userId: requestedBy,
      action: 'DEVICE_REMOVED',
      targetId: deviceId,
      details: `Appareil ${device.deviceName} supprimé`
    });
    
    devicesDB.delete(deviceId);
  },

  async getDevicesByUser(userId: string): Promise<DeviceRegistration[]> {
    return Array.from(devicesDB.values())
      .filter(device => device.userId === userId);
  },

  async updateDeviceStatus(deviceId: string, isOnline: boolean): Promise<void> {
    const device = devicesDB.get(deviceId);
    if (device) {
      device.lastActive = new Date();
      device.isOnline = isOnline;
      devicesDB.set(deviceId, device);
    }
  },

  async getDeviceById(deviceId: string): Promise<DeviceRegistration | undefined> {
    return devicesDB.get(deviceId);
  },

  async getAllDevices(): Promise<DeviceRegistration[]> {
    return Array.from(devicesDB.values());
  },
  
  // Méthode utilitaire pour les tests
  _clearDevices(): void {
    devicesDB.clear();
  }
};

// Export pour les tests
if (process.env.NODE_ENV === 'test') {
  (deviceService as any).devicesDB = devicesDB;
}
