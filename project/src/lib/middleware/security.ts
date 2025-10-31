import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { rateLimit, sensitiveRateLimit } from './rateLimit';

// Request validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array() 
    });
  }
  next();
};

// Authentication check middleware
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Authentication required' 
    });
  }
  next();
};

// Role-based access control
export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required' 
      });
    }

    const userRoles = Array.isArray(req.user.roles) 
      ? req.user.roles 
      : [req.user.roles];
    
    const requiredRoles = Array.isArray(roles) ? roles : [roles];
    const hasRole = requiredRoles.some(role => userRoles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Insufficient permissions' 
      });
    }
    
    next();
  };
};

// Anti-CSRF protection
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF check for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
  
  if (!csrfToken || !req.session.csrfToken || csrfToken !== req.session.csrfToken) {
    return res.status(403).json({
      error: 'Invalid CSRF token',
      message: 'Invalid or missing CSRF token'
    });
  }
  
  next();
};

// Apply security headers
export const securityHeaders = (req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' https://api.yourdomain.com;"
  );
  
  // HSTS - only enable in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};

// Rate limiting for reward claims
export const rewardRateLimit = [
  rateLimit,
  (req: Request, res: Response, next: NextFunction) => {
    // Additional rate limiting for reward claims
    const userId = req.user?.id;
    if (!userId) return next();
    
    // Apply stricter limits for reward claims
    const rewardId = req.body.rewardId;
    if (rewardId) {
      return sensitiveRateLimit(req, res, next);
    }
    
    next();
  }
];

// Input sanitization
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize request body, query, and params
  const sanitize = (data: any): any => {
    if (!data) return data;
    
    if (typeof data === 'string') {
      // Basic XSS protection
      return data.replace(/[<>\"\'`]/g, '');
    }
    
    if (Array.isArray(data)) {
      return data.map(sanitize);
    }
    
    if (typeof data === 'object') {
      const sanitized: Record<string, any> = {};
      for (const key in data) {
        sanitized[key] = sanitize(data[key]);
      }
      return sanitized;
    }
    
    return data;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
};
