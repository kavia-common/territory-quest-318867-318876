# WebSocket Real-Time Notifications

## Overview

The TurfRun backend provides WebSocket support for real-time game notifications and events. The WebSocket server integrates with Supabase Realtime to deliver instant updates about zone captures, attacks, mission completions, and other game events.

## Connection URL

```
ws://localhost:3001/ws
```

Production:
```
wss://your-domain.com/ws
```

## Architecture

```
Client → WebSocket Connection → JWT Authentication → Supabase Realtime → Event Broadcasting
```

### Flow:
1. Client establishes WebSocket connection
2. Server sends connection acknowledgment
3. Client sends authentication message with JWT token
4. Server verifies token with Supabase
5. Server subscribes to user's Supabase Realtime channels
6. Real-time events are automatically pushed to client

## Connection Lifecycle

### 1. Establish Connection

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = () => {
  console.log('Connected to WebSocket server');
};
```

### 2. Receive Welcome Message

Server sends:
```json
{
  "type": "connected",
  "connectionId": "conn_1234567890_abc123",
  "message": "Connected to TurfRun WebSocket server. Please authenticate.",
  "timestamp": 1234567890123
}
```

### 3. Authenticate

Client sends:
```json
{
  "type": "authenticate",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Server responds:
```json
{
  "type": "authenticated",
  "userId": "user-uuid-here",
  "message": "Successfully authenticated",
  "timestamp": 1234567890123
}
```

### 4. Receive Real-Time Events

Once authenticated, you'll automatically receive events:

```json
{
  "type": "notification",
  "data": {
    "id": "notification-uuid",
    "notification_type": "zone_captured",
    "title": "Zone Captured!",
    "message": "You captured zone 12345_67890",
    "read": false,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "timestamp": 1234567890123
}
```

## Message Types

### Client → Server

#### 1. Authenticate
```json
{
  "type": "authenticate",
  "token": "jwt_token_here"
}
```

**Response (Success):**
```json
{
  "type": "authenticated",
  "userId": "user-uuid",
  "message": "Successfully authenticated",
  "timestamp": 1234567890123
}
```

**Response (Error):**
```json
{
  "type": "auth_error",
  "message": "Invalid or expired token",
  "timestamp": 1234567890123
}
```

#### 2. Ping
```json
{
  "type": "ping"
}
```

**Response:**
```json
{
  "type": "pong",
  "timestamp": 1234567890123
}
```

#### 3. Subscribe (Future Feature)
```json
{
  "type": "subscribe",
  "channel": "zone_updates"
}
```

#### 4. Unsubscribe (Future Feature)
```json
{
  "type": "unsubscribe",
  "channel": "zone_updates"
}
```

### Server → Client

#### 1. Connected
Sent immediately after connection is established.
```json
{
  "type": "connected",
  "connectionId": "conn_1234567890_abc123",
  "message": "Connected to TurfRun WebSocket server. Please authenticate.",
  "timestamp": 1234567890123
}
```

#### 2. Authenticated
Sent after successful authentication.
```json
{
  "type": "authenticated",
  "userId": "user-uuid",
  "message": "Successfully authenticated",
  "timestamp": 1234567890123
}
```

#### 3. Notification
Sent when a new notification is created for the user.
```json
{
  "type": "notification",
  "data": {
    "id": "notification-uuid",
    "user_id": "user-uuid",
    "notification_type": "zone_captured",
    "title": "Zone Captured!",
    "message": "You captured zone 12345_67890 and earned 10 EP",
    "data": {
      "zone_id": "12345_67890",
      "ep_awarded": 10
    },
    "read": false,
    "created_at": "2024-01-15T10:30:00Z"
  },
  "timestamp": 1234567890123
}
```

#### 4. Zone Update
Sent when a zone owned by the user is updated.
```json
{
  "type": "zone_update",
  "data": {
    "id": "12345_67890",
    "owner_id": "user-uuid",
    "defense_score": 45,
    "status": "under_attack",
    "last_attack_at": "2024-01-15T10:30:00Z"
  },
  "timestamp": 1234567890123
}
```

#### 5. Pong
Heartbeat response.
```json
{
  "type": "pong",
  "timestamp": 1234567890123
}
```

#### 6. Error
Sent when an error occurs.
```json
{
  "type": "error",
  "message": "Error description",
  "timestamp": 1234567890123
}
```

## Notification Types

The following notification types are automatically pushed via WebSocket:

1. **zone_captured** - Zone successfully captured
2. **zone_lost** - Zone lost to another player
3. **zone_under_attack** - Zone is under attack
4. **mission_completed** - Mission completed
5. **level_up** - Player leveled up
6. **battle_won** - Battle victory
7. **battle_lost** - Battle defeat

## Client Implementation Examples

### JavaScript/Browser

```javascript
class TurfRunWebSocket {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.authenticate();
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.authenticated = false;
      this.reconnect();
    };
  }

  authenticate() {
    this.send({
      type: 'authenticate',
      token: this.token
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connected':
        console.log('Connected:', message.message);
        break;

      case 'authenticated':
        console.log('Authenticated:', message.userId);
        this.authenticated = true;
        this.onAuthenticated && this.onAuthenticated(message);
        break;

      case 'notification':
        console.log('Notification:', message.data);
        this.onNotification && this.onNotification(message.data);
        break;

      case 'zone_update':
        console.log('Zone update:', message.data);
        this.onZoneUpdate && this.onZoneUpdate(message.data);
        break;

      case 'error':
      case 'auth_error':
        console.error('Error:', message.message);
        this.onError && this.onError(message);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  ping() {
    this.send({ type: 'ping' });
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    } else {
      console.error('Max reconnection attempts reached');
      this.onReconnectFailed && this.onReconnectFailed();
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage
const wsClient = new TurfRunWebSocket('ws://localhost:3001/ws', 'your_jwt_token');

wsClient.onAuthenticated = (data) => {
  console.log('Successfully authenticated as:', data.userId);
};

wsClient.onNotification = (notification) => {
  console.log('New notification:', notification.title);
  // Update UI with notification
};

wsClient.onZoneUpdate = (zone) => {
  console.log('Zone updated:', zone.id, zone.status);
  // Update map with zone changes
};

wsClient.onError = (error) => {
  console.error('WebSocket error:', error.message);
};

wsClient.connect();

// Heartbeat every 30 seconds
setInterval(() => {
  if (wsClient.authenticated) {
    wsClient.ping();
  }
}, 30000);
```

### Flutter/Dart

```dart
import 'package:web_socket_channel/web_socket_channel.dart';
import 'dart:convert';

class TurfRunWebSocket {
  WebSocketChannel? _channel;
  final String url;
  final String token;
  bool authenticated = false;

  Function(Map<String, dynamic>)? onNotification;
  Function(Map<String, dynamic>)? onZoneUpdate;
  Function(String)? onError;

  TurfRunWebSocket(this.url, this.token);

  void connect() {
    _channel = WebSocketChannel.connect(Uri.parse(url));

    _channel!.stream.listen(
      (message) {
        final data = jsonDecode(message);
        _handleMessage(data);
      },
      onError: (error) {
        print('WebSocket error: $error');
        onError?.call(error.toString());
      },
      onDone: () {
        print('WebSocket disconnected');
        authenticated = false;
        // Implement reconnection logic here
      },
    );
  }

  void _handleMessage(Map<String, dynamic> message) {
    final type = message['type'];

    switch (type) {
      case 'connected':
        print('Connected: ${message['message']}');
        _authenticate();
        break;

      case 'authenticated':
        print('Authenticated: ${message['userId']}');
        authenticated = true;
        break;

      case 'notification':
        print('Notification: ${message['data']['title']}');
        onNotification?.call(message['data']);
        break;

      case 'zone_update':
        print('Zone update: ${message['data']['id']}');
        onZoneUpdate?.call(message['data']);
        break;

      case 'error':
      case 'auth_error':
        print('Error: ${message['message']}');
        onError?.call(message['message']);
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        print('Unknown message type: $type');
    }
  }

  void _authenticate() {
    send({
      'type': 'authenticate',
      'token': token,
    });
  }

  void send(Map<String, dynamic> data) {
    if (_channel != null) {
      _channel!.sink.add(jsonEncode(data));
    }
  }

  void ping() {
    send({'type': 'ping'});
  }

  void disconnect() {
    _channel?.sink.close();
    _channel = null;
  }
}

// Usage
final wsClient = TurfRunWebSocket('ws://localhost:3001/ws', 'your_jwt_token');

wsClient.onNotification = (notification) {
  print('New notification: ${notification['title']}');
  // Update UI
};

wsClient.onZoneUpdate = (zone) {
  print('Zone ${zone['id']} updated to ${zone['status']}');
  // Update map
};

wsClient.connect();
```

## Connection Management

### Heartbeat/Ping-Pong

The server automatically sends WebSocket ping frames every 30 seconds. Clients should respond with pong frames (handled automatically by most WebSocket clients).

Additionally, clients can send application-level ping messages:
```json
{
  "type": "ping"
}
```

Server responds with:
```json
{
  "type": "pong",
  "timestamp": 1234567890123
}
```

### Connection Timeout

Connections that don't respond to ping frames for 60 seconds will be automatically closed by the server.

### Reconnection Strategy

Clients should implement exponential backoff for reconnection attempts:
1. First attempt: immediately
2. Second attempt: 1 second
3. Third attempt: 2 seconds
4. Fourth attempt: 4 seconds
5. Fifth attempt: 8 seconds
6. Max delay: 30 seconds

## Supabase Realtime Integration

The WebSocket server automatically subscribes to the following Supabase Realtime channels for authenticated users:

### 1. Notifications Table
- **Table**: `notifications`
- **Filter**: `user_id=eq.{userId}`
- **Events**: INSERT
- **Trigger**: When a new notification is created for the user

### 2. Zones Table
- **Table**: `zones`
- **Filter**: `owner_id=eq.{userId}`
- **Events**: UPDATE
- **Trigger**: When a zone owned by the user is updated (status change, defense score change)

### Subscription Lifecycle
- Subscription is created when user authenticates
- Subscription is removed when all user's connections are closed
- Multiple connections from the same user share one subscription

## Security

### Authentication
- All WebSocket connections must authenticate with a valid Supabase JWT token
- Tokens are verified using Supabase Auth
- Unauthenticated connections can only send `authenticate` and `ping` messages

### Authorization
- Users only receive notifications for their own events
- Supabase RLS policies are enforced on all realtime subscriptions
- Zone updates are only sent to zone owners

### Rate Limiting
- WebSocket connections are subject to the same rate limits as HTTP endpoints
- Maximum 10 events per second per subscription (Supabase Realtime limit)

## Monitoring

### Connection Statistics

The server tracks the following metrics:
- Total active connections
- Authenticated connections
- Unique authenticated users
- Active Supabase Realtime subscriptions

These can be accessed via the internal API (for admin/monitoring tools).

## Troubleshooting

### Connection Refused
**Problem**: Can't establish WebSocket connection

**Solutions**:
1. Verify WebSocket URL is correct
2. Check server is running and WebSocket is enabled
3. Verify firewall/proxy settings allow WebSocket connections
4. Check CORS settings if connecting from browser

### Authentication Failed
**Problem**: Receiving `auth_error` message

**Solutions**:
1. Verify JWT token is valid and not expired
2. Ensure token is from the correct Supabase project
3. Check token is being sent correctly in the `authenticate` message
4. Verify Supabase credentials in server `.env` file

### Not Receiving Notifications
**Problem**: Authenticated but not receiving real-time events

**Solutions**:
1. Verify Supabase Realtime is enabled for your project
2. Check that notifications are being created in the database
3. Verify RLS policies allow user to view their notifications
4. Check server logs for subscription errors
5. Ensure WebSocket connection is still alive (send ping)

### Connection Drops Frequently
**Problem**: WebSocket connection closes unexpectedly

**Solutions**:
1. Implement proper reconnection logic with exponential backoff
2. Respond to ping frames promptly
3. Check network stability
4. Verify no aggressive proxy timeouts
5. Monitor server logs for errors

## Best Practices

### 1. Always Authenticate
Authenticate immediately after connection is established. Don't send other messages before authentication.

### 2. Handle Reconnection
Implement automatic reconnection with exponential backoff. Don't reconnect infinitely - set a max attempt limit.

### 3. Graceful Degradation
If WebSocket connection fails, fall back to polling the REST API for notifications.

### 4. Battery Optimization (Mobile)
Close WebSocket connection when app goes to background. Reconnect when app comes to foreground.

### 5. Error Handling
Always handle all message types, including errors. Log unexpected messages for debugging.

### 6. Keep Connection Alive
Send ping messages every 30 seconds to keep connection alive and detect network issues early.

### 7. Clean Disconnect
Always close WebSocket connection cleanly when done (e.g., user logs out).

## Testing

### Using wscat (Command Line)

Install wscat:
```bash
npm install -g wscat
```

Connect and test:
```bash
# Connect
wscat -c ws://localhost:3001/ws

# After connection, send authenticate message
{"type":"authenticate","token":"your_jwt_token_here"}

# Send ping
{"type":"ping"}

# Wait for notifications...
```

### Using JavaScript Console

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.send('{"type":"authenticate","token":"your_jwt_token"}');
ws.send('{"type":"ping"}');
```

## Environment Variables

WebSocket configuration uses the following environment variables:

```env
# Supabase connection
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_key

# Server configuration
PORT=3001
HOST=0.0.0.0

# CORS (affects WebSocket origin validation)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## Future Enhancements

Planned features for future versions:

1. **Custom Channels**: Allow subscribing to specific game events (e.g., nearby zone updates)
2. **Broadcast Messages**: Server-wide announcements (e.g., maintenance notifications)
3. **Direct Messaging**: Player-to-player chat
4. **Battle Events**: Real-time battle progress updates
5. **Presence**: Online/offline status for friends
6. **Location Sharing**: Optional real-time location sharing for nearby players

## Support

For issues or questions:
- Check server logs for detailed error messages
- Review this documentation
- Contact backend team with connection ID for troubleshooting
