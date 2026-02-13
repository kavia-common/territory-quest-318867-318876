import express from 'express';
import Joi from 'joi';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { getSupabaseClient, callRPC } from '../utils/supabase.js';
import { validate, successResponse, errorResponse } from '../utils/validation.js';
import { authLimiter, writeLimiter, readLimiter } from '../middleware/rateLimiting.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const signupSchema = {
  body: Joi.object({
    username: Joi.string().min(3).max(30).pattern(/^[a-zA-Z0-9_]+$/).required().messages({
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username must not exceed 30 characters',
      'string.pattern.base': 'Username can only contain letters, numbers, and underscores',
      'any.required': 'Username is required'
    }),
    color_hex: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).default('#3b82f6').messages({
      'string.pattern.base': 'Color must be a valid hex color (e.g., #3b82f6)'
    })
  })
};

const updateProfileSchema = {
  body: Joi.object({
    username: Joi.string().min(3).max(30).pattern(/^[a-zA-Z0-9_]+$/).messages({
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username must not exceed 30 characters',
      'string.pattern.base': 'Username can only contain letters, numbers, and underscores'
    }),
    color_hex: Joi.string().pattern(/^#[0-9A-Fa-f]{6}$/).messages({
      'string.pattern.base': 'Color must be a valid hex color (e.g., #3b82f6)'
    })
  }).min(1)
};

// ============================================
// AUTH ENDPOINTS
// ============================================

// PUBLIC_INTERFACE
/**
 * POST /api/auth/signup
 * Complete user signup/onboarding after Supabase Auth signup
 * Creates user profile in database and initial missions
 * 
 * @body {string} username - Desired username (3-30 chars, alphanumeric + underscore)
 * @body {string} [color_hex] - User's territory color (default: #3b82f6)
 * @returns {object} User profile and initial missions
 */
router.post('/signup', authLimiter, authenticate, validate(signupSchema), async (req, res, next) => {
  try {
    const { username, color_hex = '#3b82f6' } = req.body;
    const userId = req.userId;

    logger.info(`User signup initiated: ${userId}`, { username });

    const supabase = getSupabaseClient();

    // Check if user profile already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', userId)
      .single();

    if (existingUser) {
      logger.warn(`User already has profile: ${userId}`);
      return res.status(409).json(errorResponse('User profile already exists', 409));
    }

    // Check if username is taken
    const { data: usernameCheck } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (usernameCheck) {
      logger.warn(`Username already taken: ${username}`);
      return res.status(409).json(errorResponse('Username is already taken', 409));
    }

    // Create user profile
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: userId,
        username,
        color_hex,
        total_ep: 0,
        respect_level: 1
      })
      .select()
      .single();

    if (insertError) {
      logger.error('Failed to create user profile:', insertError);
      return res.status(500).json(errorResponse('Failed to create user profile', 500));
    }

    // Create initial missions
    try {
      await callRPC('create_initial_missions', { p_user_id: userId });
    } catch (missionError) {
      logger.warn('Failed to create initial missions:', missionError);
      // Don't fail the signup, missions can be created later
    }

    // Get initial missions
    const missions = await callRPC('get_user_missions', { 
      p_user_id: userId, 
      p_status: 'active' 
    });

    logger.info(`User signup completed: ${userId}`, { username });

    res.status(201).json(successResponse({
      user: newUser,
      missions: missions || [],
      message: 'Welcome to TurfRun! Your profile has been created.'
    }));
  } catch (error) {
    logger.error('Signup error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * GET /api/auth/me
 * Get current authenticated user's profile and statistics
 * 
 * @returns {object} User profile with stats, missions, and notifications count
 */
router.get('/me', readLimiter, authenticate, async (req, res, next) => {
  try {
    const userId = req.userId;

    // Get user profile and stats using RPC
    const stats = await callRPC('get_player_stats', { user_id: userId });

    if (!stats || stats.length === 0) {
      logger.warn(`User profile not found: ${userId}`);
      return res.status(404).json(errorResponse('User profile not found. Please complete onboarding.', 404));
    }

    const userStats = stats[0];

    // Get user location data
    const supabase = getSupabaseClient();
    const { data: locationData } = await supabase
      .from('users')
      .select('last_seen_lat, last_seen_lon, last_seen_at')
      .eq('id', userId)
      .single();

    res.json(successResponse({
      id: userId,
      email: req.userEmail,
      username: userStats.username,
      color_hex: userStats.color_hex,
      total_ep: userStats.total_ep,
      respect_level: userStats.respect_level,
      zones_owned: userStats.zones_owned,
      zones_under_attack: userStats.zones_under_attack,
      active_missions: userStats.active_missions,
      unread_notifications: userStats.unread_notifications,
      last_seen_lat: locationData?.last_seen_lat,
      last_seen_lon: locationData?.last_seen_lon,
      last_seen_at: locationData?.last_seen_at
    }));
  } catch (error) {
    logger.error('Get current user error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * PUT /api/auth/profile
 * Update current user's profile
 * 
 * @body {string} [username] - New username
 * @body {string} [color_hex] - New territory color
 * @returns {object} Updated user profile
 */
router.put('/profile', writeLimiter, authenticate, validate(updateProfileSchema), async (req, res, next) => {
  try {
    const userId = req.userId;
    const updates = {};

    if (req.body.username) {
      updates.username = req.body.username;
    }

    if (req.body.color_hex) {
      updates.color_hex = req.body.color_hex;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json(errorResponse('No valid fields to update', 400));
    }

    const supabase = getSupabaseClient();

    // If updating username, check if it's taken
    if (updates.username) {
      const { data: usernameCheck } = await supabase
        .from('users')
        .select('id')
        .eq('username', updates.username)
        .neq('id', userId)
        .single();

      if (usernameCheck) {
        return res.status(409).json(errorResponse('Username is already taken', 409));
      }
    }

    // Update profile
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update profile:', updateError);
      return res.status(500).json(errorResponse('Failed to update profile', 500));
    }

    logger.info(`Profile updated for user: ${userId}`, updates);

    res.json(successResponse(updatedUser, 'Profile updated successfully'));
  } catch (error) {
    logger.error('Update profile error:', error);
    next(error);
  }
});

// PUBLIC_INTERFACE
/**
 * GET /api/auth/check-username/:username
 * Check if a username is available
 * 
 * @param {string} username - Username to check
 * @returns {object} Availability status
 */
router.get('/check-username/:username', readLimiter, optionalAuth, async (req, res, next) => {
  try {
    const { username } = req.params;

    if (!username || username.length < 3 || username.length > 30) {
      return res.status(400).json(errorResponse('Invalid username format', 400));
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json(errorResponse('Username can only contain letters, numbers, and underscores', 400));
    }

    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    const available = !data;

    res.json(successResponse({
      username,
      available,
      message: available ? 'Username is available' : 'Username is already taken'
    }));
  } catch (error) {
    logger.error('Check username error:', error);
    next(error);
  }
});

export default router;
