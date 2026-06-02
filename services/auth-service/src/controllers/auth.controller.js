import { getPostgresPool } from '../config/database.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../utils/crypto.js';
import { errors, AppError, StatusCodes } from '../utils/errors.js';
import { logger, logAuthEvent, logSecurityEvent } from '../utils/logger.js';
import * as tokenService from '../services/token.service.js';
import { config } from '../config/index.js';

export const register = async (req, res) => {
  const { email, password, firstName, lastName, phone } = req.body;
  const pool = getPostgresPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const emailCheckQuery = 'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL';
    const emailCheckResult = await client.query(emailCheckQuery, [email.toLowerCase()]);
    
    if (emailCheckResult.rows.length > 0) {
      throw errors.emailAlreadyExists(email);
    }
    
    const passwordStrength = validatePasswordStrength(password);
    if (!passwordStrength.isValid) {
      throw errors.validationError([{ field: 'password', message: passwordStrength.message, code: 'WEAK_PASSWORD' }]);
    }
    
    const hashedPassword = await hashPassword(password);
    const roleQuery = "SELECT id FROM roles WHERE name = 'customer'";
    const roleResult = await client.query(roleQuery);
    
    if (roleResult.rows.length === 0) {
      throw errors.internalServerError('Default customer role not found');
    }
    
    const createUserQuery = `
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, email_verified, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING id, email, first_name, last_name, email_verified, is_active, created_at
    `;
    
    const userResult = await client.query(createUserQuery, [
      email.toLowerCase(), hashedPassword, firstName, lastName, phone || null,
      roleResult.rows[0].id, false, true
    ]);
    const user = userResult.rows[0];
    
    const otp = tokenService.generateOTP();
    await tokenService.storeOTP(user.email, otp, 'email');
    
    await client.query('COMMIT');
    logAuthEvent('USER_REGISTERED', user.id, { email: user.email });
    
    const accessToken = tokenService.generateAccessToken({ userId: user.id, email: user.email, role: 'customer' });
    const refreshToken = tokenService.generateRefreshToken({ userId: user.id, email: user.email, role: 'customer' });
    const deviceInfo = tokenService.detectDevice(req.get('user-agent'));
    
    await tokenService.createSession({
      userId: user.id, refreshToken, deviceId: deviceInfo.deviceId, deviceInfo,
      ipAddress: req.ip, userAgent: req.get('user-agent') || '',
      expiresAt: new Date(Date.now() + config.session.absoluteTimeout),
    });
    
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite,
      maxAge: config.session.absoluteTimeout, path: '/api/v1/auth',
    });
    
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      data: {
        user: {
          id: user.id, email: user.email, firstName: user.first_name,
          lastName: user.last_name, emailVerified: user.email_verified,
        },
        accessToken, requiresEmailVerification: true,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (!(error instanceof AppError)) {
      logger.error('Registration failed:', error);
      throw errors.internalServerError('Failed to register user');
    }
    throw error;
  } finally {
    client.release();
  }
};

