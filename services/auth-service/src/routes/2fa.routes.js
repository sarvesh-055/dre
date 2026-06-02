import { Router } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { errors } from '../utils/errors.js';
import { getPostgresPool } from '../config/database.js';

const router = Router();
router.use(authenticate);

/**
 * @route   POST /api/v1/2fa/setup
 * @desc    Setup 2FA for current user
 * @access  Private
 */
router.post('/setup', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const pool = getPostgresPool();
  
  // Check if 2FA already enabled
  const checkQuery = 'SELECT two_factor_enabled FROM users WHERE id = $1';
  const checkResult = await pool.query(checkQuery, [userId]);
  
  if (checkResult.rows[0].two_factor_enabled) {
    throw errors.validationError([{ field: '2fa', message: '2FA is already enabled', code: '2FA_ALREADY_ENABLED' }]);
  }
  
  // Generate 2FA secret
  const secret = speakeasy.generateSecret({
    name: `Fashion Marketplace (${req.user.email})`,
    issuer: 'Fashion Marketplace',
    length: 32,
  });
  
  // Store secret temporarily in Redis (pending verification)
  const { getRedisClient } = await import('../config/database.js');
  const redisClient = getRedisClient();
  await redisClient.setEx(`2fa:pending:${userId}`, 900, secret.base32); // 15 minutes
  
  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
  
  res.json({
    success: true,
    data: {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCode: qrCodeUrl,
    },
    message: 'Scan the QR code with your authenticator app',
  });
}));

/**
 * @route   POST /api/v1/2fa/verify
 * @desc    Verify 2FA setup with OTP
 * @access  Private
 */
router.post('/verify', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { otp } = req.body;
  
  if (!otp) {
    throw errors.validationError([{ field: 'otp', message: 'OTP is required', code: 'OTP_REQUIRED' }]);
  }
  
  // Get pending secret from Redis
  const { getRedisClient } = await import('../config/database.js');
  const redisClient = getRedisClient();
  const secret = await redisClient.get(`2fa:pending:${userId}`);
  
  if (!secret) {
    throw errors.validationError([{ field: '2fa', message: '2FA setup expired. Please start again.', code: '2FA_SETUP_EXPIRED' }]);
  }
  
  // Verify OTP
  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: otp,
    window: 2,
  });
  
  if (!verified) {
    throw errors.otpInvalid();
  }
  
  // Enable 2FA in database
  const pool = getPostgresPool();
  const updateQuery = `
    UPDATE users 
    SET two_factor_enabled = TRUE, two_factor_secret = $1, updated_at = NOW()
    WHERE id = $2
  `;
  await pool.query(updateQuery, [secret, userId]);
  
  // Clear pending setup
  await redisClient.del(`2fa:pending:${userId}`);
  
  res.json({
    success: true,
    message: '2FA enabled successfully',
  });
}));

/**
 * @route   POST /api/v1/2fa/disable
 * @desc    Disable 2FA
 * @access  Private (requires fresh session)
 */
router.post('/disable', asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { otp, password } = req.body;
  
  if (!password) {
    throw errors.validationError([{ field: 'password', message: 'Password is required', code: 'PASSWORD_REQUIRED' }]);
  }
  
  // Verify password
  const pool = getPostgresPool();
  const userQuery = 'SELECT password_hash, two_factor_secret FROM users WHERE id = $1';
  const userResult = await pool.query(userQuery, [userId]);
  
  if (userResult.rows.length === 0) {
    throw errors.userNotFound(userId);
  }
  
  const { verifyPassword } = await import('../utils/crypto.js');
  const isValidPassword = await verifyPassword(password, userResult.rows[0].password_hash);
  
  if (!isValidPassword) {
    throw errors.invalidCredentials();
  }
  
  // If 2FA is enabled, verify OTP
  if (userResult.rows[0].two_factor_secret) {
    if (!otp) {
      throw errors.validationError([{ field: 'otp', message: 'OTP is required to disable 2FA', code: 'OTP_REQUIRED' }]);
    }
    
    const verified = speakeasy.totp.verify({
      secret: userResult.rows[0].two_factor_secret,
      encoding: 'base32',
      token: otp,
      window: 2,
    });
    
    if (!verified) {
      throw errors.otpInvalid();
    }
  }
  
  // Disable 2FA
  const updateQuery = `
    UPDATE users 
    SET two_factor_enabled = FALSE, two_factor_secret = NULL, updated_at = NOW()
    WHERE id = $1
  `;
  await pool.query(updateQuery, [userId]);
  
  res.json({
    success: true,
    message: '2FA disabled successfully',
  });
}));

export default router;
