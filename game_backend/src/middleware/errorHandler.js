import logger from '../utils/logger.js';

// Error code constants
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  TIMEOUT: 'TIMEOUT'
};

// PUBLIC_INTERFACE
/**
 * Global error handler middleware
 * Catches all errors and returns a standardized error response with error codes
 * Must be the last middleware in the chain
 */
export const errorHandler = (err, req, res, next) => {
  // Log the error with structured data
  const errorLog = {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    statusCode: err.statusCode || err.status || 500,
    userId: req.userId || 'anonymous',
    ip: req.ip
  };

  // Only log body/query/params for non-sensitive endpoints
  if (!req.url.includes('/auth/')) {
    errorLog.body = req.body;
    errorLog.query = req.query;
    errorLog.params = req.params;
  }

  logger.error('Error handler caught error:', errorLog);

  // Default error response
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';
  let errorCode = ERROR_CODES.INTERNAL_ERROR;
  let details = null;

  // Handle specific error types
  if (err.name === 'ValidationError' || err.code === 'VALIDATION_ERROR') {
    statusCode = 400;
    errorCode = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
    details = err.details || null;
  } else if (err.name === 'UnauthorizedError' || err.name === 'AuthenticationError' || err.code === 'AUTHENTICATION_ERROR') {
    statusCode = 401;
    errorCode = ERROR_CODES.AUTHENTICATION_ERROR;
    message = err.message || 'Authentication required';
  } else if (err.name === 'ForbiddenError' || err.code === 'AUTHORIZATION_ERROR') {
    statusCode = 403;
    errorCode = ERROR_CODES.AUTHORIZATION_ERROR;
    message = err.message || 'Access forbidden';
  } else if (err.name === 'NotFoundError' || err.code === 'NOT_FOUND') {
    statusCode = 404;
    errorCode = ERROR_CODES.NOT_FOUND;
    message = err.message || 'Resource not found';
  } else if (err.name === 'ConflictError' || err.code === 'CONFLICT') {
    statusCode = 409;
    errorCode = ERROR_CODES.CONFLICT;
    message = err.message || 'Resource conflict';
  } else if (err.code === 'RATE_LIMIT_EXCEEDED') {
    statusCode = 429;
    errorCode = ERROR_CODES.RATE_LIMIT_EXCEEDED;
    message = 'Too many requests';
  } else if (err.code === 'ETIMEDOUT' || err.code === 'TIMEOUT') {
    statusCode = 408;
    errorCode = ERROR_CODES.TIMEOUT;
    message = 'Request timeout';
  } else if (err.code?.startsWith('PGRST') || err.code?.startsWith('42')) {
    // PostgreSQL/PostgREST errors
    statusCode = 500;
    errorCode = ERROR_CODES.DATABASE_ERROR;
    message = 'Database error';
  } else if (statusCode === 400) {
    errorCode = ERROR_CODES.BAD_REQUEST;
  }

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error occurred';
  }

  // Build error response
  const errorResponse = {
    success: false,
    error: {
      message,
      statusCode,
      code: errorCode,
      timestamp: new Date().toISOString(),
      path: req.url
    }
  };

  // Add details if available
  if (details) {
    errorResponse.error.details = details;
  }

  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = err.stack;
  }

  // Add request ID if available (from request logger)
  if (req.id) {
    errorResponse.error.requestId = req.id;
  }

  res.status(statusCode).json(errorResponse);
};

export default errorHandler;
