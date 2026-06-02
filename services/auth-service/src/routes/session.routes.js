import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
router.use(authenticate);

/**
 * @route   GET /api/v1/sessions/list
 * @desc    Get all active sessions for current user
 * @access  Private
 */
router.get('/list', asyncHandler(async (req, res) => {
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
        isCurrent: s.id === req.user.sessionId,
      })),
    },
  });
}));

export default router;
