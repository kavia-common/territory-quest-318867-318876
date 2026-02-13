import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';
import { callRPC } from '../utils/supabase.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Validation helper
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        statusCode: 400,
        errors: errors.array()
      }
    });
  }
  next();
};

// PUBLIC_INTERFACE
/**
 * GET /api/player/stats
 * Get current player statistics
 * Requires authentication
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    
    const stats = await callRPC('get_player_stats', { user_id: userId });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching player stats:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * POST /api/player/location
 * Update player's current location
 * Body: { lat, lon }
 * Requires authentication
 */
router.post('/location',
  authenticate,
  [
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('lon').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { lat, lon } = req.body;
      const userId = req.userId;

      const updated = await callRPC('update_user_location', {
        p_user_id: userId,
        p_lat: parseFloat(lat),
        p_lon: parseFloat(lon)
      });

      res.json({
        success: true,
        data: { updated }
      });
    } catch (error) {
      logger.error('Error updating location:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * GET /api/player/activity
 * Get player's activity log
 * Requires authentication
 */
router.get('/activity', authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;

    const activities = await callRPC('get_user_activity_log', {
      p_user_id: userId,
      limit_count: limit
    });

    res.json({
      success: true,
      data: activities
    });
  } catch (error) {
    logger.error('Error fetching activity log:', error);
    next(error);
  }
});

export default router;
