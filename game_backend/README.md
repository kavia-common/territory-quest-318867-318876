# TurfRun Game Backend

Express.js backend API for the TurfRun territory capture game with Supabase Auth integration, private groups, and real-time features.

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

## Features

- **RESTful API**: Clean, documented endpoints for all game operations
- **WebSocket Support**: Real-time notifications and updates
- **Supabase Integration**: PostgreSQL with PostGIS for spatial queries
- **Authentication**: JWT-based authentication via Supabase Auth
- **User Management**: Profile creation, onboarding, and updates
- **Private Groups**: Invite-based group system for up to 100 users per group
- **Rate Limiting**: Protection against abuse
- **CORS Support**: Configurable cross-origin requests
- **Request Logging**: Comprehensive logging with Winston
- **OpenAPI Documentation**: Swagger UI for API exploration
- **Production Ready**: Helmet security, error handling, graceful shutdown

## API Documentation

Once the server is running, access the interactive Swagger UI documentation:

**Swagger UI**: http://localhost:3001/api/docs

**OpenAPI Spec**: http://localhost:3001/api/openapi.json

The Swagger UI provides:
- Interactive API testing
- Complete endpoint documentation
- Request/response schemas
- Authentication examples

## API Endpoints

### Authentication & User Management
- `POST /api/auth/signup` - Complete user onboarding after Supabase Auth
- `GET /api/auth/me` - Get current user profile and stats
- `PUT /api/auth/profile` - Update user profile
- `GET /api/auth/check-username/:username` - Check username availability

See [docs/AUTH_API.md](docs/AUTH_API.md) for detailed auth documentation.

### Private Groups
- `POST /api/groups` - Create a new private group
- `GET /api/groups/my` - Get groups user is member of
- `GET /api/groups/:groupId` - Get group details and members
- `PUT /api/groups/:groupId` - Update group (owner only)
- `POST /api/groups/:groupId/invite` - Generate invite code (owner/admin)
- `POST /api/groups/join` - Join group with invite code
- `DELETE /api/groups/:groupId/leave` - Leave group
- `DELETE /api/groups/:groupId` - Delete group (owner only)

See [docs/GROUPS_SETUP.md](docs/GROUPS_SETUP.md) for group system documentation.

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

### Authentication Flow

1. User signs up/logs in via Supabase Auth (in mobile app)
2. User completes onboarding via `POST /api/auth/signup`
3. User accesses protected endpoints with JWT token
4. Backend validates token with Supabase on each request

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
PORT=3001
NODE_ENV=development
HOST=0.0.0.0

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# URLs
BACKEND_URL=http://localhost:3001
FRONTEND_URL=http://localhost:3000
SITE_URL=http://localhost:3000

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
CORS_MAX_AGE=3600
```

## Installation

```bash
npm install
```

**Dependencies Include:**
- `@supabase/supabase-js` - Supabase client for auth and database
- `express` - HTTP server framework
- `ws` - WebSocket server implementation
- `winston` - Logging
- `helmet` - Security headers
- `cors` - CORS middleware
- `joi` - Request validation
- `uuid` - UUID generation
- `express-validator` - Additional validation
- `express-rate-limit` - Rate limiting

## Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm run generate:openapi` - Generate OpenAPI specification
- `npm run validate` - Validate JavaScript syntax
- `./start.sh` - One-command startup (recommended)

## Database Setup

The backend uses Supabase PostgreSQL with PostGIS extension. Setup instructions:

1. **Run Schema Scripts** (via Supabase SQL Editor):
   - `schema.sql` - Main tables and functions
   - `rpc.sql` - RPC functions for game logic
   - `rls.sql` - Row-level security policies
   - `schema_groups.sql` - Group tables
   - `rls_groups.sql` - Group security policies

2. **Verify Setup**:
   ```bash
   node scripts/verify_setup.js
   ```

See [assets/supabase.md](assets/supabase.md) for complete Supabase configuration guide.

## WebSocket Usage

Connect to the WebSocket server at `ws://localhost:3001/ws` with authentication:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?token=<your_jwt_token>');
```

See [docs/WEBSOCKET.md](docs/WEBSOCKET.md) for detailed WebSocket documentation.

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

## Project Structure

```
game_backend/
├── src/
│   ├── middleware/       # Express middleware (auth, errors, logging)
│   ├── routes/          # API route handlers
│   │   ├── auth.js      # Authentication & user management
│   │   ├── groups.js    # Private group management
│   │   ├── zones.js     # Zone operations
│   │   ├── player.js    # Player stats & activity
│   │   ├── missions.js  # Mission management
│   │   ├── notifications.js
│   │   ├── leaderboard.js
│   │   └── utils.js
│   ├── utils/           # Utility functions
│   ├── websocket/       # WebSocket handlers
│   └── server.js        # Main entry point
├── docs/                # Documentation
│   ├── AUTH_API.md      # Auth API documentation
│   ├── GROUPS_SETUP.md  # Groups documentation
│   └── WEBSOCKET.md     # WebSocket documentation
├── assets/
│   └── supabase.md      # Supabase setup guide
├── schema.sql           # Main database schema
├── schema_groups.sql    # Groups database schema
├── rpc.sql              # RPC functions
├── rls.sql              # RLS policies (main)
├── rls_groups.sql       # RLS policies (groups)
├── .env                 # Environment variables
├── package.json         # Dependencies
├── start.sh             # Startup script
└── README.md            # This file
```

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL + PostGIS)
- **Authentication**: Supabase Auth (JWT)
- **WebSocket**: ws library
- **Validation**: Joi + express-validator
- **Logging**: Winston

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

## Security Features

- JWT token validation via Supabase Auth
- Row-level security on all database tables
- CORS configuration
- Rate limiting
- Request timeouts
- Helmet security headers
- Input validation
- Role-based access control for groups

## Testing

```bash
npm test
```

See `src/middleware/__tests__/auth.test.js` for test examples.

## Documentation

- **API Documentation**: http://localhost:3001/api/docs (Swagger UI)
- **Auth API**: [docs/AUTH_API.md](docs/AUTH_API.md)
- **Groups**: [docs/GROUPS_SETUP.md](docs/GROUPS_SETUP.md)
- **WebSocket**: [docs/WEBSOCKET.md](docs/WEBSOCKET.md)
- **Supabase Setup**: [assets/supabase.md](assets/supabase.md)

## License

ISC
