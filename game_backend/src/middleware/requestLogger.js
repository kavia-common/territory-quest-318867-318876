import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// PUBLIC_INTERFACE
/**
 * Request logger middleware
 * Logs all incoming HTTP requests with method, URL, IP, response time, and request ID
 * Adds request ID to both request and response for traceability
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Generate or use existing request ID
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  // Capture request details
  const userAgent = req.headers['user-agent'] || 'unknown';
  const referer = req.headers['referer'] || 'none';
  
  // Log incoming request
  logger.info(`[${requestId}] --> ${req.method} ${req.url} - IP: ${req.ip} - UA: ${userAgent}`);

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent,
      referer,
      contentLength: res.getHeader('content-length') || 0
    };
    
    const logMessage = `[${requestId}] <-- ${req.method} ${req.url} - Status: ${res.statusCode} - ${duration}ms - IP: ${req.ip}`;
    
    if (res.statusCode >= 500) {
      logger.error(logMessage, logData);
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage, logData);
    } else {
      logger.info(logMessage, logData);
    }
  });

  // Log errors
  res.on('error', (error) => {
    logger.error(`[${requestId}] Response error:`, {
      requestId,
      method: req.method,
      url: req.url,
      error: error.message,
      stack: error.stack
    });
  });

  next();
};
