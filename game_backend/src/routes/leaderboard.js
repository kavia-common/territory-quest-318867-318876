import express from 'express';
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
 * GET /api/leaderboard
 * Get top players leaderboard
 * Query params: limit (optional, default 100)
 */
router.get('/',
  [
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('Limit must be between 1 and 1000'),
    validate
  ],
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
