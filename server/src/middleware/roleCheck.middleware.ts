import { Request, Response, NextFunction } from 'express';
import { UserRole, hasPermission, ROLE_PROFILES } from '../config/roles.config';

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole;
    
    if (!userRole) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (!hasPermission(userRole, permission as any)) {
      return res.status(403).json({ 
        error: 'Accès refusé',
        requiredPermission: permission,
        userRole
      });
    }

    next();
  };
}

export function requireRole(requiredRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role as UserRole;
    
    if (!userRole) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const roleHierarchy = {
      [UserRole.USER]: 1,
      [UserRole.ADMIN]: 2,
      [UserRole.SUPER_ADMIN]: 3
    };

    if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
      return res.status(403).json({ 
        error: 'Privilèges insuffisants',
        requiredRole,
        userRole
      });
    }

    next();
  };
}

export function checkDeviceAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const deviceId = req.params.deviceId;
    const userId = req.user?.id;
    
    try {
      // Implémentez la logique de vérification d'accès à l'appareil
      // Exemple: const hasAccess = await deviceService.checkUserDeviceAccess(userId, deviceId);
      // if (!hasAccess) return res.status(403).json({ error: 'Accès à l\'appareil refusé' });
      next();
    } catch (error) {
      next(error);
    }
  };
}
