/**
 * Authentication Middleware Usage Examples
 * This file demonstrates how to use the authentication middleware and helpers
 */

import express from 'express';
import { 
  authenticate, 
  optionalAuth, 
  requireOwnership,
  isAuthenticated,
  getCurrentUserId,
  getCurrentUser
} from './auth.js';

const router = express.Router();

// ============================================
// EXAMPLE 1: Protected Route (Requires Auth)
// ============================================

// PUBLIC_INTERFACE
/**
 * Example: Route that requires authentication
 * The authenticate middleware will verify JWT and attach user to req
 */
router.get('/protected/profile', authenticate, (req, res) => {
  // At this point, req.user, req.userId, and req.userEmail are available
  res.json({
    success: true,
    data: {
      userId: req.userId,
      email: req.userEmail,
      user: req.user
    }
  });
});

// ============================================
// EXAMPLE 2: Optional Auth Route
// ============================================

// PUBLIC_INTERFACE
/**
 * Example: Route that works for both authenticated and anonymous users
 * The optionalAuth middleware will attach user if token is valid, but won't fail if missing
 */
router.get('/public/content', optionalAuth, (req, res) => {
  // Check if user is authenticated using helper
  if (isAuthenticated(req)) {
    return res.json({
      success: true,
      message: 'Welcome back!',
      userId: getCurrentUserId(req),
      personalized: true
    });
  }
  
  res.json({
    success: true,
    message: 'Welcome!',
    personalized: false
  });
});

// ============================================
// EXAMPLE 3: Resource Ownership Protection
// ============================================

// PUBLIC_INTERFACE
/**
 * Example: Route that requires user to own the resource
 * The requireOwnership middleware checks that req.userId matches the userId in URL params
 */
router.get('/users/:userId/private-data', 
  authenticate, 
  requireOwnership('userId'), 
  (req, res) => {
    // User is authenticated AND owns this resource
    res.json({
      success: true,
      data: {
        message: 'This is your private data',
        userId: req.userId
      }
    });
  }
);

// ============================================
// EXAMPLE 4: Custom Auth Check in Handler
// ============================================

// PUBLIC_INTERFACE
/**
 * Example: Manual auth check within handler
 * Useful for complex authorization logic
 */
router.post('/posts/:postId/edit', authenticate, async (req, res) => {
  const postId = req.params.postId;
  const currentUser = getCurrentUser(req);
  
  // Fetch post from database (pseudo-code)
  // const post = await getPost(postId);
  
  // Custom authorization logic
  // if (post.authorId !== currentUser.id && !currentUser.isAdmin) {
  //   return res.status(403).json({
  //     success: false,
  //     error: {
  //       message: 'Only post author or admin can edit',
  //       statusCode: 403
  //     }
  //   });
  // }
  
  res.json({
    success: true,
    message: 'Post edited successfully'
  });
});

// ============================================
// EXAMPLE 5: Multiple Middleware Chaining
// ============================================

// Helper middleware: Check if user is admin (example)
const requireAdmin = (req, res, next) => {
  if (!isAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      error: {
        message: 'Authentication required',
        statusCode: 401
      }
    });
  }
  
  // Check if user has admin role (pseudo-code)
  // const user = getCurrentUser(req);
  // if (!user.app_metadata?.role === 'admin') {
  //   return res.status(403).json({
  //     success: false,
  //     error: {
  //       message: 'Admin access required',
  //       statusCode: 403
  //     }
  //   });
  // }
  
  next();
};

// PUBLIC_INTERFACE
/**
 * Example: Admin-only route with multiple middleware
 */
router.delete('/admin/users/:userId', 
  authenticate, 
  requireAdmin, 
  (req, res) => {
    res.json({
      success: true,
      message: 'User deleted by admin'
    });
  }
);

// ============================================
// EXAMPLE 6: Helper Functions Usage
// ============================================

// PUBLIC_INTERFACE
/**
 * Example: Using helper functions for conditional logic
 */
router.get('/posts', optionalAuth, async (req, res) => {
  // Get all posts, but filter based on auth status
  const userId = getCurrentUserId(req);
  const isAuth = isAuthenticated(req);
  
  // Pseudo-code for database query
  let query = { published: true };
  
  if (isAuth) {
    // Authenticated users can see their own drafts too
    query = { 
      $or: [
        { published: true },
        { authorId: userId, published: false }
      ]
    };
  }
  
  // const posts = await getPosts(query);
  
  res.json({
    success: true,
    data: {
      posts: [],
      viewingAs: isAuth ? 'authenticated' : 'anonymous'
    }
  });
});

// ============================================
// TESTING GUIDE
// ============================================

