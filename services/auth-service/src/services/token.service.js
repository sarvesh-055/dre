import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import DeviceDetector from 'device-detector-js';
import { getPostgresPool, getRedisClient } from '../config/database.js';
import { config } from '../config/index.js';
import { hashPassword, verifyPassword, generateSecureRandom } from '../utils/crypto.js';
import { errors, AppError, StatusCodes, ErrorCodes } from '../utils/errors.js';
import { logger, logAuthEvent, logFraudEvent, logSecurityEvent } from '../utils/logger.js';
import { maskEmail, maskPhone } from '../utils/crypto.js';

/**
 * Generate JWT Access Token
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.accessTokenSecret, {
    expiresIn: config.jwt.accessTokenExpiry,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    subject: payload.userId.toString(),
  });
};

/**
 * Generate JWT Refresh Token
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.refreshTokenSecret, {
    expiresIn: config.jwt.refreshTokenExpiry,
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    subject: payload.userId.toString(),
  });
};

/**
 * Verify JWT Token
 */
export const verifyToken = (token, type = 'access') => {
  try {
    const secret = type === 'access' ? config.jwt.accessTokenSecret : config.jwt.refreshTokenSecret;
    const decoded = jwt.verify(token, secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    });
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw type === 'access' ? errors.tokenExpired() : errors.refreshTokenExpired();
    }
    if (error.name === 'JsonWebTokenError') {
      throw errors.tokenInvalid();
    }
    throw error;
  }
};

/**
 * Decode JWT Token without verification (for debugging)
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};

/**
 * Get user ID from token
 */
export const getUserIdFromToken = (token) => {
  const decoded = decodeToken(token);
  return decoded?.sub || decoded?.userId;
};

/**
 * Generate OTP
 */
export const generateOTP = () => {
  const length = config.otp.length;
  const otp = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  return otp;
};

/**
 * Store OTP in Redis
 */
export const storeOTP = async (identifier, otp, type = 'email') => {
  const redisClient = getRedisClient();
  const key = `otp:${type}:${identifier}`;
  const expirySeconds = config.otp.expiryMinutes * 60;
  
  await redisClient.setEx(key, expirySeconds, otp);
  
  // Store attempt count
  const attemptKey = `otp:attempts:${type}:${identifier}`;
  await redisClient.setEx(attemptKey, expirySeconds, '0');
  
  logger.debug('OTP stored', { identifier: maskIdentifier(identifier, type), type });
};

/**
 * Verify OTP
 */
export const verifyOTP = async (identifier, otp, type = 'email') => {
  const redisClient = getRedisClient();
  const key = `otp:${type}:${identifier}`;
  const attemptKey = `otp:attempts:${type}:${identifier}`;
  
  const storedOtp = await redisClient.get(key);
  
  if (!storedOtp) {
    throw errors.otpExpired();
  }
  
  // Check attempt count
  const attempts = parseInt(await redisClient.get(attemptKey) || '0', 10);
  if (attempts >= config.otp.maxAttempts) {
    await redisClient.del(key);
    await redisClient.del(attemptKey);
    throw errors.otpMaxAttemptsExceeded();
  }
  
  if (storedOtp !== otp) {
    // Increment attempt count
    await redisClient.set(attemptKey, (attempts + 1).toString());
    throw errors.otpInvalid();
  }
  
  // OTP verified successfully, delete it
  await redisClient.del(key);
  await redisClient.del(attemptKey);
  
  return true;
};

/**
 * Resend OTP
 */
export const resendOTP = async (identifier, type = 'email') => {
  const redisClient = getRedisClient();
  const key = `otp:${type}:${identifier}`;
  
  // Check if OTP exists and was recently sent (within 1 minute)
  const ttl = await redisClient.ttl(key);
  if (ttl > 0 && ttl > (config.otp.expiryMinutes * 60 - 60)) {
    throw new AppError(
      'Please wait before requesting a new OTP',
      StatusCodes.BAD_REQUEST,
      'OTP_TOO_FREQUENT'
    );
  }
  
  // Delete old OTP
  if (ttl > 0) {
    await redisClient.del(key);
  }
  
  // Reset attempt counter
  const attemptKey = `otp:attempts:${type}:${identifier}`;
  await redisClient.del(attemptKey);
  
  return true;
};

