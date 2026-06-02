# Fashion Marketplace - Authentication Service

Enterprise-grade authentication and authorization service for the Fashion Marketplace platform.

## Features

- **User Authentication**
  - Registration with email verification
  - Login with JWT tokens (access + refresh)
  - Password reset via OTP
  - Account lockout after failed attempts

- **Security**
  - Argon2id password hashing
  - JWT-based authentication
  - CSRF protection
  - Rate limiting
  - Device fingerprinting
  - Session management

- **Authorization**
  - Role-Based Access Control (RBAC)
  - Permission-based access control
  - Vendor ownership validation

- **Two-Factor Authentication (2FA)**
  - TOTP-based 2FA setup
  - QR code generation
  - Backup codes

- **Fraud Detection**
  - Failed login attempt tracking
  - Suspicious activity monitoring
  - IP/device blocking

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Databases**: PostgreSQL, MongoDB, Redis
- **Authentication**: JWT, Argon2
- **Validation**: Joi

## Installation

```bash
cd services/auth-service
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `MONGODB_URI`: MongoDB connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: JWT signing secret
- `NODE_ENV`: Environment (development/production)

## Running the Service

```bash
# Development
npm run dev

# Production
npm start

# Test
npm test
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password
- `POST /api/v1/auth/change-password` - Change password
- `POST /api/v1/auth/verify-email` - Verify email
- `GET /api/v1/auth/me` - Get current user
- `PUT /api/v1/auth/me` - Update profile
- `DELETE /api/v1/auth/me` - Delete account

### Sessions
- `GET /api/v1/sessions/list` - List active sessions
- `DELETE /api/v1/sessions/:id` - Revoke session
- `DELETE /api/v1/sessions` - Revoke all other sessions

### Two-Factor Auth
- `POST /api/v1/2fa/setup` - Setup 2FA
- `POST /api/v1/2fa/verify` - Verify 2FA setup
- `POST /api/v1/2fa/disable` - Disable 2FA

### Health Checks
- `GET /api/v1/health/live` - Liveness probe
- `GET /api/v1/health/ready` - Readiness probe
- `GET /api/v1/health/db` - Database health
- `GET /api/v1/health/stats` - Service statistics

## Database Schema

See `database/schema.sql` for complete database schema.

## Security Considerations

1. Always use HTTPS in production
2. Rotate JWT secrets regularly
3. Monitor failed login attempts
4. Implement proper CORS policies
5. Use secure cookie settings
6. Regular security audits

## License

Proprietary - Fashion Marketplace
