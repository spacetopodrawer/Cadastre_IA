import { Request, Response, NextFunction } from 'express';
import { ROLES } from '../config/roles.config';

export const hasPermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const userRole = req.user.userRole;
    const roleConfig = ROLES[userRole];

    if (!roleConfig) {
      return res.status(403).json({ error: 'Rôle utilisateur invalide' });
    }

    // Vérifier si le rôle a la permission requise
    if (!roleConfig.permissions.includes(permission)) {
      return res.status(403).json({ 
        error: 'Permissions insuffisantes',
        requiredPermission: permission,
        userPermissions: roleConfig.permissions
      });
    }

    next();
  };
};

export const checkDeviceOwnership = (req: Request, res: Response, next: NextFunction) => {
  const { deviceId } = req.params;
  const { userId, userRole } = req.user!;

  // Les administrateurs peuvent accéder à tous les appareils
  if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
    return next();
  }

  // Vérifier si l'appareil appartient à l'utilisateur
  const device = deviceService.getDevice(deviceId);
  if (!device) {
    return res.status(404).json({ error: 'Appareil non trouvé' });
  }

  if (device.userId !== userId) {
    return res.status(403).json({ error: 'Accès non autorisé à cet appareil' });
  }

  next();
};

// Import nécessaire pour la vérification de propriété
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        userName: string;
        userRole: string;
        permissions: string[];
      };
    }
  }
}

// Note: L'import de deviceService a été retiré car il causait une dépendance circulaire
// La vérification de propriété sera gérée directement dans le contrôleur
