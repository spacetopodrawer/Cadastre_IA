import { roleManager, RoleAssignment, Role, PermissionScope } from '../security/RoleManager';
import { FusionAuditLog } from '../security/FusionAuditLog';

type RoleStats = {
  totalAssignments: number;
  byRole: Record<Role, number>;
  byScope: Record<PermissionScope, number>;
  activeUsers: number;
  recentActivity: Array<{
    timestamp: number;
    type: 'assignment' | 'revocation';
    role: Role;
    userId: string;
    grantedBy: string;
    missionId?: string;
  }>;
};

export class RoleDashboard {
  private static instance: RoleDashboard;
  private readonly MAX_RECENT_ACTIVITY = 50;

  private constructor() {}

  public static getInstance(): RoleDashboard {
    if (!RoleDashboard.instance) {
      RoleDashboard.instance = new RoleDashboard();
    }
    return RoleDashboard.instance;
  }

  /**
   * Get role statistics for a specific mission or globally
   */
  public getRoleStats(missionId?: string): RoleStats {
    const stats: RoleStats = {
      totalAssignments: 0,
      byRole: {
        contributor: 0,
        validator: 0,
        auditor: 0,
        superadmin: 0,
        assistant: 0
      },
      byScope: {
        annotation: 0,
        validation: 0,
        sync: 0,
        audit: 0,
        admin: 0,
        export: 0,
        mission_admin: 0
      },
      activeUsers: 0,
      recentActivity: []
    };

    const users = new Set<string>();
    const now = Date.now();

    // Get all assignments, filtered by mission if specified
    const assignments = missionId
      ? Array.from(roleManager['assignments'].values())
          .filter(a => a.missionId === missionId)
      : Array.from(roleManager['assignments'].values());

    // Process each assignment
    for (const assignment of assignments) {
      // Skip expired assignments
      if (assignment.expiresAt && assignment.expiresAt <= now) continue;

      stats.totalAssignments++;
      stats.byRole[assignment.role] = (stats.byRole[assignment.role] || 0) + 1;
      
      for (const scope of assignment.scopes) {
        stats.byScope[scope] = (stats.byScope[scope] || 0) + 1;
      }
      
      users.add(assignment.userId);
    }

    stats.activeUsers = users.size;
    stats.recentActivity = this.getRecentRoleActivity(missionId);

    return stats;
  }

  /**
   * Get recent role assignment/revocation activity
   */
  private getRecentRoleActivity(missionId?: string) {
    const logs = FusionAuditLog.getLogs({
      types: ['role_assignment', 'role_revocation'],
      limit: this.MAX_RECENT_ACTIVITY,
      missionId
    });

    return logs.map(log => ({
      timestamp: log.timestamp,
      type: log.type === 'role_assignment' ? 'assignment' : 'revocation',
      role: log.data.role,
      userId: log.data.userId,
      grantedBy: log.data.grantedBy || 'system',
      missionId: log.missionId
    }));
  }

  /**
   * Get user role summary
   */
  public getUserRoleSummary(userId: string, missionId?: string) {
    const assignments = roleManager.getUserRoles(userId, { missionId });
    const now = Date.now();
    
    return {
      userId,
      assignments: assignments.map(a => ({
        id: a.id,
        role: a.role,
        scopes: a.scopes,
        missionId: a.missionId,
        grantedBy: a.grantedBy,
        grantedAt: a.timestamp,
        expiresAt: a.expiresAt,
        isExpired: a.expiresAt ? a.expiresAt <= now : false,
        isTemporary: a.metadata?.temporary || false,
        delegatedFrom: a.metadata?.delegatedFrom
      })),
      effectivePermissions: this.getEffectivePermissions(assignments)
    };
  }

  /**
   * Calculate effective permissions from role assignments
   */
  private getEffectivePermissions(assignments: RoleAssignment[]) {
    const permissions = new Set<PermissionScope>();
    const now = Date.now();

    for (const assignment of assignments) {
      // Skip expired assignments
      if (assignment.expiresAt && assignment.expiresAt <= now) continue;
      
      for (const scope of assignment.scopes) {
        permissions.add(scope);
      }
    }

    return Array.from(permissions);
  }

  /**
   * Get all users with their roles for a mission
   */
  public getMissionUsers(missionId: string) {
    const assignments = Array.from(roleManager['assignments'].values())
      .filter(a => a.missionId === missionId);
    
    const userMap = new Map<string, {
      userId: string;
      roles: Set<Role>;
      scopes: Set<PermissionScope>;
      lastActive?: number;
    }>();

    for (const assignment of assignments) {
      if (!userMap.has(assignment.userId)) {
        userMap.set(assignment.userId, {
          userId: assignment.userId,
          roles: new Set(),
          scopes: new Set()
        });
      }

      const user = userMap.get(assignment.userId)!;
      user.roles.add(assignment.role);
      assignment.scopes.forEach(scope => user.scopes.add(scope));
      
      // Update last active timestamp
      if (!user.lastActive || assignment.timestamp > user.lastActive) {
        user.lastActive = assignment.timestamp;
      }
    }

    return Array.from(userMap.values()).map(user => ({
      ...user,
      roles: Array.from(user.roles),
      scopes: Array.from(user.scopes)
    }));
  }
}

// Singleton instance
export const roleDashboard = RoleDashboard.getInstance();
