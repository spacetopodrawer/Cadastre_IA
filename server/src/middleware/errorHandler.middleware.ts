import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(`[${new Date().toISOString()}] Erreur:`, {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.user ? { id: req.user.id, role: req.user.role } : 'Non authentifié'
  });

  // Gestion des erreurs de validation
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Erreur de validation',
      details: err.message,
      type: 'VALIDATION_ERROR'
    });
  }

  // Erreur d'authentification
  if (err.name === 'UnauthorizedError' || err.name === 'JsonWebTokenError') {
    return res.status(401).json({ 
      error: 'Non autorisé',
      details: 'Jeton d\'authentification invalide ou expiré',
      type: 'AUTH_ERROR'
    });
  }

  // Erreur d'accès refusé
  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'Accès refusé',
      details: 'Vous n\'avez pas les droits nécessaires pour effectuer cette action',
      type: 'FORBIDDEN_ERROR'
    });
  }

  // Erreur de ressource non trouvée
  if (err.name === 'NotFoundError') {
    return res.status(404).json({
      error: 'Ressource non trouvée',
      details: err.message,
      type: 'NOT_FOUND_ERROR'
    });
  }

  // Erreur de conflit
  if (err.name === 'ConflictError') {
    return res.status(409).json({
      error: 'Conflit',
      details: err.message,
      type: 'CONFLICT_ERROR'
    });
  }

  // Erreur de validation des données
  if (err.name === 'ValidationError') {
    return res.status(422).json({
      error: 'Données invalides',
      details: err.message,
      type: 'VALIDATION_ERROR'
    });
  }

  // Erreur serveur par défaut
  res.status(500).json({
    error: 'Une erreur est survenue',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Veuillez réessayer plus tard',
    type: 'INTERNAL_SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// Classes d'erreur personnalisées
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Accès refusé') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Non autorisé') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
