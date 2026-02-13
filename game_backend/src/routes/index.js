import express from 'express';
import zonesRoutes from './zones.js';
import playerRoutes from './player.js';
import missionsRoutes from './missions.js';
import notificationsRoutes from './notifications.js';
import leaderboardRoutes from './leaderboard.js';

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
      leaderboard: '/api/leaderboard'
    },
    documentation: '/api/docs'
  });
});

// Mount route modules
router.use('/zones', zonesRoutes);
router.use('/player', playerRoutes);
router.use('/missions', missionsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/leaderboard', leaderboardRoutes);

export default router;
