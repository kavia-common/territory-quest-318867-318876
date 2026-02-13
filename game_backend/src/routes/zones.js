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
 * GET /api/zones/bounds
 * Get zones within viewport bounds
 * Query params: min_lat, min_lon, max_lat, max_lon
 */
router.get('/bounds',
  validate({
    query: Joi.object({
      min_lat: Joi.number().min(-90).max(90).required(),
      min_lon: Joi.number().min(-180).max(180).required(),
      max_lat: Joi.number().min(-90).max(90).required(),
      max_lon: Joi.number().min(-180).max(180).required()
    })
  }),
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
  validate({
    query: Joi.object({
      lat: Joi.number().min(-90).max(90).required(),
      lon: Joi.number().min(-180).max(180).required(),
      radius_meters: Joi.number().min(1).max(10000).required()
    })
  }),
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
  validate({
    params: Joi.object({
      zoneId: Joi.string().pattern(/^-?\d+_-?\d+$/).required()
    }),
    body: Joi.object({
      attack_power: Joi.number().integer().min(1).max(50).default(10)
    })
  }),
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
  validate({
    params: Joi.object({
      zoneId: Joi.string().pattern(/^-?\d+_-?\d+$/).required()
    }),
    body: Joi.object({
      defense_boost: Joi.number().integer().min(1).max(30).default(10)
    })
  }),
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
  validate({
    params: Joi.object({
      zoneId: Joi.string().pattern(/^-?\d+_-?\d+$/).required()
    }),
    query: Joi.object({
      lat: Joi.number().min(-90).max(90).required(),
      lon: Joi.number().min(-180).max(180).required()
    })
  }),
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
