# TurfRun Backend Documentation

This directory contains comprehensive documentation for the TurfRun game backend.

## Documents

### [RPC_AUDIT.md](./RPC_AUDIT.md)
Complete audit of all Supabase RPC functions and their corresponding REST API endpoints. Includes:
- Coverage matrix showing all RPCs mapped to REST endpoints
- Validation and security details
- API route structure
- Testing recommendations
- Compliance checklist

### [WEBSOCKET.md](./WEBSOCKET.md)
WebSocket implementation documentation including:
- Connection protocols
- Message formats
- Real-time notifications
- Client integration examples

## Quick Links

- **API Documentation**: http://localhost:3001/api/docs (Swagger UI)
- **OpenAPI Spec**: http://localhost:3001/api/openapi.json
- **Health Check**: http://localhost:3001/healthz
- **WebSocket**: ws://localhost:3001/ws

## API Overview

The TurfRun backend provides REST APIs for:

1. **Zone Management** - Capture, attack, and defend territory zones
2. **Player System** - Statistics, location tracking, activity logs
3. **Missions** - Game objectives and progression tracking
4. **Notifications** - Real-time alerts and game events
5. **Leaderboard** - Global rankings and competition
6. **Utilities** - Distance calculations and helpers

All authenticated endpoints require a valid Supabase JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Development

### Running the Backend
```bash
npm start
```

### Environment Variables
See `.env.example` for required configuration:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Supabase anon/service key
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)

### Testing
```bash
npm test
```

## Architecture

The backend follows a layered architecture:

```
src/
├── server.js           # Express app setup and configuration
├── routes/             # REST API endpoints
│   ├── zones.js        # Zone management
│   ├── player.js       # Player operations
│   ├── missions.js     # Mission system
│   ├── notifications.js # Notifications
│   ├── leaderboard.js  # Rankings
│   └── utils.js        # Utility functions
├── middleware/         # Express middleware
│   ├── auth.js         # JWT authentication
│   ├── errorHandler.js # Error handling
│   └── ...
├── utils/              # Utility modules
│   ├── supabase.js     # Supabase client
│   ├── logger.js       # Logging
│   └── validation.js   # Validation helpers
└── websocket/          # WebSocket implementation
    └── index.js
```

## Database

The backend uses Supabase (PostgreSQL + PostGIS) with:
- **schema.sql** - Database schema and tables
- **rpc.sql** - Stored procedures and functions
- **rls.sql** - Row-level security policies

See the SQL files in the root directory for complete database definitions.
