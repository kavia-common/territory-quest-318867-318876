# TurfRun Game Backend

## Quick Start

Run the backend server with a single command:

```bash
chmod +x start.sh
./start.sh
```

The script will:
1. Check for dependencies and install if needed
2. Generate OpenAPI specification
3. Start the Express server

## API Documentation

Once the server is running, access the interactive Swagger UI documentation:

**Swagger UI**: http://localhost:3001/api/docs

**OpenAPI Spec**: http://localhost:3001/api/openapi.json

The Swagger UI provides:
- Interactive API testing
- Complete endpoint documentation
- Request/response schemas
- Authentication examples

## Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm run generate:openapi` - Generate OpenAPI specification
- `npm run validate` - Validate JavaScript syntax
- `./start.sh` - One-command startup (recommended)

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
HOST=0.0.0.0

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
ALLOWED_METHODS=GET,POST,PUT,DELETE,PATCH,OPTIONS
ALLOWED_HEADERS=Content-Type,Authorization

# Rate Limiting
RATE_LIMIT_WINDOW_S=60
RATE_LIMIT_MAX=100

# Request Timeout
REQUEST_TIMEOUT_MS=30000

# Optional
TRUST_PROXY=false
```

## API Endpoints

### Health Checks
- `GET /health` - Basic health check
- `GET /healthz` - Detailed readiness check

### Zones
- `GET /api/zones/bounds` - Get zones within bounds
- `GET /api/zones/nearby` - Get nearby zones
- `POST /api/zones/capture` - Capture a zone (auth required)
- `POST /api/zones/:zoneId/attack` - Attack a zone (auth required)
- `POST /api/zones/:zoneId/defend` - Defend a zone (auth required)
- `GET /api/zones/:zoneId/attack-range` - Check attack range

### Player
- `GET /api/player/stats` - Get player statistics (auth required)
- `POST /api/player/location` - Update player location (auth required)
- `GET /api/player/activity` - Get activity log (auth required)

### Missions
- `GET /api/missions` - Get user missions (auth required)
- `POST /api/missions/initialize` - Initialize missions (auth required)

### Notifications
- `GET /api/notifications` - Get notifications (auth required)
- `PATCH /api/notifications/:id/read` - Mark as read (auth required)
- `PATCH /api/notifications/read-all` - Mark all as read (auth required)

### Leaderboard
- `GET /api/leaderboard` - Get top players

### WebSocket
- `WS /ws` - WebSocket connection for real-time updates
- `GET /api/ws/stats` - Get WebSocket statistics

See `/api/docs` for complete interactive documentation.

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <your_supabase_jwt_token>
```

Tokens are obtained through Supabase authentication.

## WebSocket Usage

Connect to the WebSocket server at `ws://localhost:3001/ws` with authentication:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?token=<your_jwt_token>');
```

See `docs/WEBSOCKET.md` for detailed WebSocket documentation.

## Development

For development with auto-reload:

```bash
npm run dev
```

## Production

For production deployment:

```bash
NODE_ENV=production npm start
```

Or use the start script:

```bash
NODE_ENV=production ./start.sh
```

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
