import { FusionAuditLog } from './FusionAuditLog';

export type Role = 'contributor' | 'validator' | 'auditor' | 'superadmin' | 'assistant';

export type PermissionScope = 
  | 'annotation' 
  | 'validation' 
  | 'sync' 
  | 'audit' 
  | 'admin' 
  | 'export'
  | 'mission_admin';

export interface RoleAssignment {
  id: string;
  userId: string;
  role: Role;
  missionId?: string;
  scopes: PermissionScope[];
  grantedBy: string;
  timestamp: number;
  expiresAt?: number;
  metadata?: {
    delegatedFrom?: string;
    reason?: string;
    temporary?: boolean;
  };
}

export class RoleManager {
  private static instance: RoleManager;
  private assignments: Map<string, RoleAssignment> = new Map();
  private roleHierarchy: Record<Role, number> = {
    contributor: 1,
    assistant: 2,
    validator: 3,
    auditor: 4,
    superadmin: 5
  };

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): RoleManager {
    if (!RoleManager.instance) {
      RoleManager.instance = new RoleManager();
    }
    return RoleManager.instance;
  }

  /**
   * Assign a role to a user with optional scopes and expiration
   */
  public assignRole(
    userId: string,
    role: Role,
    scopes: PermissionScope[],
    grantedBy: string = 'system',
    missionId?: string,
    options: {
      expiresAt?: number;
      delegatedFrom?: string;
      reason?: string;
      temporary?: boolean;
    } = {}
  ): RoleAssignment {
    // Check if the granter has permission to assign this role
    if (grantedBy !== 'system' && !this.canGrantRole(grantedBy, role, missionId)) {
      throw new Error('Insufficient permissions to assign this role');
    }

    const assignment: RoleAssignment = {
      id: `role_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      role,
      scopes,
      missionId,
      grantedBy,
      timestamp: Date.now(),
      expiresAt: options.expiresAt,
      metadata: {
        delegatedFrom: options.delegatedFrom,
        reason: options.reason,
        temporary: options.temporary
      }
    };

    this.assignments.set(assignment.id, assignment);
    this.saveToStorage();

    FusionAuditLog.record('role_assignment', grantedBy, {
      assignmentId: assignment.id,
      userId,
      role,
      scopes,
      missionId,
      expiresAt: options.expiresAt
    }, missionId);

    return assignment;
  }

  /**
   * Revoke a role assignment
   */
  public revokeRole(
    assignmentId: string,
    revokedBy: string,
    reason?: string
  ): boolean {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) return false;

    // Check if revoker has permission to revoke this role
    if (revokedBy !== 'system' && !this.canRevokeRole(revokedBy, assignment)) {
      throw new Error('Insufficient permissions to revoke this role');
    }

    this.assignments.delete(assignmentId);
    this.saveToStorage();

    FusionAuditLog.record('role_revocation', revokedBy, {
      assignmentId,
      userId: assignment.userId,
      role: assignment.role,
      reason,
      timestamp: Date.now()
    }, assignment.missionId);

    return true;
  }

  /**
   * Get all roles for a user, optionally filtered by mission
   */
  public getUserRoles(
    userId: string,
    options: { 
      missionId?: string; 
      includeExpired?: boolean 
    } = {}
  ): RoleAssignment[] {
    const now = Date.now();
    return Array.from(this.assignments.values()).filter(a => 
      a.userId === userId &&
      (!options.missionId || a.missionId === options.missionId) &&
      (options.includeExpired || !a.expiresAt || a.expiresAt > now)
    );
  }

  /**
   * Check if a user has a specific permission
   */
  public hasPermission(
    userId: string,
    scope: PermissionScope,
    options: {
      missionId?: string;
      requireAllScopes?: boolean;
      minRole?: Role;
    } = {}
  ): boolean {
    const now = Date.now();
    const userRoles = this.getUserRoles(userId, { missionId: options.missionId });
    
    // If minRole is specified, filter out roles below the minimum
    const relevantRoles = options.minRole
      ? userRoles.filter(role => this.roleHierarchy[role.role] >= this.roleHierarchy[options.minRole!])
      : userRoles;

    // Check if any role has the required scope(s)
    return relevantRoles.some(assignment => {
      const hasExpired = assignment.expiresAt && assignment.expiresAt <= now;
      if (hasExpired) return false;
      
      if (Array.isArray(scope)) {
        return options.requireAllScopes
          ? scope.every(s => assignment.scopes.includes(s))
          : scope.some(s => assignment.scopes.includes(s));
      }
      return assignment.scopes.includes(scope);
    });
  }

  /**
   * Delegate a subset of permissions to another user
   */
  public delegatePermissions(
    delegatorId: string,
    delegateeId: string,
    scopes: PermissionScope[],
    options: {
      missionId?: string;
      expiresAt?: number;
      reason?: string;
    } = {}
  ): RoleAssignment | null {
    // Check if delegator has the permissions they're trying to delegate
    if (!this.hasPermission(delegatorId, scopes, { 
      missionId: options.missionId,
      requireAllScopes: true 
    })) {
      return null;
    }

    return this.assignRole(
      delegateeId,
      this.getRoleForScopes(scopes),
      scopes,
      delegatorId,
      options.missionId,
      {
        expiresAt: options.expiresAt,
        delegatedFrom: delegatorId,
        reason: options.reason,
        temporary: true
      }
    );
  }

  /**
   * Get all users with a specific role or permission
   */
  public getUsersWithRole(
    roleOrScope: Role | PermissionScope,
    options: {
      missionId?: string;
      includeExpired?: boolean;
    } = {}
  ): string[] {
    const now = Date.now();
    const users = new Set<string>();
    
    for (const assignment of this.assignments.values()) {
      const isRoleMatch = this.roleHierarchy[roleOrScope as Role] !== undefined && 
                         assignment.role === roleOrScope;
      const isScopeMatch = assignment.scopes.includes(roleOrScope as PermissionScope);
      const isExpired = assignment.expiresAt && assignment.expiresAt <= now;
      const missionMatch = !options.missionId || assignment.missionId === options.missionId;
      
      if ((isRoleMatch || isScopeMatch) && missionMatch && (options.includeExpired || !isExpired)) {
        users.add(assignment.userId);
      }
    }
    
    return Array.from(users);
  }

  /**
   * Check if a user can grant a specific role
   */
  private canGrantRole(granterId: string, role: Role, missionId?: string): boolean {
    // Only superadmins can grant superadmin roles
    if (role === 'superadmin') {
      return this.hasPermission(granterId, 'admin', { minRole: 'superadmin' });
    }
    
    // For other roles, check if granter has admin permissions
    // and is of equal or higher role level
    const granterRoles = this.getUserRoles(granterId, { missionId });
    const granterLevel = Math.max(...granterRoles.map(r => this.roleHierarchy[r.role]));
    const targetLevel = this.roleHierarchy[role];
    
    return granterLevel >= targetLevel && 
           this.hasPermission(granterId, 'admin', { missionId });
  }

  /**
   * Check if a user can revoke a specific role assignment
   */
  private canRevokeRole(revokerId: string, assignment: RoleAssignment): boolean {
    // Users can revoke their own delegated roles
    if (assignment.metadata?.delegatedFrom === revokerId) {
      return true;
    }
    
    // Otherwise, check admin permissions
    return this.canGrantRole(revokerId, assignment.role, assignment.missionId);
  }

  /**
   * Determine the most appropriate role for a set of scopes
   */
  private getRoleForScopes(scopes: PermissionScope[]): Role {
    if (scopes.includes('admin')) return 'superadmin';
    if (scopes.includes('audit')) return 'auditor';
    if (scopes.includes('validation')) return 'validator';
    if (scopes.some(s => ['annotation', 'export'].includes(s))) return 'contributor';
    return 'contributor';
  }

  /**
   * Save assignments to persistent storage
   */
  private saveToStorage(): void {
    try {
      const data = JSON.stringify(Array.from(this.assignments.entries()));
      localStorage.setItem('role_assignments', data);
    } catch (error) {
      console.error('Failed to save role assignments:', error);
    }
  }

  /**
   * Load assignments from persistent storage
   */
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem('role_assignments');
      if (data) {
        const entries = JSON.parse(data);
        this.assignments = new Map(entries);
      }
    } catch (error) {
      console.error('Failed to load role assignments:', error);
      this.assignments = new Map();
    }
  }

  /**
   * Clean up expired roles
   */
  public cleanupExpiredRoles(): number {
    const now = Date.now();
    let count = 0;
    
    for (const [id, assignment] of this.assignments.entries()) {
      if (assignment.expiresAt && assignment.expiresAt <= now) {
        this.assignments.delete(id);
        count++;
      }
    }
    
    if (count > 0) {
      this.saveToStorage();
    }
    
    return count;
  }
}

// Singleton instance
export const roleManager = RoleManager.getInstance();

// Run cleanup on startup
roleManager.cleanupExpiredRoles();

// Run cleanup every hour
setInterval(() => roleManager.cleanupExpiredRoles(), 60 * 60 * 1000);