/*
 * HOW TO TEST AUTHENTICATION:
 * 
 * 1. Get a valid Supabase JWT token:
 *    - Sign up/login through Supabase Auth
 *    - Token will be in the response or from supabase.auth.session()
 * 
 * 2. Make requests with Authorization header:
 *    curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3001/api/protected/profile
 * 
 * 3. Test without token (should fail for protected routes):
 *    curl http://localhost:3001/api/protected/profile
 *    Expected: 401 Unauthorized
 * 
 * 4. Test with invalid token:
 *    curl -H "Authorization: Bearer invalid_token" http://localhost:3001/api/protected/profile
 *    Expected: 401 Invalid or expired token
 * 
 * 5. Test optional auth (should work with or without token):
 *    curl http://localhost:3001/api/public/content
 *    curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3001/api/public/content
 * 
 * 6. Test ownership protection:
 *    curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3001/api/users/YOUR_USER_ID/private-data
 *    curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3001/api/users/DIFFERENT_USER_ID/private-data
 *    Expected: Second request should return 403 Forbidden
 */

export default router;
```

Now let's create a comprehensive README for the authentication system:

Explanation: Create authentication documentation to guide developers on using the middleware

````write file="territory-quest-318867-318876/game_backend/docs/AUTHENTICATION.md"
# Authentication System Documentation

## Overview

The TurfRun backend uses Supabase Auth for JWT-based authentication. This document explains how to use the authentication middleware and helpers.

## Architecture

```
Client → JWT Token in Authorization Header → Express Middleware → Supabase Verification → Route Handler
```

## Middleware Functions

### `authenticate`

Validates JWT token and rejects request if invalid or missing.

**Usage:**
```javascript
import { authenticate } from '../middleware/auth.js';

router.get('/protected', authenticate, (req, res) => {
  // req.user - Full user object from Supabase
  // req.userId - User UUID
  // req.userEmail - User email
  res.json({ userId: req.userId });
});
```

**Request Requirements:**
- Header: `Authorization: Bearer <jwt_token>`

**Response on Failure:**
- Status: 401 Unauthorized
- Body: `{ success: false, error: { message: string, statusCode: 401 } }`

**Response on Success:**
- Continues to next middleware/handler
- Attaches `req.user`, `req.userId`, `req.userEmail`

---

### `optionalAuth`

Attempts authentication but doesn't fail if token is missing.

**Usage:**
```javascript
import { optionalAuth } from '../middleware/auth.js';

router.get('/public', optionalAuth, (req, res) => {
  if (req.userId) {
    // User is authenticated
    return res.json({ message: 'Welcome back!', userId: req.userId });
  }
  // User is anonymous
  res.json({ message: 'Welcome!' });
});
```

**Use Cases:**
- Public endpoints that show different content for authenticated users
- Leaderboards that highlight current user's position
- Content that's accessible to all but personalized for logged-in users

---

### `requireOwnership(paramName)`

Ensures authenticated user owns the resource specified in URL parameters.

**Usage:**
```javascript
import { authenticate, requireOwnership } from '../middleware/auth.js';

// User can only access their own data
router.get('/users/:userId/profile', 
  authenticate, 
  requireOwnership('userId'), 
  (req, res) => {
    // req.userId === req.params.userId guaranteed
    res.json({ profile: 'user profile data' });
  }
);
```

**Parameters:**
- `paramName` (default: `'userId'`) - Name of URL parameter containing user ID

**Response on Failure:**
- Status: 403 Forbidden if user doesn't own resource
- Status: 401 Unauthorized if not authenticated
- Status: 400 Bad Request if parameter missing

---

## Helper Functions

### `isAuthenticated(req)`

Check if request is authenticated.

**Usage:**
```javascript
import { isAuthenticated } from '../middleware/auth.js';

router.get('/content', optionalAuth, (req, res) => {
  if (isAuthenticated(req)) {
    // User is logged in
  }
});
```

**Returns:** `boolean`

---

### `getCurrentUserId(req)`

Get current user's ID.

**Usage:**
```javascript
import { getCurrentUserId } from '../middleware/auth.js';

router.get('/posts', optionalAuth, async (req, res) => {
  const userId = getCurrentUserId(req);
  // userId is null if not authenticated
  const posts = await getPostsByUser(userId);
  res.json({ posts });
});
```

**Returns:** `string | null` - User UUID or null

---

### `getCurrentUser(req)`

Get full user object.

**Usage:**
```javascript
import { getCurrentUser } from '../middleware/auth.js';

