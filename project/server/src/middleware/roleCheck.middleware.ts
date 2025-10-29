import { Request, Response, NextFunction } from 'express';
import { UserRole, Permission, hasPermission } from '../config/roles.config';

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    
    if (!hasPermission(user.role, permission)) {
      return res.status(403).json({ 
        error: 'Permission insuffisante',
        required: permission,
        userRole: user.role
      });
    }
    
    next();
  };
}

export function requireRole(minRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    
    if (!user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }
    
    const roleHierarchy: Record<UserRole, number> = {
      [UserRole.USER]: 1,
      [UserRole.ADMIN]: 2,
      [UserRole.SUPER_ADMIN]: 3
    };
    
    if (roleHierarchy[user.role] < roleHierarchy[minRole]) {
      return res.status(403).json({ 
        error: 'Rôle insuffisant',
        required: minRole,
        userRole: user.role
      });
    }
    
    next();
  };
}
