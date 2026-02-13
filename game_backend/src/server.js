import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requestTimeout } from './middleware/requestTimeout.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import logger from './utils/logger.js';
import routes from './routes/index.js';
import healthRoutes from './routes/health.js';
import { initializeWebSocket } from './websocket/index.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Environment configuration
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

// Trust proxy (for rate limiting behind reverse proxy)
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1 || ALLOWED_ORIGINS.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: process.env.ALLOWED_METHODS?.split(',') || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: process.env.ALLOWED_HEADERS?.split(',') || ['Content-Type', 'Authorization'],
  maxAge: parseInt(process.env.CORS_MAX_AGE || '3600')
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_S || '60') * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Request timeout (configurable via environment variable, default 30s)
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000');
app.use(requestTimeout(REQUEST_TIMEOUT_MS));

// ============================================
// HEALTH CHECK ENDPOINTS
// ============================================

app.use('/', healthRoutes);

// ============================================
// API ROUTES
// ============================================

app.use('/api', routes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ============================================
// WEBSOCKET SETUP
// ============================================

const wss = new WebSocketServer({ 
  server: httpServer,
  path: '/ws'
});

initializeWebSocket(wss);

// ============================================
// SERVER STARTUP
// ============================================

httpServer.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  logger.info(`🚀 TurfRun Backend Server started`);
  logger.info(`📡 Environment: ${NODE_ENV}`);
  logger.info(`🌐 HTTP Server: http://${process.env.HOST || '0.0.0.0'}:${PORT}`);
  logger.info(`🔌 WebSocket Server: ws://${process.env.HOST || '0.0.0.0'}:${PORT}/ws`);
  logger.info(`✅ Health check: http://${process.env.HOST || '0.0.0.0'}:${PORT}/health`);
  logger.info(`🏥 Readiness check: http://${process.env.HOST || '0.0.0.0'}:${PORT}/healthz`);
});

// ============================================
// GRACEFUL SHUTDOWN HANDLING
// ============================================

let isShuttingDown = false;

/**
 * Graceful shutdown handler
 * Closes HTTP server and WebSocket connections cleanly
 */
const gracefulShutdown = (signal) => {
  if (isShuttingDown) {
    logger.warn(`${signal} received again during shutdown, forcing exit...`);
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`${signal} signal received: starting graceful shutdown`);

  // Stop accepting new connections
  httpServer.close((err) => {
    if (err) {
      logger.error('Error closing HTTP server:', err);
      process.exit(1);
    }
    logger.info('HTTP server closed');
  });

  // Close all WebSocket connections
  logger.info('Closing WebSocket connections...');
  wss.clients.forEach((client) => {
    client.close(1000, 'Server shutting down');
  });

  // Close WebSocket server
  wss.close(() => {
    logger.info('WebSocket server closed');
  });

  // Set a timeout to force shutdown if graceful shutdown takes too long
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 10000); // 10 second timeout

  // Wait for all connections to close
  const checkConnections = setInterval(() => {
    if (wss.clients.size === 0) {
      clearInterval(checkConnections);
      clearTimeout(shutdownTimeout);
      logger.info('All connections closed, exiting');
      process.exit(0);
    } else {
      logger.info(`Waiting for ${wss.clients.size} WebSocket connections to close...`);
    }
  }, 1000);
};

// Handle SIGTERM (e.g., from Docker, Kubernetes)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle SIGINT (e.g., Ctrl+C)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to trigger graceful shutdown here
  if (process.env.NODE_ENV === 'production') {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Always exit on uncaught exceptions after logging
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});