/**
 * Detect device information from user agent
 */
export const detectDevice = (userAgent) => {
  const deviceDetector = new DeviceDetector();
  const device = deviceDetector.parse(userAgent || '');
  
  return {
    deviceId: generateSecureRandom(16),
    deviceType: device.device.type || 'desktop',
    deviceBrand: device.device.brand || 'Unknown',
    deviceModel: device.device.model || 'Unknown',
    osName: device.os.name || 'Unknown',
    osVersion: device.os.version || 'Unknown',
    browserName: device.client.name || 'Unknown',
    browserVersion: device.client.version || 'Unknown',
    userAgent: userAgent || '',
  };
};

/**
 * Create session record in PostgreSQL
 */
export const createSession = async (sessionData) => {
  const pool = getPostgresPool();
  const sessionId = uuidv4();
  
  const query = `
    INSERT INTO sessions (
      id, user_id, refresh_token, device_id, device_info, 
      ip_address, user_agent, expires_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id, user_id, device_id, created_at
  `;
  
  const values = [
    sessionId,
    sessionData.userId,
    sessionData.refreshToken,
    sessionData.deviceId,
    JSON.stringify(sessionData.deviceInfo),
    sessionData.ipAddress,
    sessionData.userAgent,
    sessionData.expiresAt,
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Invalidate session
 */
export const invalidateSession = async (sessionId) => {
  const pool = getPostgresPool();
  
  const query = `
    UPDATE sessions 
    SET invalidated_at = NOW(), is_valid = FALSE 
    WHERE id = $1
  `;
  
  await pool.query(query, [sessionId]);
};

/**
 * Invalidate all sessions for a user
 */
export const invalidateAllUserSessions = async (userId) => {
  const pool = getPostgresPool();
  
  const query = `
    UPDATE sessions 
    SET invalidated_at = NOW(), is_valid = FALSE 
    WHERE user_id = $1 AND invalidated_at IS NULL
  `;
  
  await pool.query(query, [userId]);
};

/**
 * Get active sessions for a user
 */
export const getUserSessions = async (userId) => {
  const pool = getPostgresPool();
  
  const query = `
    SELECT id, device_id, device_info, ip_address, user_agent, created_at, expires_at
    FROM sessions
    WHERE user_id = $1 AND invalidated_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 10
  `;
  
  const result = await pool.query(query, [userId]);
  return result.rows;
};

/**
 * Check concurrent session limit
 */
export const checkConcurrentSessions = async (userId) => {
  const sessions = await getUserSessions(userId);
  
  if (sessions.length >= config.session.maxConcurrentSessions) {
    // Invalidate oldest session
    const oldestSession = sessions[sessions.length - 1];
    await invalidateSession(oldestSession.id);
    logger.info('Invalidated oldest session due to concurrent session limit', {
      userId,
      sessionId: oldestSession.id,
    });
  }
};

/**
 * Mask identifier for logging
 */
const maskIdentifier = (identifier, type) => {
  if (type === 'email') {
    return maskEmail(identifier);
  } else if (type === 'phone') {
    return maskPhone(identifier);
  }
  return identifier;
};

/**
 * Generate CSRF token for session
 */
export const generateCsrfTokenForSession = async (sessionId) => {
  const crypto = require('crypto');
  const redisClient = getRedisClient();
  
  const token = crypto.randomBytes(32).toString('hex');
  const key = `csrf:${sessionId}`;
  
  await redisClient.setEx(key, 3600, token); // 1 hour expiry
  
  return token;
};

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  getUserIdFromToken,
  generateOTP,
  storeOTP,
  verifyOTP,
  resendOTP,
  detectDevice,
  createSession,
  invalidateSession,
  invalidateAllUserSessions,
  getUserSessions,
  checkConcurrentSessions,
  generateCsrfTokenForSession,
};
