import express from 'express';
import { getSupabaseClient } from '../utils/supabase.js';
import logger from '../utils/logger.js';

const router = express.Router();

// PUBLIC_INTERFACE
/**
 * Health check endpoint with dependency checks
 * GET /healthz
 * Returns the health status of the backend service including Supabase connectivity
 * @returns {200} Service is healthy
 * @returns {503} Service is unhealthy
 */
router.get('/healthz', async (req, res) => {
  const startTime = Date.now();
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    checks: {}
  };

  let allHealthy = true;

  // Check Supabase connectivity
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is OK
      throw error;
    }

    healthStatus.checks.supabase = {
      status: 'ok',
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    allHealthy = false;
    healthStatus.checks.supabase = {
      status: 'error',
      error: error.message,
      responseTime: Date.now() - startTime
    };
    logger.error('Supabase health check failed:', error);
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  healthStatus.checks.memory = {
    status: 'ok',
    heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
    rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
  };

  // Set overall status
  healthStatus.status = allHealthy ? 'ok' : 'degraded';
  
  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json(healthStatus);
});

// PUBLIC_INTERFACE
/**
 * Simple liveness probe
 * GET /health
 * Returns basic service status without checking dependencies
 * @returns {200} Service is alive
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;
