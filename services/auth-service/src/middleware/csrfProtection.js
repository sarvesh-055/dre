import crypto from 'crypto';
import { getRedisClient } from '../config/database.js';
import { errors, AppError, StatusCodes, ErrorCodes } from '../utils/errors.js';
import { logger, logSecurityEvent } from '../utils/logger.js';
import { config } from '../config/index.js';

/**
 * CSRF Protection Middleware
 * Validates CSRF tokens for state-changing requests
 */
export const csrfProtection = async (req, res, next) => {
  // Skip CSRF check for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip CSRF check for API routes that use JWT authentication
  // JWT tokens are not vulnerable to CSRF
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return next();
  }
  
  // For cookie-based sessions, validate CSRF token
  const csrfToken = req.headers['x-csrf-token'] || req.body._csrf || req.query._csrf;
  const sessionToken = req.cookies?.csrf_token;
  
  if (!csrfToken || !sessionToken) {
    logSecurityEvent('CSRF_TOKEN_MISSING', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    
    // For API clients, allow requests without CSRF if they don't have cookies
    // This prevents breaking legitimate API calls
    if (!req.cookies || Object.keys(req.cookies).length === 0) {
      return next();
    }
    
    return next(errors.accessDenied());
  }
  
  // Validate token match
  if (csrfToken !== sessionToken) {
    logSecurityEvent('CSRF_TOKEN_MISMATCH', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    
    return next(errors.accessDenied());
  }
  
  next();
};

/**
 * Generate CSRF Token
 * Creates a cryptographically secure token and stores it in Redis
 */
export const generateCsrfToken = async (sessionId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const redisKey = `csrf:${sessionId}`;
  
  try {
    const redisClient = getRedisClient();
    await redisClient.setEx(redisKey, 3600, token); // 1 hour expiry
    return token;
  } catch (error) {
    logger.error('Failed to generate CSRF token:', error);
    throw errors.internalServerError('Failed to generate security token');
  }
};

/**
 * Validate CSRF Token
 * Checks if the token exists and matches
 */
export const validateCsrfToken = async (sessionId, token) => {
  const redisKey = `csrf:${sessionId}`;
  
  try {
    const redisClient = getRedisClient();
    const storedToken = await redisClient.get(redisKey);
    
    if (!storedToken || storedToken !== token) {
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error('Failed to validate CSRF token:', error);
    return false;
  }
};

/**
 * Revoke CSRF Token
 * Removes the token from Redis
 */
export const revokeCsrfToken = async (sessionId) => {
  const redisKey = `csrf:${sessionId}`;
  
  try {
    const redisClient = getRedisClient();
    await redisClient.del(redisKey);
  } catch (error) {
    logger.error('Failed to revoke CSRF token:', error);
  }
};

export default {
  csrfProtection,
  generateCsrfToken,
  validateCsrfToken,
  revokeCsrfToken,
};
