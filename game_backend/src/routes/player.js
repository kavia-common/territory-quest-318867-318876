import express from 'express';
import Joi from 'joi';
import { authenticate } from '../middleware/auth.js';
import { callRPC } from '../utils/supabase.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Validation utility
const validate = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true
    };
    
    const toValidate = {};
    if (schema.body) toValidate.body = req.body;
    if (schema.query) toValidate.query = req.query;
    if (schema.params) toValidate.params = req.params;
    
    const schemaToValidate = Joi.object(schema);
    const { error, value } = schemaToValidate.validate(toValidate, validationOptions);
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          statusCode: 400,
          errors
        }
      });
    }
    
    if (value.body) req.body = value.body;
    if (value.query) req.query = value.query;
    if (value.params) req.params = value.params;
    
    next();
  };
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

    // Handle array response from RPC
    const playerStats = Array.isArray(stats) ? stats[0] : stats;

    res.json({
      success: true,
      data: playerStats
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
  validate({
    body: Joi.object({
      lat: Joi.number().min(-90).max(90).required(),
      lon: Joi.number().min(-180).max(180).required()
    })
  }),
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
 * Query params: limit (optional)
 * Requires authentication
 */
router.get('/activity',
  authenticate,
  validate({
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(200).default(50)
    })
  }),
  async (req, res, next) => {
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
  }
);

export default router;
