import logger from '../utils/logger.js';
import { errorResponse } from '../utils/validation.js';

// PUBLIC_INTERFACE
/**
 * Global error handler middleware
 * Catches all errors and returns consistent error responses
 */
export const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error(`Error: ${err.message}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    stack: err.stack,
    ...(err.code && { code: err.code }),
    ...(err.hint && { hint: err.hint })
  });

  // Default error status and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = err.errors;
  } else if (err.name === 'UnauthorizedError' || err.code === 'PGRST301') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError' || err.code === '404') {
    statusCode = 404;
    message = 'Not Found';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body';
  } else if (err.code === 'PGRST116') {
    // Supabase RPC function not found
    statusCode = 500;
    message = 'Database function not found';
  } else if (err.code?.startsWith('PGRST')) {
    // Other Supabase errors
    statusCode = 500;
    message = 'Database operation failed';
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal Server Error';
    errors = null;
  }

  // Send error response using standard format
  res.status(statusCode).json(errorResponse(message, statusCode, errors));
};
