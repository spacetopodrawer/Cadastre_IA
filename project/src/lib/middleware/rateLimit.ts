import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';

// Rate limiting configuration
const rateLimitPoints = {
  // Points consumed per operation
  points: 5,                  // 5 points
  duration: 1,                // Per second
  blockDuration: 60 * 5,       // Block for 5 minutes if exceeded
};

const rateLimiter = new RateLimiterMemory(rateLimitPoints);

export const rateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Use IP or user ID if authenticated
  const key = req.user?.id || req.ip;
  
  rateLimiter.consume(key, 1)
    .then(() => {
      next();
    })
    .catch(() => {
      res.status(429).json({
        error: 'Too many requests',
        message: 'Too many requests from this IP, please try again later',
        retryAfter: rateLimitPoints.blockDuration,
      });
    });
};

// Specific rate limiter for sensitive operations
const sensitiveLimiter = new RateLimiterMemory({
  points: 2,                  // 2 points
  duration: 60,               // Per minute
  blockDuration: 60 * 30,     // Block for 30 minutes if exceeded
});

export const sensitiveRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const key = `sensitive_${req.user?.id || req.ip}`;
  
  sensitiveLimiter.consume(key, 1)
    .then(() => {
      next();
    })
    .catch(() => {
      res.status(429).json({
        error: 'Too many requests',
        message: 'Too many sensitive operations. Please wait before trying again.',
        retryAfter: 60 * 30, // 30 minutes
      });
    });
};
