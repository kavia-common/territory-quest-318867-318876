import rateLimit from 'express-rate-limit';

/**
 * Rate limiting middleware for different operation types
 * Provides granular control over API endpoint access rates
 */

// Authentication operations (signup, login) - more restrictive
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many authentication attempts, please try again later',
      statusCode: 429
    }
  },
  skipSuccessfulRequests: false
});

// Write operations (POST, PUT, DELETE) - moderately restrictive
export const writeLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_S || '60') * 1000, // 1 minute
  max: 30, // 30 write requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many write requests, please slow down',
      statusCode: 429
    }
  }
});

// Read operations (GET) - less restrictive
export const readLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_S || '60') * 1000, // 1 minute
  max: 100, // 100 read requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later',
      statusCode: 429
    }
  }
});
