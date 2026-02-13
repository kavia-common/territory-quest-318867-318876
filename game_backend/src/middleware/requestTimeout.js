import logger from '../utils/logger.js';

// PUBLIC_INTERFACE
/**
 * Request timeout middleware
 * Automatically terminates requests that exceed the specified timeout duration
 * @param {number} timeoutMs - Timeout duration in milliseconds (default: 30000ms = 30s)
 * @returns {Function} Express middleware function
 */
export const requestTimeout = (timeoutMs = 30000) => {
  return (req, res, next) => {
    const requestId = req.id || 'unknown';
    
    // Set timeout for the request
    req.setTimeout(timeoutMs, () => {
      logger.warn(`[${requestId}] Request timeout after ${timeoutMs}ms - ${req.method} ${req.url}`);
      
      if (!res.headersSent) {
        res.status(408).json({
          error: 'Request Timeout',
          message: 'The request took too long to process',
          requestId
        });
      }
    });

    // Set timeout for the response
    res.setTimeout(timeoutMs, () => {
      logger.warn(`[${requestId}] Response timeout after ${timeoutMs}ms - ${req.method} ${req.url}`);
      
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: 'The server took too long to respond',
          requestId
        });
      }
    });

    next();
  };
};
