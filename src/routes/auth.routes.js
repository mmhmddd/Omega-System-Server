// src/routes/auth.routes.js (UPDATED - Add this to your existing file)

const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const { protect } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/auth/login
 * @desc    Login user with username and password
 * @access  Public
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Login user - authService now handles JWT generation with systemAccess and routeAccess
    const result = await authService.login(username, password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const result = await authService.forgotPassword(email);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password using token
 * @access  Public
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const result = await authService.resetPassword(token, newPassword);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password for logged in user
 * @access  Protected
 */
router.post('/change-password', protect, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const result = await authService.changePassword(
      req.user.id,
      currentPassword,
      newPassword
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user data
 * @access  Protected
 */
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user.id);

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/auth/verify-token
 * @desc    Verify reset token validity
 * @access  Public
 */
router.get('/verify-token/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    const isValid = await authService.verifyResetToken(token);

    res.status(200).json({
      success: true,
      data: { valid: isValid }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ NEW ENDPOINT
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh JWT token with latest user permissions
 * @access  Protected
 */
router.post('/refresh-token', protect, async (req, res, next) => {
  try {


    // Get fresh user data and generate new token
    const result = await authService.refreshToken(req.user.id);



    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: result
    });
  } catch (error) {
    console.log('==========================================');
    console.error('❌ TOKEN REFRESH ERROR');
    console.error('Error:', error.message);
    console.log('==========================================');
    next(error);
  }
});

module.exports = router;