export const login = async (req, res) => {
  const { email, password, rememberMe } = req.body;
  const pool = getPostgresPool();
  
  try {
    const findUserQuery = `
      SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, 
             u.email_verified, u.is_active, u.is_locked, u.failed_login_attempts,
             u.locked_until, r.name as role_name
      FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.email = $1 AND u.deleted_at IS NULL
    `;
    
    const result = await pool.query(findUserQuery, [email.toLowerCase()]);
    
    if (result.rows.length === 0) {
      logSecurityEvent('LOGIN_FAILED_USER_NOT_FOUND', { email, ip: req.ip });
      throw errors.invalidCredentials();
    }
    
    const user = result.rows[0];
    
    if (user.is_locked && user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError(`Account locked until ${new Date(user.locked_until).toISOString()}`, StatusCodes.FORBIDDEN, 'USER_LOCKED');
    }
    
    if (!user.is_active) throw errors.userDisabled();
    
    const isValidPassword = await verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      let lockedUntil = null, isLocked = false;
      
      if (newAttempts >= config.fraud.maxLoginAttempts) {
        lockedUntil = new Date(Date.now() + config.fraud.lockoutDurationMinutes * 60000);
        isLocked = true;
        logSecurityEvent('ACCOUNT_LOCKED', { userId: user.id, email, attempts: newAttempts });
      }
      
      await pool.query(
        'UPDATE users SET failed_login_attempts = $1, locked_until = $2, is_locked = $3 WHERE id = $4',
        [newAttempts, lockedUntil, isLocked, user.id]
      );
      logSecurityEvent('LOGIN_FAILED_INVALID_PASSWORD', { userId: user.id, attempts: newAttempts });
      throw errors.invalidCredentials();
    }
    
    if (user.failed_login_attempts > 0) {
      await pool.query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, is_locked = FALSE WHERE id = $1', [user.id]);
    }
    
    const accessToken = tokenService.generateAccessToken({ userId: user.id, email: user.email, role: user.role_name });
    const refreshToken = tokenService.generateRefreshToken({ userId: user.id, email: user.email, role: user.role_name });
    const deviceInfo = tokenService.detectDevice(req.get('user-agent'));
    
    await tokenService.checkConcurrentSessions(user.id);
    
    const expiresAt = rememberMe ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : new Date(Date.now() + config.session.absoluteTimeout);
    const session = await tokenService.createSession({
      userId: user.id, refreshToken, deviceId: deviceInfo.deviceId, deviceInfo,
      ipAddress: req.ip, userAgent: req.get('user-agent') || '', expiresAt,
    });
    
    const csrfToken = await tokenService.generateCsrfTokenForSession(session.id);
    
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite,
      maxAge: expiresAt.getTime() - Date.now(), path: '/api/v1/auth',
    });
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, secure: config.cookieSecure, sameSite: config.cookieSameSite,
      maxAge: 3600000, path: '/',
    });
    
    logAuthEvent('USER_LOGGED_IN', user.id, { email, deviceId: deviceInfo.deviceId });
    
    res.status(StatusCodes.OK).json({
      success: true, message: 'Login successful',
      data: {
        user: { id: user.id, email, firstName: user.first_name, lastName: user.last_name, emailVerified: user.email_verified, role: user.role_name },
        accessToken, csrfToken, sessionId: session.id,
      },
    });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('Login failed:', error);
      throw errors.internalServerError('Failed to login');
    }
    throw error;
  }
};

