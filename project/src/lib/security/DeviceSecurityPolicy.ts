import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { FusionAuditLog } from './FusionAuditLog';

export type DeviceRole = 'admin' | 'operator' | 'sensor' | 'gateway' | 'viewer';

export interface DevicePolicy {
  id: string;
  deviceId: string;
  role: DeviceRole;
  permissions: string[];
  token: string;
  tokenExpiresAt: Date | null;
  lastRotated: Date;
  isRevoked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class DeviceSecurityPolicy {
  private static instance: DeviceSecurityPolicy;
  private policies: Map<string, DevicePolicy> = new Map();
  private tokenSecrets: Map<string, string> = new Map();
  private tokenExpiryHours = 24 * 30; // 30 days default

  private constructor() {
    this.initializePolicies();
  }

  public static getInstance(): DeviceSecurityPolicy {
    if (!DeviceSecurityPolicy.instance) {
      DeviceSecurityPolicy.instance = new DeviceSecurityPolicy();
    }
    return DeviceSecurityPolicy.instance;
  }

  private initializePolicies(): void {
    // Add some default policies for demo purposes
    const defaultPolicies: DevicePolicy[] = [
      this.createPolicy('dev-wifi-001', 'admin'),
      this.createPolicy('dev-gsm-001', 'sensor'),
      this.createPolicy('dev-uhf-001', 'gateway')
    ];

    defaultPolicies.forEach(policy => {
      this.policies.set(policy.deviceId, policy);
    });
  }

  private createPolicy(deviceId: string, role: DeviceRole = 'viewer'): DevicePolicy {
    const token = this.generateToken(deviceId);
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setHours(now.getHours() + this.tokenExpiryHours);

    return {
      id: uuidv4(),
      deviceId,
      role,
      permissions: this.getDefaultPermissions(role),
      token,
      tokenExpiresAt: expiresAt,
      lastRotated: now,
      isRevoked: false,
      createdAt: now,
      updatedAt: now
    };
  }

  private getDefaultPermissions(role: DeviceRole): string[] {
    const permissions: Record<DeviceRole, string[]> = {
      admin: ['*'],
      operator: ['device:read', 'device:write', 'data:read', 'data:write'],
      sensor: ['data:write', 'status:update'],
      gateway: ['device:read', 'data:read', 'data:write', 'command:forward'],
      viewer: ['device:read', 'data:read']
    };

    return permissions[role] || [];
  }

  public async list(): Promise<DevicePolicy[]> {
    await new Promise(resolve => setTimeout(resolve, 200)); // Simulate network delay
    return Array.from(this.policies.values());
  }

  public async getByDeviceId(deviceId: string): Promise<DevicePolicy | null> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.policies.get(deviceId) || null;
  }

  public async getByToken(token: string): Promise<DevicePolicy | null> {
    await new Promise(resolve => setTimeout(resolve, 100));
    for (const policy of this.policies.values()) {
      if (policy.token === token && !policy.isRevoked) {
        // Check if token is expired
        if (policy.tokenExpiresAt && policy.tokenExpiresAt < new Date()) {
          await FusionAuditLog.logSecurityEvent({
            action: 'token_expired',
            deviceId: policy.deviceId,
            details: {
              tokenId: policy.id,
              expiredAt: policy.tokenExpiresAt
            }
          });
          return null;
        }
        return policy;
      }
    }
    return null;
  }

  public async generateToken(deviceId: string, role?: DeviceRole): Promise<string> {
    const existingPolicy = await this.getByDeviceId(deviceId);
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setHours(now.getHours() + this.tokenExpiryHours);

    const token = this.generateSecureToken();
    
    const policy: DevicePolicy = {
      id: existingPolicy?.id || uuidv4(),
      deviceId,
      role: role || existingPolicy?.role || 'viewer',
      permissions: existingPolicy?.permissions || this.getDefaultPermissions(role || 'viewer'),
      token,
      tokenExpiresAt: expiresAt,
      lastRotated: now,
      isRevoked: false,
      createdAt: existingPolicy?.createdAt || now,
      updatedAt: now
    };

    this.policies.set(deviceId, policy);
    
    await FusionAuditLog.logSecurityEvent({
      action: 'token_generated',
      deviceId,
      details: {
        tokenId: policy.id,
        expiresAt: expiresAt.toISOString()
      }
    });

    return token;
  }

  public async revokeToken(deviceId: string): Promise<boolean> {
    const policy = await this.getByDeviceId(deviceId);
    if (!policy) return false;

    policy.isRevoked = true;
    policy.updatedAt = new Date();
    this.policies.set(deviceId, policy);

    await FusionAuditLog.logSecurityEvent({
      action: 'token_revoked',
      deviceId,
      details: {
        tokenId: policy.id
      }
    });

    return true;
  }

  public async validateToken(token: string): Promise<boolean> {
    if (!token) return false;
    
    const policy = await this.getByToken(token);
    if (!policy) return false;
    
    // Check if token is expired
    if (policy.tokenExpiresAt && policy.tokenExpiresAt < new Date()) {
      return false;
    }
    
    return !policy.isRevoked;
  }

  public async hasPermission(token: string, permission: string): Promise<boolean> {
    const policy = await this.getByToken(token);
    if (!policy) return false;
    
    // Admin has all permissions
    if (policy.role === 'admin') return true;
    
    // Check if the permission is in the policy's permissions
    return policy.permissions.includes(permission) || 
           policy.permissions.includes('*') ||
           policy.permissions.some(p => p.endsWith(':*') && permission.startsWith(p.split(':')[0] + ':'));
  }

  private generateSecureToken(): string {
    // Generate a secure random token
    const buffer = randomBytes(32);
    return buffer.toString('hex');
  }

  private hashToken(token: string): string {
    // Hash the token for secure storage (not used in this mock implementation)
    return createHash('sha256').update(token).digest('hex');
  }
}

export const deviceSecurityPolicy = DeviceSecurityPolicy.getInstance();

// For backward compatibility
export default {
  list: () => deviceSecurityPolicy.list(),
  getByDeviceId: (deviceId: string) => deviceSecurityPolicy.getByDeviceId(deviceId),
  getByToken: (token: string) => deviceSecurityPolicy.getByToken(token),
  generateToken: (deviceId: string, role?: string) => 
    deviceSecurityPolicy.generateToken(deviceId, role as any),
  revokeToken: (deviceId: string) => deviceSecurityPolicy.revokeToken(deviceId),
  validateToken: (token: string) => deviceSecurityPolicy.validateToken(token),
  hasPermission: (token: string, permission: string) => 
    deviceSecurityPolicy.hasPermission(token, permission)
};
