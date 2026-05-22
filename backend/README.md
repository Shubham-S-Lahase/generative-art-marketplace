# GenArt Pro Backend

High-performance Go backend for the generative art marketplace.

## Features

- **RESTful API** with comprehensive endpoints
- **JWT Authentication** with secure token handling
- **MongoDB Integration** with optimized queries
- **WebSocket Support** for real-time collaboration
- **Middleware Stack** for auth, CORS, and logging
- **Clean Architecture** with separation of concerns

## Tech Stack

- Go 1.21
- Gin (HTTP framework)
- MongoDB Driver
- JWT for authentication
- WebSocket support
- Docker containerization

## Getting Started

### Prerequisites

- Go 1.21+
- MongoDB 7+
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd generative-art-marketplace/backend

# Install dependencies
go mod tidy

# Copy environment file
cp .env.example .env

# Edit environment variables
nano .env

# Run the server
go run cmd/main.go
```

### Environment Variables

```env
PORT=8080
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=generative_art_marketplace
JWT_SECRET=your-super-secret-jwt-key
GIN_MODE=debug
```

## API Documentation

### Authentication Endpoints

#### POST /api/v1/auth/register
Register a new user account.

**Request Body:**
```json
{
  "username": "string",
  "email": "string", 
  "password": "string"
}
```

#### POST /api/v1/auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

### Artwork Endpoints

#### GET /api/v1/artworks
List artworks with pagination and filtering.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)
- `category` - Filter by category
- `sort` - Sort by: recent, popular, likes

#### POST /api/v1/artworks
Create a new artwork (authentication required).

**Request Body:**
```json
{
  "title": "string",
  "description": "string",
  "parameters": {
    "colors": ["#ff0000", "#00ff00"],
    "pattern": "spiral",
    "complexity": 5
  },
  "tags": ["abstract", "colorful"],
  "isPublic": true
}
```

#### GET /api/v1/artworks/:id
Get artwork details by ID.

#### PUT /api/v1/artworks/:id
Update artwork (authentication required, owner only).

#### DELETE /api/v1/artworks/:id
Delete artwork (authentication required, owner only).

### User Endpoints

#### GET /api/v1/users/:username
Get user profile by username.

#### GET /api/v1/users/:username/artworks
Get artworks by specific user.

#### POST /api/v1/users/:id/follow
Follow a user (authentication required).

#### DELETE /api/v1/users/:id/follow
Unfollow a user (authentication required).

### Live Session Endpoints

#### GET /api/v1/sessions
List active live sessions.

#### POST /api/v1/sessions
Create a new live session (authentication required).

#### POST /api/v1/sessions/:id/join
Join a live session (authentication required).

#### POST /api/v1/sessions/:id/leave
Leave a live session (authentication required).

### WebSocket Events

Connect to `/ws` with authentication header.

**Events:**
- `session:join` - Join a collaborative session
- `session:leave` - Leave a session
- `session:message` - Send chat message
- `session:parameter-change` - Update art parameters

## Project Structure

```
backend/
├── cmd/                    # Application entry points
│   └── main.go            # Main server application
├── internal/              # Private application code
│   ├── api/               # API layer
│   │   ├── handlers/      # HTTP request handlers
│   │   ├── middleware/    # HTTP middleware
│   │   └── routes/        # Route definitions
│   ├── models/            # Data models
│   ├── services/          # Business logic
│   └── websocket/         # WebSocket handling
├── pkg/                   # Public libraries
│   ├── auth/              # Authentication utilities
│   ├── database/          # Database connection
│   └── generator/         # Art generation utilities
├── migrations/            # Database migrations
├── config/                # Configuration files
├── go.mod                 # Go dependencies
├── go.sum                 # Dependency checksums
├── Dockerfile            # Container definition
└── README.md             # This file
```

## Database Schema

### Users Collection
```json
{
  "_id": "ObjectId",
  "username": "string",
  "email": "string", 
  "password": "string (hashed)",
  "profile": {
    "firstName": "string",
    "lastName": "string",
    "bio": "string",
    "avatar": "string",
    "location": "string"
  },
  "stats": {
    "artworksCreated": "number",
    "totalViews": "number",
    "followersCount": "number"
  },
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Artworks Collection
```json
{
  "_id": "ObjectId",
  "title": "string",
  "description": "string",
  "userId": "ObjectId",
  "parameters": {
    "colors": ["string"],
    "pattern": "string",
    "complexity": "number"
  },
  "metrics": {
    "views": "number",
    "likes": "number",
    "comments": "number"
  },
  "tags": ["string"],
  "isPublic": "boolean",
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

## Development

### Running Tests
```bash
go test ./...
```

### Building for Production
```bash
go build -o bin/server cmd/main.go
```

### Docker Development
```bash
# Build image
docker build -t genart-backend .

# Run container
docker run -p 8080:8080 genart-backend
```

## Performance

- **MongoDB Indexing** for optimized queries
- **Connection Pooling** for database efficiency
- **JWT Caching** for reduced auth overhead
- **Middleware Optimization** for request processing
- **WebSocket Scaling** for real-time features

## Security

- **Password Hashing** with bcrypt
- **JWT Token Validation** on protected routes
- **Input Sanitization** and validation
- **CORS Configuration** for cross-origin requests
- **Rate Limiting** (configurable)

## Monitoring

- **Health Check** endpoint at `/health`
- **Structured Logging** with configurable levels
- **Error Tracking** and reporting
- **Performance Metrics** collection

## Deployment

### Docker Compose
```bash
docker-compose up -d
```

### Cloud Deployment
- Compatible with AWS, GCP, Azure
- Railway, Render, Heroku ready
- Environment-based configuration

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
