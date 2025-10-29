import { UserRole, DeviceType } from './roles.config';

export interface DeviceRegistration {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  userId: string;
  userRole: UserRole;
  ipAddress: string;
  isApproved: boolean;
  requiresValidation: boolean;
  registeredAt: Date;
  lastSeenAt: Date;
}

export interface DevicePolicy {
  deviceType: DeviceType;
  allowedRoles: UserRole[];
  requiresApproval: boolean;
  maxDevicesPerUser: number;
  autoSync: boolean;
}

export const DEVICE_POLICIES: Record<DeviceType, DevicePolicy> = {
  [DeviceType.SERVER]: {
    deviceType: DeviceType.SERVER,
    allowedRoles: [UserRole.SUPER_ADMIN],
    requiresApproval: true,
    maxDevicesPerUser: 1,
    autoSync: true
  },
  [DeviceType.PC]: {
    deviceType: DeviceType.PC,
    allowedRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    requiresApproval: true,
    maxDevicesPerUser: 2,
    autoSync: true
  },
  [DeviceType.MOBILE]: {
    deviceType: DeviceType.MOBILE,
    allowedRoles: [UserRole.ADMIN, UserRole.USER],
    requiresApproval: false, // Auto-enregistrement
    maxDevicesPerUser: 3,
    autoSync: false // Sync manuel pour économiser données
  },
  [DeviceType.TABLET]: {
    deviceType: DeviceType.TABLET,
    allowedRoles: [UserRole.ADMIN, UserRole.USER],
    requiresApproval: false,
    maxDevicesPerUser: 2,
    autoSync: false
  }
};

// Valider l'ajout d'un device
export function canAddDevice(
  deviceType: DeviceType,
  userRole: UserRole,
  currentDeviceCount: number
): { allowed: boolean; reason?: string } {
  const policy = DEVICE_POLICIES[deviceType];
  
  if (!policy.allowedRoles.includes(userRole)) {
    return { 
      allowed: false, 
      reason: `Le rôle ${userRole} n'est pas autorisé pour ${deviceType}` 
    };
  }
  
  if (currentDeviceCount >= policy.maxDevicesPerUser) {
    return { 
      allowed: false, 
      reason: `Limite atteinte : ${policy.maxDevicesPerUser} devices max` 
    };
  }
  
  return { allowed: true };
}
