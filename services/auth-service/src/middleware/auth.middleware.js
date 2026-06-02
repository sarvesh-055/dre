import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { errors, AppError, StatusCodes, ErrorCodes } from '../utils/errors.js';
import { logger, logSecurityEvent } from '../utils/logger.js';

/**
 * Authentication Middleware
 * Verifies JWT access token and attaches user info to request
 */
export const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw errors.tokenInvalid();
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, config.jwt.accessTokenSecret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    
    // Attach user info to request
    req.user = {
      userId: decoded.userId || decoded.sub,
      email: decoded.email,
      role: decoded.role,
      sessionId: req.headers['x-session-id'] || null,
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw errors.tokenExpired();
    }
    if (error.name === 'JsonWebTokenError') {
      throw errors.tokenInvalid();
    }
    if (error instanceof AppError) {
      throw error;
    }
    
    logSecurityEvent('AUTHENTICATION_FAILED', {
      ip: req.ip,
      path: req.path,
      error: error.message,
    });
    
    throw errors.tokenInvalid();
  }
};

/**
 * Optional Authentication Middleware
 * Attaches user info if token is present, but doesn't require it
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      const decoded = jwt.verify(token, config.jwt.accessTokenSecret, {
        issuer: config.jwt.issuer,
        audience: config.jwt.audience,
      });
      
      req.user = {
        userId: decoded.userId || decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
    }
    
    next();
  } catch (error) {
    // Ignore authentication errors, proceed without user context
    next();
  }
};

/**
 * Role-Based Access Control Middleware
 * Checks if user has required role(s)
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw errors.accessDenied();
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        ip: req.ip,
      });
      
      throw errors.insufficientPermissions(`Required roles: ${allowedRoles.join(', ')}`);
    }
    
    next();
  };
};

/**
 * Permission-Based Access Control Middleware
 * Checks if user has required permission(s)
 */
export const requirePermission = (...requiredPermissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      throw errors.accessDenied();
    }
    
    try {
      const pool = await import('../config/database.js').then(m => m.getPostgresPool());
      
      // Get user permissions
      const query = `
        SELECT DISTINCT p.permission_name
        FROM users u
        JOIN roles r ON u.role_id = r.id
        JOIN role_permissions rp ON r.id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE u.id = $1 AND u.deleted_at IS NULL
      `;
      
      const result = await pool.query(query, [req.user.userId]);
      const userPermissions = result.rows.map(row => row.permission_name);
      
      // Check if user has all required permissions
      const hasAllPermissions = requiredPermissions.every(perm => 
        userPermissions.includes(perm)
      );
      
      if (!hasAllPermissions) {
        const missingPermissions = requiredPermissions.filter(
          perm => !userPermissions.includes(perm)
        );
        
        logSecurityEvent('PERMISSION_DENIED', {
          userId: req.user.userId,
          userPermissions,
          requiredPermissions,
          missingPermissions,
          path: req.path,
          ip: req.ip,
        });
        
        throw errors.insufficientPermissions(`Missing permissions: ${missingPermissions.join(', ')}`);
      }
      
      next();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Permission check failed:', error);
      throw errors.internalServerError('Failed to verify permissions');
    }
  };
};

/**
 * Vendor Ownership Middleware
 * Checks if the authenticated vendor owns the requested resource
 */
export const isVendorOwner = (resourceType) => {
  return async (req, res, next) => {
    if (!req.user || req.user.role !== 'vendor') {
      throw errors.accessDenied();
    }
    
    try {
      const pool = await import('../config/database.js').then(m => m.getPostgresPool());
      const resourceId = req.params[`${resourceType}Id`] || req.params.id;
      
      let query;
      let values;
      
      switch (resourceType) {
        case 'product':
          query = 'SELECT vendor_id FROM products WHERE id = $1 AND deleted_at IS NULL';
          values = [resourceId];
          break;
        case 'order':
          query = `
            SELECT o.vendor_id 
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE oi.id = $1 OR o.id = $1
            LIMIT 1
          `;
          values = [resourceId];
          break;
        default:
          throw errors.internalServerError(`Unknown resource type: ${resourceType}`);
      }
      
      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw errors.notFound(resourceType);
      }
      
      if (result.rows[0].vendor_id !== req.user.vendorId) {
        logSecurityEvent('VENDOR_OWNERSHIP_VIOLATION', {
          vendorId: req.user.vendorId,
          resourceId,
          resourceType,
          actualOwnerId: result.rows[0].vendor_id,
          ip: req.ip,
        });
        
        throw errors.accessDenied();
      }
      
      next();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Vendor ownership check failed:', error);
      throw errors.internalServerError('Failed to verify ownership');
    }
  };
};

/**
 * Rate Limit by User ID
 * Applies rate limiting based on authenticated user or IP
 */
export const userRateLimit = (limits) => {
  return async (req, res, next) => {
    const identifier = req.user ? `user:${req.user.userId}` : `ip:${req.ip}`;
    const redisClient = await import('../config/database.js').then(m => m.getRedisClient());
    
    const key = `ratelimit:${identifier}:${req.path}`;
    const count = await redisClient.incr(key);
    
    if (count === 1) {
      await redisClient.expire(key, limits.windowSeconds);
    }
    
    if (count > limits.maxRequests) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        identifier,
        path: req.path,
        count,
        limit: limits.maxRequests,
        ip: req.ip,
      });
      
      throw errors.rateLimitExceeded();
    }
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', limits.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limits.maxRequests - count));
    
    next();
  };
};

/**
 * Fresh Session Middleware
 * Ensures the session was created recently (for sensitive operations)
 */
export const requireFreshSession = (maxAgeMinutes = 15) => {
  return async (req, res, next) => {
    if (!req.user || !req.user.sessionId) {
      throw errors.sessionExpired();
    }
    
    try {
      const pool = await import('../config/database.js').then(m => m.getPostgresPool());
      
      const query = `
        SELECT created_at 
        FROM sessions 
        WHERE id = $1 AND invalidated_at IS NULL
      `;
      
      const result = await pool.query(query, [req.user.sessionId]);
      
      if (result.rows.length === 0) {
        throw errors.sessionExpired();
      }
      
      const sessionAge = Date.now() - new Date(result.rows[0].created_at).getTime();
      const maxAgeMs = maxAgeMinutes * 60 * 1000;
      
      if (sessionAge > maxAgeMs) {
        throw new AppError(
          'Session too old for this operation. Please login again.',
          StatusCodes.FORBIDDEN,
          'SESSION_TOO_OLD'
        );
      }
      
      next();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error('Fresh session check failed:', error);
      throw errors.internalServerError('Failed to verify session');
    }
  };
};

export default {
  authenticate,
  optionalAuth,
  authorize,
  requirePermission,
  isVendorOwner,
  userRateLimit,
  requireFreshSession,
};
