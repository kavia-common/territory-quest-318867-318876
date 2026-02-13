import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { body, query, param, validationResult } from 'express-validator';
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
 * GET /api/zones/bounds
 * Get zones within viewport bounds
 * Query params: min_lat, min_lon, max_lat, max_lon
 */
router.get('/bounds',
  [
    query('min_lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid min_lat'),
    query('min_lon').isFloat({ min: -180, max: 180 }).withMessage('Invalid min_lon'),
    query('max_lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid max_lat'),
    query('max_lon').isFloat({ min: -180, max: 180 }).withMessage('Invalid max_lon'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { min_lat, min_lon, max_lat, max_lon } = req.query;
      
      const zones = await callRPC('get_zones_in_bounds', {
        min_lat: parseFloat(min_lat),
        min_lon: parseFloat(min_lon),
        max_lat: parseFloat(max_lat),
        max_lon: parseFloat(max_lon)
      });

      res.json({
        success: true,
        data: zones
      });
    } catch (error) {
      logger.error('Error fetching zones in bounds:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * GET /api/zones/nearby
 * Get zones within radius from a point
 * Query params: lat, lon, radius_meters
 */
router.get('/nearby',
  [
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    query('lon').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    query('radius_meters').isFloat({ min: 1, max: 10000 }).withMessage('Radius must be between 1 and 10000 meters'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { lat, lon, radius_meters } = req.query;
      
      const zones = await callRPC('get_zones_within_radius', {
        center_lat: parseFloat(lat),
        center_lon: parseFloat(lon),
        radius_meters: parseFloat(radius_meters)
      });

      res.json({
        success: true,
        data: zones
      });
    } catch (error) {
      logger.error('Error fetching nearby zones:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * POST /api/zones/capture
 * Capture a zone at given coordinates
 * Body: { lat, lon }
 * Requires authentication
 */
router.post('/capture',
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

      const result = await callRPC('capture_zone', {
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        user_id: userId
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error capturing zone:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * POST /api/zones/:zoneId/attack
 * Attack an enemy zone
 * Body: { attack_power }
 * Requires authentication
 */
router.post('/:zoneId/attack',
  authenticate,
  [
    param('zoneId').notEmpty().withMessage('Zone ID is required'),
    body('attack_power').optional().isInt({ min: 1, max: 50 }).withMessage('Attack power must be between 1 and 50'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { zoneId } = req.params;
      const { attack_power = 10 } = req.body;
      const userId = req.userId;

      const result = await callRPC('attack_zone', {
        zone_id: zoneId,
        attacker_id: userId,
        attack_power: parseInt(attack_power)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error attacking zone:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * POST /api/zones/:zoneId/defend
 * Defend your own zone
 * Body: { defense_boost }
 * Requires authentication
 */
router.post('/:zoneId/defend',
  authenticate,
  [
    param('zoneId').notEmpty().withMessage('Zone ID is required'),
    body('defense_boost').optional().isInt({ min: 1, max: 30 }).withMessage('Defense boost must be between 1 and 30'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { zoneId } = req.params;
      const { defense_boost = 10 } = req.body;
      const userId = req.userId;

      const result = await callRPC('defend_zone', {
        zone_id: zoneId,
        defender_id: userId,
        defense_boost: parseInt(defense_boost)
      });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error defending zone:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * GET /api/zones/:zoneId/attack-range
 * Check if user is in attack range of a zone
 * Query params: lat, lon
 */
router.get('/:zoneId/attack-range',
  [
    param('zoneId').notEmpty().withMessage('Zone ID is required'),
    query('lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    query('lon').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
    validate
  ],
  async (req, res, next) => {
    try {
      const { zoneId } = req.params;
      const { lat, lon } = req.query;

      const inRange = await callRPC('is_in_attack_range', {
        zone_id: zoneId,
        user_lat: parseFloat(lat),
        user_lon: parseFloat(lon)
      });

      res.json({
        success: true,
        data: { in_range: inRange }
      });
    } catch (error) {
      logger.error('Error checking attack range:', error);
      next(error);
    }
  }
);

export default router;
