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
 * GET /api/notifications
 * Get user's notifications
 * Query params: include_read (boolean), limit (number)
 * Requires authentication
 */
router.get('/',
  authenticate,
  [
    query('include_read').optional().isBoolean().withMessage('include_read must be boolean'),
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limit must be between 1 and 200'),
    validate
  ],
  async (req, res, next) => {
    try {
      const userId = req.userId;
      const includeRead = req.query.include_read === 'true';
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
  authenticate,
  [
    param('notificationId').isUUID().withMessage('Invalid notification ID'),
    validate
  ],
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
router.patch('/read-all', authenticate, async (req, res, next) => {
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
