import express from 'express';
import Joi from 'joi';
import { authenticate } from '../middleware/auth.js';
import { callRPC } from '../utils/supabase.js';
import { readLimiter, writeLimiter } from '../middleware/rateLimiting.js';
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
 * GET /api/missions
 * Get user's missions
 * Query params: status (optional)
 * Requires authentication
 */
router.get('/',
  readLimiter,
  authenticate,
  validate({
    query: Joi.object({
      status: Joi.string().valid('active', 'completed', 'expired').optional()
    })
  }),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const status = req.query.status || null;

      const missions = await callRPC('get_user_missions', {
        p_user_id: userId,
        p_status: status
      });

      res.json({
        success: true,
        data: missions
      });
    } catch (error) {
      logger.error('Error fetching missions:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * POST /api/missions/initialize
 * Create initial missions for new user
 * Requires authentication
 */
router.post('/initialize', writeLimiter, authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    await callRPC('create_initial_missions', { p_user_id: userId });

    res.json({
      success: true,
      message: 'Initial missions created'
    });
  } catch (error) {
    logger.error('Error creating initial missions:', error);
    next(error);
  }
});

export default router;
