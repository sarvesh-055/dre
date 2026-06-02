import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All vendor routes require authentication and vendor role
router.use(authenticate);
router.use(authorize('vendor', 'admin'));

/**
 * @route   GET /api/v1/vendors/me
 * @desc    Get current vendor profile
 * @access  Private (Vendor/Admin)
 */
router.get('/me', asyncHandler(async (req, res) => {
  const { getPostgresPool } = await import('../config/database.js');
  const pool = getPostgresPool();
  
  const query = `
    SELECT v.*, u.email, u.first_name, u.last_name
    FROM vendors v
    JOIN users u ON v.user_id = u.id
    WHERE v.user_id = $1 AND v.deleted_at IS NULL
  `;
  
  const result = await pool.query(query, [req.user.userId]);
  
  if (result.rows.length === 0) {
    return res.status(404).json({
      success: false,
      error: { code: 'VENDOR_NOT_FOUND', message: 'Vendor profile not found' },
    });
  }
  
  res.json({
    success: true,
    data: { vendor: result.rows[0] },
  });
}));

export default router;
