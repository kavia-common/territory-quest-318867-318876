import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

// Store active WebSocket connections by userId
const connections = new Map(); // connectionId -> { ws, userId, authenticated, lastPing }
const userConnections = new Map(); // userId -> Set of connectionIds

// Supabase client for realtime subscriptions
let supabaseClient = null;
let realtimeChannels = new Map(); // userId -> subscription

// Configuration
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds

/**
 * Initialize Supabase client for realtime
 */
const getSupabaseClient = () => {
  if (!supabaseClient) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      logger.error('Missing Supabase configuration for WebSocket');
      throw new Error('Missing Supabase configuration');
    }

    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      }
    );
  }
  return supabaseClient;
};

// PUBLIC_INTERFACE
/**
 * Initialize WebSocket server with authentication and realtime subscriptions
 * Handles real-time connections for game notifications and events
 * 
 * Features:
 * - JWT authentication via Supabase
 * - Heartbeat/ping-pong for connection health
 * - Supabase Realtime subscriptions for database events
 * - User-specific message routing
 * - Automatic reconnection handling
 * 
 * @param {WebSocketServer} wss - WebSocket server instance
 */
export const initializeWebSocket = (wss) => {
  logger.info('Initializing WebSocket server with authentication and realtime...');

  // Setup heartbeat interval
  const heartbeatInterval = setInterval(() => {
    checkConnections();
  }, HEARTBEAT_INTERVAL);

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    const connectionId = generateConnectionId();
    
    logger.info(`WebSocket connection attempt: ${connectionId} from ${clientIp}`);
    
    // Store connection (not authenticated yet)
    connections.set(connectionId, {
      ws,
      userId: null,
      authenticated: false,
      lastPing: Date.now(),
      connectedAt: Date.now()
    });

    // Setup ping-pong for this connection
    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) { // OPEN
        ws.ping();
      }
    }, HEARTBEAT_INTERVAL);

    // Handle pong responses
    ws.on('pong', () => {
      const connection = connections.get(connectionId);
      if (connection) {
        connection.lastPing = Date.now();
      }
    });

    // Handle messages from client
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        await handleMessage(connectionId, data);
      } catch (error) {
        logger.error(`Error parsing WebSocket message from ${connectionId}:`, error);
        sendToConnection(connectionId, {
          type: 'error',
          message: 'Invalid message format',
          timestamp: Date.now()
        });
      }
    });

    // Handle disconnection
    ws.on('close', (code, reason) => {
      logger.info(`WebSocket client disconnected: ${connectionId} (code: ${code})`);
      clearInterval(pingInterval);
      cleanupConnection(connectionId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for ${connectionId}:`, error);
      cleanupConnection(connectionId);
    });

    // Send welcome message with authentication requirement
    sendToConnection(connectionId, {
      type: 'connected',
      connectionId,
      message: 'Connected to TurfRun WebSocket server. Please authenticate.',
      timestamp: Date.now()
    });
  });

  // Cleanup on server shutdown
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    cleanupAllConnections();
    logger.info('WebSocket server closed');
  });

  logger.info('✅ WebSocket server initialized with authentication');
};

/**
 * Generate a unique connection ID
 */
const generateConnectionId = () => {
  return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

/**
 * Handle incoming messages from clients
 */
const handleMessage = async (connectionId, data) => {
  const connection = connections.get(connectionId);
  
  if (!connection) {
    logger.warn(`Message from unknown connection: ${connectionId}`);
    return;
  }

  logger.debug(`WebSocket message from ${connectionId}: ${data.type}`);

  switch (data.type) {
    case 'authenticate':
      await handleAuthentication(connectionId, data);
      break;

    case 'ping':
      connection.lastPing = Date.now();
      sendToConnection(connectionId, {
        type: 'pong',
        timestamp: Date.now()
      });
      break;

    case 'subscribe':
      await handleSubscription(connectionId, data);
      break;

    case 'unsubscribe':
      await handleUnsubscription(connectionId, data);
      break;

    default:
      if (!connection.authenticated) {
        sendToConnection(connectionId, {
          type: 'error',
          message: 'Authentication required',
          timestamp: Date.now()
        });
      } else {
        logger.warn(`Unknown message type from ${connectionId}: ${data.type}`);
        sendToConnection(connectionId, {
          type: 'error',
          message: `Unknown message type: ${data.type}`,
          timestamp: Date.now()
        });
      }
  }
};

/**
 * Handle authentication via JWT token
 */
const handleAuthentication = async (connectionId, data) => {
  const connection = connections.get(connectionId);
  
  if (!connection) {
    return;
  }

  try {
    const { token } = data;
    
    if (!token) {
      sendToConnection(connectionId, {
        type: 'auth_error',
        message: 'Token is required',
        timestamp: Date.now()
      });
      return;
    }

    // Verify token with Supabase
    const supabase = getSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn(`Authentication failed for ${connectionId}: ${error?.message || 'Invalid token'}`);
      sendToConnection(connectionId, {
        type: 'auth_error',
        message: 'Invalid or expired token',
        timestamp: Date.now()
      });
      return;
    }

    // Authentication successful
    connection.userId = user.id;
    connection.authenticated = true;
    connection.userEmail = user.email;

    // Track user connections
    if (!userConnections.has(user.id)) {
      userConnections.set(user.id, new Set());
    }
    userConnections.get(user.id).add(connectionId);

    logger.info(`User ${user.id} authenticated on connection ${connectionId}`);

    // Subscribe to user's notifications via Supabase Realtime
    await subscribeToUserNotifications(user.id);

    sendToConnection(connectionId, {
      type: 'authenticated',
      userId: user.id,
      message: 'Successfully authenticated',
      timestamp: Date.now()
    });

  } catch (error) {
    logger.error(`Authentication error for ${connectionId}:`, error);
    sendToConnection(connectionId, {
      type: 'auth_error',
      message: 'Authentication service error',
      timestamp: Date.now()
    });
  }
};

/**
 * Subscribe to user's notifications via Supabase Realtime
 */
const subscribeToUserNotifications = async (userId) => {
  // Don't create duplicate subscriptions
  if (realtimeChannels.has(userId)) {
    logger.debug(`Already subscribed to notifications for user ${userId}`);
    return;
  }

  try {
    const supabase = getSupabaseClient();
    
    // Subscribe to notifications table changes for this user
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          logger.info(`New notification for user ${userId}:`, payload.new);
          
          // Broadcast notification to all user's connections
          sendToUser(userId, {
            type: 'notification',
            data: payload.new,
            timestamp: Date.now()
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'zones',
          filter: `owner_id=eq.${userId}`
        },
        (payload) => {
          logger.info(`Zone update for user ${userId}:`, payload.new);
          
          // Notify user of zone status changes
          sendToUser(userId, {
            type: 'zone_update',
            data: payload.new,
            timestamp: Date.now()
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info(`✅ Subscribed to realtime updates for user ${userId}`);
        } else if (status === 'CHANNEL_ERROR') {
          logger.error(`Failed to subscribe to realtime for user ${userId}`);
        } else if (status === 'TIMED_OUT') {
          logger.error(`Subscription timeout for user ${userId}`);
        }
      });

    realtimeChannels.set(userId, channel);
  } catch (error) {
    logger.error(`Error subscribing to realtime for user ${userId}:`, error);
  }
};

/**
 * Unsubscribe from user's notifications
 */
const unsubscribeFromUserNotifications = async (userId) => {
  const channel = realtimeChannels.get(userId);
  
  if (channel) {
    try {
      const supabase = getSupabaseClient();
      await supabase.removeChannel(channel);
      realtimeChannels.delete(userId);
      logger.info(`Unsubscribed from realtime updates for user ${userId}`);
    } catch (error) {
      logger.error(`Error unsubscribing from realtime for user ${userId}:`, error);
    }
  }
};

/**
 * Handle custom subscription requests (for future extensibility)
 */
const handleSubscription = async (connectionId, data) => {
  const connection = connections.get(connectionId);
  
  if (!connection || !connection.authenticated) {
    sendToConnection(connectionId, {
      type: 'error',
      message: 'Authentication required to subscribe',
      timestamp: Date.now()
    });
    return;
  }

  logger.info(`Subscription request from ${connectionId}: ${data.channel}`);
  
  // Future: Handle custom channel subscriptions
  sendToConnection(connectionId, {
    type: 'subscribed',
    channel: data.channel,
    timestamp: Date.now()
  });
};

/**
 * Handle unsubscription requests
 */
const handleUnsubscription = async (connectionId, data) => {
  const connection = connections.get(connectionId);
  
  if (!connection) {
    return;
  }

  logger.info(`Unsubscription request from ${connectionId}: ${data.channel}`);
  
  sendToConnection(connectionId, {
    type: 'unsubscribed',
    channel: data.channel,
    timestamp: Date.now()
  });
};

/**
 * Check all connections for health and timeout
 */
const checkConnections = () => {
  const now = Date.now();
  const timeoutThreshold = now - CONNECTION_TIMEOUT;
  
  connections.forEach((connection, connectionId) => {
    // Check if connection has timed out
    if (connection.lastPing < timeoutThreshold) {
      logger.warn(`Connection ${connectionId} timed out`);
      connection.ws.close(1000, 'Connection timeout');
      cleanupConnection(connectionId);
    }
  });
};

/**
 * Send message to a specific connection
 */
const sendToConnection = (connectionId, message) => {
  const connection = connections.get(connectionId);
  
  if (!connection) {
    logger.warn(`Attempted to send message to unknown connection: ${connectionId}`);
    return false;
  }

  if (connection.ws.readyState !== 1) { // Not OPEN
    logger.warn(`Connection ${connectionId} is not open (state: ${connection.ws.readyState})`);
    return false;
  }

  try {
    connection.ws.send(JSON.stringify(message));
    return true;
  } catch (error) {
    logger.error(`Error sending message to ${connectionId}:`, error);
    return false;
  }
};

/**
 * Cleanup a connection
 */
const cleanupConnection = (connectionId) => {
  const connection = connections.get(connectionId);
  
  if (connection) {
    const { userId } = connection;
    
    // Remove from connections map
    connections.delete(connectionId);
    
    // Remove from user connections
    if (userId && userConnections.has(userId)) {
      const userConns = userConnections.get(userId);
      userConns.delete(connectionId);
      
      // If no more connections for this user, unsubscribe from realtime
      if (userConns.size === 0) {
        userConnections.delete(userId);
        unsubscribeFromUserNotifications(userId);
      }
    }
  }
};

/**
 * Cleanup all connections
 */
const cleanupAllConnections = () => {
  connections.forEach((connection, connectionId) => {
    try {
      connection.ws.close();
    } catch (error) {
      logger.error(`Error closing connection ${connectionId}:`, error);
    }
  });
  
  connections.clear();
  userConnections.clear();
  
  // Cleanup all realtime subscriptions
  realtimeChannels.forEach((channel, userId) => {
    unsubscribeFromUserNotifications(userId);
  });
  realtimeChannels.clear();
};

// PUBLIC_INTERFACE
/**
 * Broadcast a message to all authenticated connections
 * @param {object} message - Message to broadcast
 */
export const broadcastMessage = (message) => {
  const messageWithTimestamp = {
    ...message,
    timestamp: Date.now()
  };
  
  let sentCount = 0;
  
  connections.forEach((connection, connectionId) => {
    if (connection.authenticated && connection.ws.readyState === 1) {
      if (sendToConnection(connectionId, messageWithTimestamp)) {
        sentCount++;
      }
    }
  });

  logger.info(`Broadcasted message to ${sentCount} authenticated clients`);
  return sentCount;
};

// PUBLIC_INTERFACE
/**
 * Send a message to all connections of a specific user
 * @param {string} userId - User ID to send message to
 * @param {object} message - Message to send
 */
export const sendToUser = (userId, message) => {
  const messageWithTimestamp = {
    ...message,
    timestamp: Date.now()
  };
  
  const userConns = userConnections.get(userId);
  
  if (!userConns || userConns.size === 0) {
    logger.debug(`No active connections for user ${userId}`);
    return 0;
  }

  let sentCount = 0;
  
  userConns.forEach((connectionId) => {
    if (sendToConnection(connectionId, messageWithTimestamp)) {
      sentCount++;
    }
  });

  if (sentCount > 0) {
    logger.debug(`Sent message to user ${userId} (${sentCount} connections)`);
  }
  
  return sentCount;
};

// PUBLIC_INTERFACE
/**
 * Get connection statistics
 * @returns {object} Connection statistics
 */
export const getConnectionStats = () => {
  const totalConnections = connections.size;
  const authenticatedConnections = Array.from(connections.values())
    .filter(conn => conn.authenticated).length;
  const uniqueUsers = userConnections.size;
  const activeSubscriptions = realtimeChannels.size;

  return {
    totalConnections,
    authenticatedConnections,
    uniqueUsers,
    activeSubscriptions,
    timestamp: Date.now()
  };
};

export default { 
  initializeWebSocket, 
  broadcastMessage, 
  sendToUser,
  getConnectionStats
};