export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken && req.user?.sessionId) {
      await tokenService.invalidateSession(req.user.sessionId);
    }
    
    res.clearCookie('refresh_token', { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/api/v1/auth' });
    res.clearCookie('csrf_token', { httpOnly: false, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/' });
    
    if (req.user) logAuthEvent('USER_LOGGED_OUT', req.user.userId);
    
    res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    logger.error('Logout failed:', error);
    throw errors.internalServerError('Failed to logout');
  }
};

export const refreshToken = async (req, res) => {
  const refreshToken = req.cookies?.refresh_token || req.body?.refreshToken;
  if (!refreshToken) throw errors.refreshTokenExpired();
  
  try {
    const decoded = tokenService.verifyToken(refreshToken, 'refresh');
    const pool = getPostgresPool();
    
    const result = await pool.query(
      'SELECT s.id, s.user_id, s.expires_at, s.invalidated_at, u.is_active FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.refresh_token = $1',
      [refreshToken]
    );
    
    if (result.rows.length === 0 || result.rows[0].invalidated_at || new Date(result.rows[0].expires_at) < new Date() || !result.rows[0].is_active) {
      throw errors.sessionExpired();
    }
    
    const newAccessToken = tokenService.generateAccessToken({ userId: decoded.userId, email: decoded.email, role: decoded.role });
    res.json({ success: true, data: { accessToken: newAccessToken } });
  } catch (error) {
    res.clearCookie('refresh_token', { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/api/v1/auth' });
    throw error instanceof AppError ? error : errors.refreshTokenExpired();
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const pool = getPostgresPool();
  
  try {
    const result = await pool.query('SELECT id, email, is_active FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    
    if (result.rows.length > 0 && result.rows[0].is_active) {
      const otp = tokenService.generateOTP();
      await tokenService.storeOTP(result.rows[0].email, otp, 'password_reset');
      logAuthEvent('PASSWORD_RESET_REQUESTED', result.rows[0].id);
    }
    
    res.json({ success: true, message: 'If the email exists, you will receive a password reset OTP' });
  } catch (error) {
    logger.error('Forgot password failed:', error);
    throw errors.internalServerError('Failed to process password reset request');
  }
};

export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const pool = getPostgresPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    await tokenService.verifyOTP(email.toLowerCase(), otp, 'password_reset');
    
    const result = await client.query('SELECT id, email, is_active FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    if (result.rows.length === 0 || !result.rows[0].is_active) throw errors.userNotFound(email);
    
    const passwordStrength = validatePasswordStrength(newPassword);
    if (!passwordStrength.isValid) {
      throw errors.validationError([{ field: 'newPassword', message: passwordStrength.message, code: 'WEAK_PASSWORD' }]);
    }
    
    const hashedPassword = await hashPassword(newPassword);
    await client.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, result.rows[0].id]);
    await tokenService.invalidateAllUserSessions(result.rows[0].id);
    
    await client.query('COMMIT');
    logAuthEvent('PASSWORD_RESET_COMPLETED', result.rows[0].id);
    
    res.clearCookie('refresh_token', { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/api/v1/auth' });
    res.json({ success: true, message: 'Password reset successful. Please login with your new password.' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (!(error instanceof AppError)) {
      logger.error('Reset password failed:', error);
      throw errors.internalServerError('Failed to reset password');
    }
    throw error;
  } finally {
    client.release();
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;
  const pool = getPostgresPool();
  
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
    if (result.rows.length === 0) throw errors.userNotFound(userId);
    
    const isValidPassword = await verifyPassword(currentPassword, result.rows[0].password_hash);
    if (!isValidPassword) throw errors.invalidCredentials();
    
    const passwordStrength = validatePasswordStrength(newPassword);
    if (!passwordStrength.isValid) {
      throw errors.validationError([{ field: 'newPassword', message: passwordStrength.message, code: 'WEAK_PASSWORD' }]);
    }
    
    const hashedPassword = await hashPassword(newPassword);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedPassword, userId]);
    await tokenService.invalidateAllUserSessions(userId);
    
    logAuthEvent('PASSWORD_CHANGED', userId);
    res.json({ success: true, message: 'Password changed successfully. Please login again.' });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('Change password failed:', error);
      throw errors.internalServerError('Failed to change password');
    }
    throw error;
  }
};

export const verifyEmail = async (req, res) => {
  const { email, otp } = req.body;
  const pool = getPostgresPool();
  
  try {
    await tokenService.verifyOTP(email.toLowerCase(), otp, 'email');
    
    const result = await pool.query('SELECT id, email_verified FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    if (result.rows.length === 0) throw errors.userNotFound(email);
    
    if (!result.rows[0].email_verified) {
      await pool.query('UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1', [result.rows[0].id]);
    }
    
    logAuthEvent('EMAIL_VERIFIED', result.rows[0].id);
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('Email verification failed:', error);
      throw errors.internalServerError('Failed to verify email');
    }
    throw error;
  }
};

export const resendVerification = async (req, res) => {
  const { email } = req.body;
  const pool = getPostgresPool();
  
  try {
    const result = await pool.query('SELECT id, email, email_verified FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase()]);
    if (result.rows.length === 0) throw errors.userNotFound(email);
    
    if (result.rows[0].email_verified) {
      return res.json({ success: true, message: 'Email is already verified' });
    }
    
    await tokenService.resendOTP(result.rows[0].email, 'email');
    const otp = tokenService.generateOTP();
    await tokenService.storeOTP(result.rows[0].email, otp, 'email');
    
    res.json({ success: true, message: 'Verification OTP sent to your email' });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('Resend verification failed:', error);
      throw errors.internalServerError('Failed to resend verification');
    }
    throw error;
  }
};

export const getCurrentUser = async (req, res) => {
  const userId = req.user.userId;
  const pool = getPostgresPool();
  
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.date_of_birth, u.gender,
             u.email_verified, u.phone_verified, u.is_active, u.avatar_url, r.name as role_name,
             u.created_at, u.updated_at
      FROM users u JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `, [userId]);
    
    if (result.rows.length === 0) throw errors.userNotFound(userId);
    const user = result.rows[0];
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
          phone: user.phone, dateOfBirth: user.date_of_birth, gender: user.gender,
          emailVerified: user.email_verified, phoneVerified: user.phone_verified,
          isActive: user.is_active, avatarUrl: user.avatar_url, role: user.role_name,
          createdAt: user.created_at, updatedAt: user.updated_at,
        },
      },
    });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('Get current user failed:', error);
      throw errors.internalServerError('Failed to get user details');
    }
    throw error;
  }
};

export const updateCurrentUser = async (req, res) => {
  const userId = req.user.userId;
  const updates = req.body;
  const pool = getPostgresPool();
  
  try {
    const allowedFields = ['first_name', 'last_name', 'phone', 'date_of_birth', 'gender'];
    const updateFields = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, value] of Object.entries(updates)) {
      const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbField)) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (updateFields.length === 0) {
      throw errors.validationError([{ field: 'body', message: 'No valid fields to update', code: 'NO_UPDATES' }]);
    }
    
    updateFields.push('updated_at = NOW()');
    values.push(userId);
    
    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL
       RETURNING id, email, first_name, last_name, phone, date_of_birth, gender, updated_at`,
      values
    );
    
    if (result.rows.length === 0) throw errors.userNotFound(userId);
    const user = result.rows[0];
    
    logAuthEvent('PROFILE_UPDATED', userId);
    res.json({
      success: true, message: 'Profile updated successfully',
      data: {
        user: {
          id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name,
          phone: user.phone, dateOfBirth: user.date_of_birth, gender: user.gender,
          updatedAt: user.updated_at,
        },
      },
    });
  } catch (error) {
    if (!(error instanceof AppError)) {
      logger.error('Update profile failed:', error);
      throw errors.internalServerError('Failed to update profile');
    }
    throw error;
  }
};

export const deleteAccount = async (req, res) => {
  const userId = req.user.userId;
  const pool = getPostgresPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const result = await client.query(
      `UPDATE users SET deleted_at = NOW(), email = CONCAT(email, '_deleted_', id), is_active = FALSE
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [userId]
    );
    
    if (result.rows.length === 0) throw errors.userNotFound(userId);
    
    await tokenService.invalidateAllUserSessions(userId);
    await client.query('COMMIT');
    
    logAuthEvent('ACCOUNT_DELETED', userId);
    
    res.clearCookie('refresh_token', { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/api/v1/auth' });
    res.clearCookie('csrf_token', { httpOnly: false, secure: config.cookieSecure, sameSite: config.cookieSameSite, path: '/' });
    
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    if (!(error instanceof AppError)) {
      logger.error('Delete account failed:', error);
      throw errors.internalServerError('Failed to delete account');
    }
    throw error;
  } finally {
    client.release();
  }
};

export default {
  register, login, logout, refreshToken, forgotPassword, resetPassword,
  changePassword, verifyEmail, resendVerification, getCurrentUser,
  updateCurrentUser, deleteAccount,
};
