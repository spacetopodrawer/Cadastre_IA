import { DeviceType, ROLE_PROFILES, UserRole } from './roles.config';

export interface DeviceRegistration {
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  ipAddress: string;
  userAgent: string;
  lastActive: Date;
  isApproved: boolean;
  requiresApproval: boolean;
  isOnline?: boolean;
}

export interface DevicePolicy {
  maxDevices: number;
  allowedTypes: DeviceType[];
  requiresApproval: boolean;
  sessionTimeout: number; // in minutes
}

export const DEVICE_POLICIES: Record<DeviceType, DevicePolicy> = {
  [DeviceType.SERVER]: {
    maxDevices: 2,
    allowedTypes: [DeviceType.SERVER],
    requiresApproval: true,
    sessionTimeout: 1440 // 24h
  },
  [DeviceType.PC]: {
    maxDevices: 3,
    allowedTypes: [DeviceType.PC],
    requiresApproval: false,
    sessionTimeout: 480 // 8h
  },
  [DeviceType.MOBILE]: {
    maxDevices: 5,
    allowedTypes: [DeviceType.MOBILE, DeviceType.TABLET],
    requiresApproval: false,
    sessionTimeout: 240 // 4h
  },
  [DeviceType.TABLET]: {
    maxDevices: 3,
    allowedTypes: [DeviceType.TABLET, DeviceType.MOBILE],
    requiresApproval: false,
    sessionTimeout: 240 // 4h
  }
};

export function canAddDevice(
  userRole: UserRole,
  currentDevices: number,
  deviceType: DeviceType
): { allowed: boolean; reason?: string } {
  const policy = DEVICE_POLICIES[deviceType];
  if (!policy) {
    return { allowed: false, reason: 'Type d\'appareil non pris en charge' };
  }

  if (currentDevices >= policy.maxDevices) {
    return { 
      allowed: false, 
      reason: `Limite de ${policy.maxDevices} appareils atteinte pour ce type` 
    };
  }

  const roleProfile = ROLE_PROFILES[userRole];
  if (!roleProfile || !roleProfile.allowedDeviceTypes.includes(deviceType)) {
    return { 
      allowed: false, 
      reason: 'Type d\'appareil non autorisé pour ce rôle' 
    };
  }

  return { allowed: true };
}
