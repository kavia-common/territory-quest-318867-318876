import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// PUBLIC_INTERFACE
/**
 * Authentication middleware
 * Validates the JWT token from Authorization header and attaches user info to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Missing or invalid authorization header',
          statusCode: 401
        }
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn(`Authentication failed: ${error?.message || 'Invalid token'}`);
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid or expired token',
          statusCode: 401
        }
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;
    
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Authentication failed',
        statusCode: 500
      }
    });
  }
};

// PUBLIC_INTERFACE
/**
 * Optional authentication middleware
 * Tries to authenticate but doesn't fail if no token is provided
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = user;
      req.userId = user.id;
    }
    
    next();
  } catch (error) {
    logger.error(`Optional auth error: ${error.message}`);
    next();
  }
};
