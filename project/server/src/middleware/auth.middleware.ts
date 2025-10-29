import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Token d\'authentification manquant' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    (req as any).user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user.role;

    const roleHierarchy: any = {
      'SUPER_ADMIN': 5,
      'ADMIN': 4,
      'EDITOR': 3,
      'VIEWER': 2,
      'USER': 1
    };

    if (roleHierarchy[userRole] >= roleHierarchy[role]) {
      next();
    } else {
      res.status(403).json({ error: 'Permissions insuffisantes' });
    }
  };
}
