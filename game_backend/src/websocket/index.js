import logger from '../utils/logger.js';

// Store active WebSocket connections
const connections = new Map();

// PUBLIC_INTERFACE
/**
 * Initialize WebSocket server
 * Handles real-time connections for game notifications
 */
export const initializeWebSocket = (wss) => {
  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    const connectionId = Math.random().toString(36).substring(7);
    
    logger.info(`WebSocket client connected: ${connectionId} from ${clientIp}`);
    
    // Store connection
    connections.set(connectionId, { ws, userId: null });

    // Handle messages from client
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        handleMessage(connectionId, data);
      } catch (error) {
        logger.error('Error parsing WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format'
        }));
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      logger.info(`WebSocket client disconnected: ${connectionId}`);
      connections.delete(connectionId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error(`WebSocket error for ${connectionId}:`, error);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      connectionId,
      message: 'Connected to TurfRun WebSocket server'
    }));
  });

  logger.info('WebSocket server initialized');
};

// Handle incoming messages
const handleMessage = (connectionId, data) => {
  const connection = connections.get(connectionId);
  
  if (!connection) {
    return;
  }

  switch (data.type) {
    case 'authenticate':
      // Store user ID for this connection
      if (data.userId) {
        connection.userId = data.userId;
        connection.ws.send(JSON.stringify({
          type: 'authenticated',
          message: 'Successfully authenticated'
        }));
        logger.info(`Connection ${connectionId} authenticated for user ${data.userId}`);
      }
      break;

    case 'ping':
      connection.ws.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
      }));
      break;

    default:
      logger.warn(`Unknown message type: ${data.type}`);
  }
};

// PUBLIC_INTERFACE
/**
 * Broadcast a message to all connected clients
 * @param {object} message - Message to broadcast
 */
export const broadcastMessage = (message) => {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  connections.forEach((connection) => {
    if (connection.ws.readyState === 1) { // 1 = OPEN
      connection.ws.send(messageStr);
      sentCount++;
    }
  });

  logger.debug(`Broadcasted message to ${sentCount} clients`);
};

// PUBLIC_INTERFACE
/**
 * Send a message to a specific user
 * @param {string} userId - User ID to send message to
 * @param {object} message - Message to send
 */
export const sendToUser = (userId, message) => {
  const messageStr = JSON.stringify(message);
  let sentCount = 0;

  connections.forEach((connection) => {
    if (connection.userId === userId && connection.ws.readyState === 1) {
      connection.ws.send(messageStr);
      sentCount++;
    }
  });

  if (sentCount > 0) {
    logger.debug(`Sent message to user ${userId} (${sentCount} connections)`);
  }
};

export default { initializeWebSocket, broadcastMessage, sendToUser };
