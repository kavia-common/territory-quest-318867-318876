# TurfRun Backend API - Quick Reference

## Base URL
- **Development:** `http://localhost:3001`
- **Production:** Set via `BACKEND_URL` environment variable

## Authentication
Protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <supabase_jwt_token>
```

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "errors": [...]  // For validation errors
  }
}
```

## Quick Endpoint Reference

### 🗺️ Zone Management

#### Get Zones in Viewport
```http
GET /api/zones/bounds?min_lat=12.9&min_lon=77.5&max_lat=13.0&max_lon=77.6
```

#### Get Nearby Zones
```http
GET /api/zones/nearby?lat=12.9716&lon=77.5946&radius_meters=1000
```

#### Capture Zone
```http
POST /api/zones/capture
Authorization: Bearer <token>
Content-Type: application/json

{
  "lat": 12.9716,
  "lon": 77.5946
}
```

#### Attack Zone
```http
POST /api/zones/12345_67890/attack
Authorization: Bearer <token>
Content-Type: application/json

{
  "attack_power": 25
}
```

#### Defend Zone
```http
POST /api/zones/12345_67890/defend
Authorization: Bearer <token>
Content-Type: application/json

{
  "defense_boost": 15
}
```

#### Check Attack Range
```http
GET /api/zones/12345_67890/attack-range?lat=12.9716&lon=77.5946
```

### 👤 Player

#### Get Player Stats
```http
GET /api/player/stats
Authorization: Bearer <token>
```

#### Update Location
```http
POST /api/player/location
Authorization: Bearer <token>
Content-Type: application/json

{
  "lat": 12.9716,
  "lon": 77.5946
}
```

#### Get Activity Log
```http
GET /api/player/activity?limit=50
Authorization: Bearer <token>
```

### 🎯 Missions

#### Get User Missions
```http
GET /api/missions?status=active
Authorization: Bearer <token>
```

#### Initialize Missions
```http
POST /api/missions/initialize
Authorization: Bearer <token>
```

### 🔔 Notifications

#### Get Notifications
```http
GET /api/notifications?include_read=false&limit=50
Authorization: Bearer <token>
```

#### Mark Notification as Read
```http
PATCH /api/notifications/<notification_id>/read
Authorization: Bearer <token>
```

#### Mark All as Read
```http
PATCH /api/notifications/read-all
Authorization: Bearer <token>
```

### 🏆 Leaderboard

#### Get Leaderboard
```http
GET /api/leaderboard?limit=100
```

### 🛠️ Utils

#### Calculate Distance
```http
POST /api/utils/distance
Content-Type: application/json

{
  "lat1": 12.9716,
  "lon1": 77.5946,
  "lat2": 13.0000,
  "lon2": 77.6000
}
```

## WebSocket

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

// Authenticate
ws.send(JSON.stringify({
  type: 'auth',
  token: '<supabase_jwt_token>'
}));
```

### Message Format
```javascript
// Client -> Server
{
  "type": "ping" | "auth" | "subscribe",
  "token": "<jwt>",  // for auth
  "channel": "notifications"  // for subscribe
}

// Server -> Client
{
  "type": "pong" | "auth_success" | "notification" | "zone_update",
  "data": { ... }
}
```

## Common Status Codes

- `200` - Success
- `400` - Validation error / Bad request
- `401` - Unauthorized / Missing or invalid token
- `404` - Resource not found
- `429` - Rate limit exceeded
- `500` - Internal server error

## Rate Limiting

- **Default:** 100 requests per 60 seconds per IP
- **Configurable via:** `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_S` env vars

## Validation Rules

### Coordinates
- Latitude: `-90` to `90`
- Longitude: `-180` to `180`

### Zone IDs
- Format: `<lat_grid>_<lon_grid>` (e.g., `12345_67890`)
- Pattern: `^-?\d+_-?\d+$`

### Attack/Defense
- Attack Power: `1` to `50`
- Defense Boost: `1` to `30`

### Limits
- Activity Log: `1` to `200` (default: 50)
- Notifications: `1` to `200` (default: 50)
- Leaderboard: `1` to `1000` (default: 100)
- Missions: `1` to `200` (default: 50)
- Nearby Zones Radius: `1` to `10000` meters

## Testing with cURL

### Get Leaderboard (Public)
```bash
curl http://localhost:3001/api/leaderboard?limit=10
```

### Capture Zone (Authenticated)
```bash
curl -X POST http://localhost:3001/api/zones/capture \
  -H "Authorization: Bearer <your_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"lat": 12.9716, "lon": 77.5946}'
```

### Calculate Distance (Public)
```bash
curl -X POST http://localhost:3001/api/utils/distance \
  -H "Content-Type: application/json" \
  -d '{"lat1": 12.9716, "lon1": 77.5946, "lat2": 13.0, "lon2": 77.6}'
```

## Documentation Links

- **Interactive Docs:** `http://localhost:3001/api/docs`
- **OpenAPI Spec:** `http://localhost:3001/api/openapi.json`
- **Health Check:** `http://localhost:3001/healthz`
- **Root Info:** `http://localhost:3001/`

## Environment Variables

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# Optional
PORT=3001
NODE_ENV=development
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_S=60
REQUEST_TIMEOUT_MS=30000
ALLOWED_ORIGINS=http://localhost:3000
```

---

**For detailed documentation, see:**
- Full API Docs: `/api/docs`
- RPC Audit: `docs/RPC_AUDIT.md`
- WebSocket Guide: `docs/WEBSOCKET.md`
