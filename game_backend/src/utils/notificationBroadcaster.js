import { sendToUser, broadcastMessage } from '../websocket/index.js';
import logger from './logger.js';

// PUBLIC_INTERFACE
/**
 * Broadcast a notification to a specific user via WebSocket
 * This should be called whenever a notification is created in the database
 * to ensure real-time delivery to connected clients
 * 
 * @param {string} userId - User ID to send notification to
 * @param {object} notification - Notification object from database
 */
export const broadcastNotification = (userId, notification) => {
  try {
    const sent = sendToUser(userId, {
      type: 'notification',
      data: notification
    });

    if (sent > 0) {
      logger.info(`Broadcasted notification to user ${userId} (${sent} connections)`);
    } else {
      logger.debug(`User ${userId} has no active WebSocket connections`);
    }
  } catch (error) {
    logger.error('Error broadcasting notification:', error);
  }
};

// PUBLIC_INTERFACE
/**
 * Broadcast a zone update to the zone owner via WebSocket
 * Called when a zone's status or defense score changes
 * 
 * @param {string} userId - Zone owner's user ID
 * @param {object} zone - Updated zone object from database
 */
export const broadcastZoneUpdate = (userId, zone) => {
  try {
    const sent = sendToUser(userId, {
      type: 'zone_update',
      data: zone
    });

    if (sent > 0) {
      logger.info(`Broadcasted zone update to user ${userId} (${sent} connections)`);
    }
  } catch (error) {
    logger.error('Error broadcasting zone update:', error);
  }
};

// PUBLIC_INTERFACE
/**
 * Broadcast a system message to all connected users
 * Used for server-wide announcements, maintenance notices, etc.
 * 
 * @param {string} message - Message to broadcast
 * @param {string} type - Message type (default: 'system_message')
 * @param {object} data - Additional data to include
 */
export const broadcastSystemMessage = (message, type = 'system_message', data = {}) => {
  try {
    const sent = broadcastMessage({
      type,
      message,
      data
    });

    logger.info(`Broadcasted system message to ${sent} users`);
  } catch (error) {
    logger.error('Error broadcasting system message:', error);
  }
};

// PUBLIC_INTERFACE
/**
 * Notify user of a battle event (attack/defend result)
 * 
 * @param {string} userId - User ID to notify
 * @param {string} eventType - 'battle_won' | 'battle_lost' | 'zone_captured'
 * @param {object} data - Battle event data
 */
export const broadcastBattleEvent = (userId, eventType, data) => {
  try {
    const sent = sendToUser(userId, {
      type: 'battle_event',
      eventType,
      data
    });

    if (sent > 0) {
      logger.info(`Broadcasted ${eventType} to user ${userId}`);
    }
  } catch (error) {
    logger.error('Error broadcasting battle event:', error);
  }
};

// PUBLIC_INTERFACE
/**
 * Notify user of mission progress or completion
 * 
 * @param {string} userId - User ID to notify
 * @param {object} mission - Mission object with progress
 */
export const broadcastMissionUpdate = (userId, mission) => {
  try {
    const sent = sendToUser(userId, {
      type: 'mission_update',
      data: mission
    });

    if (sent > 0) {
      logger.info(`Broadcasted mission update to user ${userId}`);
    }
  } catch (error) {
    logger.error('Error broadcasting mission update:', error);
  }
};

// PUBLIC_INTERFACE
/**
 * Notify user of level up
 * 
 * @param {string} userId - User ID to notify
 * @param {number} newLevel - New respect level
 * @param {number} oldLevel - Previous respect level
 */
export const broadcastLevelUp = (userId, newLevel, oldLevel) => {
  try {
    const sent = sendToUser(userId, {
      type: 'level_up',
      data: {
        new_level: newLevel,
        old_level: oldLevel
      }
    });

    if (sent > 0) {
      logger.info(`Broadcasted level up to user ${userId} (${oldLevel} → ${newLevel})`);
    }
  } catch (error) {
    logger.error('Error broadcasting level up:', error);
  }
};

export default {
  broadcastNotification,
  broadcastZoneUpdate,
  broadcastSystemMessage,
  broadcastBattleEvent,
  broadcastMissionUpdate,
  broadcastLevelUp
};
