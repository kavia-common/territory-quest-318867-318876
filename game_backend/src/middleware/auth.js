import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

// Lazy initialization of Supabase client to ensure environment variables are loaded
let supabase = null;

const getSupabaseClient = () => {
  if (!supabase) {
    // Validate required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      logger.error('Missing required environment variables: SUPABASE_URL and SUPABASE_KEY');
      throw new Error('Missing Supabase configuration');
    }

    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
  return supabase;
};

// PUBLIC_INTERFACE
/**
 * Authentication middleware
 * Validates the JWT token from Authorization header and attaches user info to request
 * Usage: app.use(authenticate) or router.get('/protected', authenticate, handler)
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authorization header is required',
          statusCode: 401
        }
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authorization header must use Bearer scheme',
          statusCode: 401
        }
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token || token.trim() === '') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Bearer token is empty',
          statusCode: 401
        }
      });
    }

    // Verify token with Supabase
    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (error) {
      logger.warn(`Authentication failed: ${error.message}`, {
        error_code: error.code,
        url: req.url,
        method: req.method
      });
      
      // Provide more specific error messages based on error type
      let errorMessage = 'Invalid or expired token';
      if (error.message?.includes('expired')) {
        errorMessage = 'Token has expired, please login again';
      } else if (error.message?.includes('invalid')) {
        errorMessage = 'Invalid token format';
      }
      
      return res.status(401).json({
        success: false,
        error: {
          message: errorMessage,
          statusCode: 401
        }
      });
    }

    if (!user) {
      logger.warn('Authentication failed: No user found for token');
      return res.status(401).json({
        success: false,
        error: {
          message: 'Invalid token',
          statusCode: 401
        }
      });
    }

    // Attach user context to request
    req.user = user;
    req.userId = user.id;
    req.userEmail = user.email;
    
    logger.debug(`User authenticated: ${user.id}`, {
      email: user.email,
      url: req.url
    });
    
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`, {
      stack: error.stack,
      url: req.url,
      method: req.method
    });
    return res.status(500).json({
      success: false,
      error: {
        message: 'Authentication service error',
        statusCode: 500
      }
    });
  }
};

// PUBLIC_INTERFACE
/**
 * Optional authentication middleware
 * Tries to authenticate but doesn't fail if no token is provided
 * Useful for endpoints that work for both authenticated and anonymous users
 * Usage: router.get('/public-or-private', optionalAuth, handler)
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // No auth header is fine for optional auth
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    // Empty token is also fine
    if (!token || token.trim() === '') {
      return next();
    }

    const supabaseClient = getSupabaseClient();
    const { data: { user }, error } = await supabaseClient.auth.getUser(token);

    if (!error && user) {
      req.user = user;
      req.userId = user.id;
      req.userEmail = user.email;
      logger.debug(`User optionally authenticated: ${user.id}`);
    } else if (error) {
      logger.debug(`Optional auth failed: ${error.message}`);
    }
    
    next();
  } catch (error) {
    logger.error(`Optional auth error: ${error.message}`);
    // Don't fail the request, just continue without auth
    next();
  }
};

// PUBLIC_INTERFACE
/**
 * Helper function to check if request is authenticated
 * Usage: if (isAuthenticated(req)) { ... }
 */
export const isAuthenticated = (req) => {
  return !!(req.user && req.userId);
};

// PUBLIC_INTERFACE
/**
 * Helper function to get current user ID from request
 * Returns null if not authenticated
 * Usage: const userId = getCurrentUserId(req);
 */
export const getCurrentUserId = (req) => {
  return req.userId || null;
};

// PUBLIC_INTERFACE
/**
 * Helper function to get current user from request
 * Returns null if not authenticated
 * Usage: const user = getCurrentUser(req);
 */
export const getCurrentUser = (req) => {
  return req.user || null;
};

// PUBLIC_INTERFACE
/**
 * Middleware to require authentication and verify user owns a resource
 * Usage: router.get('/resource/:userId', requireOwnership('userId'), handler)
 */
export const requireOwnership = (userIdParamName = 'userId') => {
  return (req, res, next) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Authentication required',
          statusCode: 401
        }
      });
    }

    const resourceUserId = req.params[userIdParamName];
    if (!resourceUserId) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Parameter '${userIdParamName}' is required`,
          statusCode: 400
        }
      });
    }

    if (req.userId !== resourceUserId) {
      logger.warn(`Ownership check failed: ${req.userId} tried to access resource owned by ${resourceUserId}`);
      return res.status(403).json({
        success: false,
        error: {
          message: 'You do not have permission to access this resource',
          statusCode: 403
        }
      });
    }

    next();
  };
};

// Export Supabase client getter for use in other modules if needed
export { getSupabaseClient };
