import { Router } from 'express';
import { authenticate, authorize, requirePermission } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// All RBAC routes require admin role
router.use(authenticate);
router.use(authorize('admin'));

/**
 * @route   GET /api/v1/rbac/roles
 * @desc    Get all roles
 * @access  Private (Admin only)
 */
router.get('/roles', asyncHandler(async (req, res) => {
  const { getPostgresPool } = await import('../config/database.js');
  const pool = getPostgresPool();
  
  const query = `
    SELECT r.*, 
           COUNT(rp.permission_id) as permission_count,
           COUNT(u.id) as user_count
    FROM roles r
    LEFT JOIN role_permissions rp ON r.id = rp.role_id
    LEFT JOIN users u ON r.id = u.role_id AND u.deleted_at IS NULL
    GROUP BY r.id
    ORDER BY r.created_at
  `;
  
  const result = await pool.query(query);
  
  res.json({
    success: true,
    data: { roles: result.rows },
  });
}));

/**
 * @route   GET /api/v1/rbac/permissions
 * @desc    Get all permissions
 * @access  Private (Admin only)
 */
router.get('/permissions', asyncHandler(async (req, res) => {
  const { getPostgresPool } = await import('../config/database.js');
  const pool = getPostgresPool();
  
  const query = 'SELECT * FROM permissions ORDER BY resource, action';
  const result = await pool.query(query);
  
  res.json({
    success: true,
    data: { permissions: result.rows },
  });
}));

export default router;
