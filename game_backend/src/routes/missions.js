import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { query, validationResult } from 'express-validator';
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
 * GET /api/missions
 * Get user's missions
 * Query params: status (optional)
 * Requires authentication
 */
router.get('/',
  authenticate,
  [
    query('status').optional().isIn(['active', 'completed', 'expired']).withMessage('Invalid status'),
    validate
  ],
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
router.post('/initialize', authenticate, async (req, res, next) => {
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
