import express from 'express';
import zonesRoutes from './zones.js';
import playerRoutes from './player.js';
import missionsRoutes from './missions.js';
import notificationsRoutes from './notifications.js';
import leaderboardRoutes from './leaderboard.js';
import { getConnectionStats } from '../websocket/index.js';

const router = express.Router();

// API Documentation
router.get('/', (req, res) => {
  res.json({
    name: 'TurfRun Game Backend API',
    version: '1.0.0',
    description: 'Backend API for territory capture game',
    endpoints: {
      zones: '/api/zones',
      player: '/api/player',
      missions: '/api/missions',
      notifications: '/api/notifications',
      leaderboard: '/api/leaderboard',
      websocket_stats: '/api/ws/stats'
    },
    websocket: {
      url: '/ws',
      documentation: 'See docs/WEBSOCKET.md'
    },
    documentation: '/api/docs'
  });
});

// PUBLIC_INTERFACE
/**
 * GET /api/ws/stats
 * Get WebSocket connection statistics
 * Returns current connection counts and metrics
 */
router.get('/ws/stats', (req, res) => {
  try {
    const stats = getConnectionStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve WebSocket statistics',
        statusCode: 500
      }
    });
  }
});

// Mount route modules
router.use('/zones', zonesRoutes);
router.use('/player', playerRoutes);
router.use('/missions', missionsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/leaderboard', leaderboardRoutes);

export default router;
