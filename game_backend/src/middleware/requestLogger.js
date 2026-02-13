import logger from '../utils/logger.js';

// PUBLIC_INTERFACE
/**
 * Request logger middleware
 * Logs all incoming HTTP requests with method, URL, IP, and response time
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logMessage = `${req.method} ${req.url} - Status: ${res.statusCode} - ${duration}ms - IP: ${req.ip}`;
    
    if (res.statusCode >= 500) {
      logger.error(logMessage);
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      logger.info(logMessage);
    }
  });

  next();
};
