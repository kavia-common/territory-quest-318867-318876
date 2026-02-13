import express from 'express';
import Joi from 'joi';
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
 * POST /api/utils/distance
 * Calculate distance between two points in meters
 * Body: { lat1, lon1, lat2, lon2 }
 * Returns: { distance_meters: number }
 */
router.post('/distance',
  validate({
    body: Joi.object({
      lat1: Joi.number().min(-90).max(90).required(),
      lon1: Joi.number().min(-180).max(180).required(),
      lat2: Joi.number().min(-90).max(90).required(),
      lon2: Joi.number().min(-180).max(180).required()
    })
  }),
  async (req, res, next) => {
    try {
      const { lat1, lon1, lat2, lon2 } = req.body;
      
      const distance = await callRPC('calculate_distance_meters', {
        lat1: parseFloat(lat1),
        lon1: parseFloat(lon1),
        lat2: parseFloat(lat2),
        lon2: parseFloat(lon2)
      });

      res.json({
        success: true,
        data: {
          distance_meters: distance
        }
      });
    } catch (error) {
      logger.error('Error calculating distance:', error);
      next(error);
    }
  }
);

export default router;
