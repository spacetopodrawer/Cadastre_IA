import { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ValidationError } from 'class-validator';

interface AppError extends Error {
  statusCode?: number;
  code?: number;
  errors?: any[];
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Erreur:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : {},
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Gestion des erreurs JWT
  if (err instanceof JsonWebTokenError) {
    return res.status(401).json({
      success: false,
      error: 'Token JWT invalide',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }

  if (err instanceof TokenExpiredError) {
    return res.status(401).json({
      success: false,
      error: 'Session expirée',
      details: 'Veuillez vous reconnecter',
    });
  }

  // Gestion des erreurs de validation
  if (Array.isArray(err.errors) && err.errors[0] instanceof ValidationError) {
    const validationErrors = err.errors.map((e: ValidationError) => ({
      field: e.property,
      constraints: e.constraints,
    }));

    return res.status(400).json({
      success: false,
      error: 'Erreur de validation',
      validationErrors,
    });
  }

  // Gestion des erreurs MongoDB
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    // Erreur de clé dupliquée
    if (err.code === 11000) {
      const field = Object.keys((err as any).keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: 'Entrée en double',
        details: `La valeur pour le champ '${field}' existe déjà`,
      });
    }

    // Autres erreurs MongoDB
    return res.status(500).json({
      success: false,
      error: 'Erreur de base de données',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }

  // Gestion des erreurs personnalisées
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // Erreur 500 par défaut
  res.status(500).json({
    success: false,
    error: 'Erreur serveur interne',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Ressource non trouvée') {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  errors: any[];

  constructor(errors: any[], message: string = 'Erreur de validation') {
    super(message, 400);
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Non autorisé') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Accès refusé') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflit de données') {
    super(message, 409);
  }
}
