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
 * GET /api/leaderboard
 * Get top players leaderboard
 * Query params: limit (optional, default 100)
 */
router.get('/',
  validate({
    query: Joi.object({
      limit: Joi.number().integer().min(1).max(1000).default(100)
    })
  }),
  async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit) || 100;

      const leaderboard = await callRPC('get_leaderboard', {
        limit_count: limit
      });

      res.json({
        success: true,
        data: leaderboard
      });
    } catch (error) {
      logger.error('Error fetching leaderboard:', error);
      next(error);
    }
  }
);

export default router;
