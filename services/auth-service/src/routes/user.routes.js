import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/users/profile
 * @desc    Get user profile (alias for /auth/me)
 * @access  Private
 */
router.get('/profile', asyncHandler(async (req, res) => {
  // Handled by auth controller
  res.json({ message: 'Use /auth/me endpoint' });
}));

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update user profile (alias for /auth/me)
 * @access  Private
 */
router.put('/profile', asyncHandler(async (req, res) => {
  // Handled by auth controller
  res.json({ message: 'Use /auth/me endpoint' });
}));

/**
 * @route   GET /api/v1/users/sessions
 * @desc    Get active sessions for current user
 * @access  Private
 */
router.get('/sessions', asyncHandler(async (req, res) => {
  const { getPostgresPool } = await import('../config/database.js');
  const pool = getPostgresPool();
  
  const query = `
    SELECT id, device_id, device_info, ip_address, user_agent, created_at, expires_at
    FROM sessions
    WHERE user_id = $1 AND invalidated_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
  `;
  
  const result = await pool.query(query, [req.user.userId]);
  
  res.json({
    success: true,
    data: {
      sessions: result.rows.map(s => ({
        id: s.id,
        deviceId: s.device_id,
        deviceInfo: typeof s.device_info === 'string' ? JSON.parse(s.device_info) : s.device_info,
        ipAddress: s.ip_address,
        userAgent: s.user_agent,
        createdAt: s.created_at,
        expiresAt: s.expires_at,
      })),
    },
  });
}));

/**
 * @route   DELETE /api/v1/users/sessions/:sessionId
 * @desc    Revoke a specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId', asyncHandler(async (req, res) => {
  const { getPostgresPool } = await import('../config/database.js');
  const pool = getPostgresPool();
  
  const query = `
    UPDATE sessions 
    SET invalidated_at = NOW(), is_valid = FALSE 
    WHERE id = $1 AND user_id = $2
    RETURNING id
  `;
  
  const result = await pool.query(query, [req.params.sessionId, req.user.userId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
    });
  }
  
  res.json({
    success: true,
    message: 'Session revoked successfully',
  });
}));

/**
 * @route   DELETE /api/v1/users/sessions
 * @desc    Revoke all other sessions (keep current)
 * @access  Private
 */
router.delete('/sessions', asyncHandler(async (req, res) => {
  const { getPostgresPool } = await import('../config/database.js');
  const pool = getPostgresPool();
  
  const query = `
    UPDATE sessions 
    SET invalidated_at = NOW(), is_valid = FALSE 
    WHERE user_id = $1 AND id != $2 AND invalidated_at IS NULL
  `;
  
  await pool.query(query, [req.user.userId, req.user.sessionId]);
  
  res.json({
    success: true,
    message: 'All other sessions revoked successfully',
  });
}));

export default router;
