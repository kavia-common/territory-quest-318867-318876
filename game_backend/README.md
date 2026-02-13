# TurfRun Game Backend

Express.js backend API for the TurfRun territory capture game.

## Features

- RESTful API for game operations
- Real-time WebSocket notifications
- Supabase integration for database and auth
- Comprehensive error handling and logging
- Rate limiting and security middleware
- Input validation

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL + PostGIS)
- **Authentication**: Supabase Auth
- **WebSocket**: ws library
- **Validation**: express-validator
- **Logging**: Winston

## Environment Variables

Required environment variables (see `.env` file):

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase anon/public key
- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment (development/production)
- `ALLOWED_ORIGINS`: CORS allowed origins (comma-separated)

## Installation

```bash
npm install
```

**Dependencies Include:**
- `@supabase/supabase-js` - Supabase client for auth and realtime
- `ws` - WebSocket server implementation
- `express` - HTTP server framework
- `winston` - Logging
- `helmet` - Security headers
- `cors` - CORS middleware
- `joi` - Validation

## Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Zones
- `GET /api/zones/bounds` - Get zones in viewport
- `GET /api/zones/nearby` - Get zones within radius
- `POST /api/zones/capture` - Capture a zone (auth required)
- `POST /api/zones/:zoneId/attack` - Attack a zone (auth required)
- `POST /api/zones/:zoneId/defend` - Defend a zone (auth required)
- `GET /api/zones/:zoneId/attack-range` - Check if in attack range

### Player
- `GET /api/player/stats` - Get player statistics (auth required)
- `POST /api/player/location` - Update player location (auth required)
- `GET /api/player/activity` - Get activity log (auth required)

### Missions
- `GET /api/missions` - Get user missions (auth required)
- `POST /api/missions/initialize` - Create initial missions (auth required)

### Notifications
- `GET /api/notifications` - Get notifications (auth required)
- `PATCH /api/notifications/:id/read` - Mark as read (auth required)
- `PATCH /api/notifications/read-all` - Mark all as read (auth required)

### Leaderboard
- `GET /api/leaderboard` - Get top players

## WebSocket

Connect to `ws://localhost:3001/ws` for real-time notifications and game events.

### Features

- **JWT Authentication**: Secure connection with Supabase JWT tokens
- **Supabase Realtime Integration**: Automatic subscriptions to database events
- **Connection Management**: Heartbeat, timeout detection, automatic cleanup
- **User-Specific Routing**: Messages delivered only to relevant users
- **Real-time Events**: Instant notifications for zone captures, attacks, missions, etc.

### Quick Start

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'connected') {
    // Authenticate with JWT token
    ws.send(JSON.stringify({
      type: 'authenticate',
      token: 'your_supabase_jwt_token'
    }));
  }
};
```

### Documentation

For comprehensive WebSocket documentation, see [docs/WEBSOCKET.md](docs/WEBSOCKET.md)

**Key Topics:**
- Connection lifecycle and authentication
- Message types and formats
- Client implementation examples (JavaScript, Flutter)
- Supabase Realtime integration
- Error handling and troubleshooting
- Best practices for mobile and web clients

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <supabase_jwt_token>
```

## Error Handling

All errors return a consistent JSON format:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "errors": []
  }
}
```

## Project Structure

```
game_backend/
├── src/
│   ├── middleware/       # Express middleware
│   ├── routes/          # API route handlers
│   ├── utils/           # Utility functions
│   ├── websocket/       # WebSocket handlers
│   └── server.js        # Main entry point
├── .env                 # Environment variables
├── .gitignore          # Git ignore rules
├── package.json        # Dependencies
└── README.md           # Documentation
```

## Database

The backend uses Supabase PostgreSQL with PostGIS extension. Database schema is defined in:
- `schema.sql` - Table definitions
- `rpc.sql` - Stored procedures
- `rls.sql` - Row Level Security policies

## License

ISC
