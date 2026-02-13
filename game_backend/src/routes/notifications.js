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
 * GET /api/notifications
 * Get user's notifications
 * Query params: include_read (boolean), limit (number)
 * Requires authentication
 */
router.get('/',
  readLimiter,
  authenticate,
  validate({
    query: Joi.object({
      include_read: Joi.boolean().default(false),
      limit: Joi.number().integer().min(1).max(200).default(50)
    })
  }),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const includeRead = req.query.include_read === true || req.query.include_read === 'true';
      const limit = parseInt(req.query.limit) || 50;

      const notifications = await callRPC('get_user_notifications', {
        p_user_id: userId,
        include_read: includeRead,
        limit_count: limit
      });

      res.json({
        success: true,
        data: notifications
      });
    } catch (error) {
      logger.error('Error fetching notifications:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * PATCH /api/notifications/:notificationId/read
 * Mark a notification as read
 * Requires authentication
 */
router.patch('/:notificationId/read',
  writeLimiter,
  authenticate,
  validate({
    params: Joi.object({
      notificationId: Joi.string().uuid().required()
    })
  }),
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const { notificationId } = req.params;

      const marked = await callRPC('mark_notification_read', {
        p_notification_id: notificationId,
        p_user_id: userId
      });

      res.json({
        success: true,
        data: { marked }
      });
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      next(error);
    }
  }
);

// PUBLIC_INTERFACE
/**
 * PATCH /api/notifications/read-all
 * Mark all notifications as read
 * Requires authentication
 */
router.patch('/read-all', writeLimiter, authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    const count = await callRPC('mark_all_notifications_read', {
      p_user_id: userId
    });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error('Error marking all notifications as read:', error);
    next(error);
  }
});

export default router;
