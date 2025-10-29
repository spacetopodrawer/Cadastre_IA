export type DeviceType = 'PC' | 'MOBILE' | 'TABLET' | 'SERVER';

export interface RolePermission {
  name: string;
  description: string;
}

export interface RoleConfig {
  name: string;
  displayName: string;
  description: string;
  maxDevices: number;
  allowedDeviceTypes: DeviceType[];
  requiresApproval: boolean;
  priority: number;
  permissions: string[];
  syncStrategy: 'MANUAL' | 'AUTOMATIC';
  conflictResolution?: 'MANUAL' | 'HIERARCHICAL' | 'LAST_WRITE_WINS';
  prompts: string[];
}

export interface DeviceInfo {
  id: string;
  name: string;
  type: DeviceType;
  userId: string;
  isOnline: boolean;
  isApproved: boolean;
  lastSeenAt: Date;
  ipAddress: string;
  userAgent?: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  resource: string;
  details: string;
  ipAddress: string;
  timestamp: Date;
}
