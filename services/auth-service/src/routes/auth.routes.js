import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as authController from '../controllers/auth.controller.js';
import { validateRequest } from '../validators/auth.validator.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user (customer)
 * @access  Public
 */
router.post('/register', validateRequest('register'), asyncHandler(authController.register));

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user with email/password
 * @access  Public
 */
router.post('/login', validateRequest('login'), asyncHandler(authController.login));

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout user and invalidate tokens
 * @access  Private
 */
router.post('/logout', asyncHandler(authController.logout));

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token using refresh token
 * @access  Public (requires valid refresh token)
 */
router.post('/refresh-token', asyncHandler(authController.refreshToken));

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset OTP
 * @access  Public
 */
router.post('/forgot-password', validateRequest('forgotPassword'), asyncHandler(authController.forgotPassword));

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with OTP
 * @access  Public
 */
router.post('/reset-password', validateRequest('resetPassword'), asyncHandler(authController.resetPassword));

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password for authenticated user
 * @access  Private
 */
router.post('/change-password', asyncHandler(authController.changePassword));

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email address with OTP
 * @access  Public
 */
router.post('/verify-email', validateRequest('verifyEmail'), asyncHandler(authController.verifyEmail));

/**
 * @route   POST /api/v1/auth/resend-verification
 * @desc    Resend email verification OTP
 * @access  Public
 */
router.post('/resend-verification', validateRequest('resendVerification'), asyncHandler(authController.resendVerification));

/**
 * @route   POST /api/v1/auth/verify-phone
 * @desc    Verify phone number with OTP
 * @access  Public
 */
router.post('/verify-phone', validateRequest('verifyPhone'), asyncHandler(authController.verifyPhone));

/**
 * @route   GET  /api/v1/auth/me
 * @desc    Get current authenticated user
 * @access  Private
 */
router.get('/me', asyncHandler(authController.getCurrentUser));

/**
 * @route   PUT  /api/v1/auth/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', asyncHandler(authController.updateCurrentUser));

/**
 * @route   DELETE /api/v1/auth/me
 * @desc    Delete current user account (soft delete)
 * @access  Private
 */
router.delete('/me', asyncHandler(authController.deleteAccount));

export default router;