router.get('/profile', authenticate, (req, res) => {
  const user = getCurrentUser(req);
  res.json({
    id: user.id,
    email: user.email,
    metadata: user.user_metadata
  });
});
```

**Returns:** `object | null` - Supabase user object or null

---

## Integration with Routes

### Current Route Implementation

All route files already use the authentication middleware:

1. **zones.js** - Mixed auth (some public, some protected)
   - Public: GET `/bounds`, GET `/nearby`, GET `/:zoneId/attack-range`
   - Protected: POST `/capture`, POST `/:zoneId/attack`, POST `/:zoneId/defend`

2. **player.js** - All protected
   - GET `/stats`, POST `/location`, GET `/activity`

3. **missions.js** - All protected
   - GET `/`, POST `/initialize`

4. **notifications.js** - All protected
   - GET `/`, PATCH `/:notificationId/read`, PATCH `/read-all`

5. **leaderboard.js** - Public
   - GET `/`

### Example: Adding New Protected Route

```javascript
// src/routes/myroute.js
import express from 'express';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Protected endpoint
router.post('/action', authenticate, async (req, res) => {
  const userId = req.userId; // Available from middleware
  
  // Your logic here
  
  res.json({ success: true });
});

export default router;
```

---

## Client Integration

### Frontend Request Example (JavaScript)

```javascript
// Get token from Supabase Auth
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Make authenticated request
const response = await fetch('http://localhost:3001/api/player/stats', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
```

### Flutter Request Example

```dart
// Get token from Supabase
final session = Supabase.instance.client.auth.currentSession;
final token = session?.accessToken;

// Make authenticated request
final response = await http.get(
  Uri.parse('http://localhost:3001/api/player/stats'),
  headers: {
    'Authorization': 'Bearer $token',
    'Content-Type': 'application/json',
  },
);

final data = jsonDecode(response.body);
```

---

## Error Responses

### 401 Unauthorized

**Causes:**
- Missing Authorization header
- Invalid Bearer token format
- Expired JWT token
- Invalid JWT signature

**Response:**
```json
{
  "success": false,
  "error": {
    "message": "Invalid or expired token",
    "statusCode": 401
  }
}
```

### 403 Forbidden

**Causes:**
- User doesn't own the requested resource (ownership check failed)
- User lacks required permissions

**Response:**
```json
{
  "success": false,
  "error": {
    "message": "You do not have permission to access this resource",
    "statusCode": 403
  }
}
```

### 500 Internal Server Error

**Causes:**
- Supabase service unavailable
- Network issues
- Server misconfiguration

**Response:**
```json
{
  "success": false,
  "error": {
    "message": "Authentication service error",
    "statusCode": 500
  }
}
```

---

## Testing Authentication

### Using cURL

```bash
# Get token first (example with Supabase REST API)
TOKEN="your_jwt_token_here"

# Test protected endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/player/stats

# Test without token (should fail)
curl http://localhost:3001/api/player/stats

# Test with invalid token (should fail)
curl -H "Authorization: Bearer invalid_token" \
  http://localhost:3001/api/player/stats
```

### Using Postman

1. Set Authorization Type: Bearer Token
2. Paste JWT token in Token field
3. Send request

### Using JavaScript

```javascript
// Test function
async function testAuth() {
  const token = 'your_jwt_token';
  
  try {
    const response = await fetch('http://localhost:3001/api/player/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    console.log('Success:', data);
  } catch (error) {
    console.error('Error:', error);
  }
}
```

---

## Security Best Practices

### DO ✅

- Always use HTTPS in production
- Store tokens securely (never in localStorage for sensitive apps)
- Refresh tokens before expiry
- Validate tokens on every protected request
- Log authentication failures for monitoring
- Set appropriate token expiry times

### DON'T ❌

- Don't expose tokens in URLs or logs
- Don't share tokens between users
- Don't bypass authentication for testing in production
- Don't store tokens in version control
- Don't trust client-side validation alone

---

## Troubleshooting

### Token Always Returns 401

**Check:**
1. Token format: Must be `Bearer <token>`, not just `<token>`
2. Token expiry: Tokens expire after set duration
3. Supabase URL/Key: Verify `.env` configuration
4. Network: Ensure backend can reach Supabase

### User Object Missing Expected Fields

**Solution:**
- Check Supabase user metadata
- Ensure user profile is complete
- Verify JWT claims in token

### Ownership Check Fails

**Check:**
1. URL parameter name matches `requireOwnership()` argument
2. User ID format (UUID) matches
3. User is authenticated before ownership check

---

## Environment Variables

Required environment variables for authentication:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_anon_or_service_role_key
```

**Note:** Use `anon` key for client-side auth, `service_role` key for admin operations (use with caution).

---

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [JWT.io - Token Debugger](https://jwt.io/)
- [Express Middleware Guide](https://expressjs.com/en/guide/using-middleware.html)
