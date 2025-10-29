import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ROLES } from '../config/roles.config';

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

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }

      // Vérifier que le rôle de l'utilisateur est valide
      if (!user || !user.role || !ROLES[user.role]) {
        return res.status(403).json({ error: 'Rôle utilisateur invalide' });
      }

      // Ajouter les informations de l'utilisateur à la requête
      req.user = {
        userId: user.userId,
        userName: user.userName,
        userRole: user.role,
        permissions: ROLES[user.role].permissions || []
      };

      next();
    });
  } else {
    res.sendStatus(401);
  }
};

export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const userRole = req.user.userRole;
    
    if (Array.isArray(roles)) {
      if (!roles.includes(userRole)) {
        return res.status(403).json({ error: 'Permissions insuffisantes' });
      }
    } else if (userRole !== roles) {
      return res.status(403).json({ error: 'Permissions insuffisantes' });
    }

    next();
  };
};
