// src/routes/auth.routes.js (UPDATED - Phone-based Login)

const express = require('express');
const router = express.Router();
const authService = require('../services/auth.service');
const { protect } = require('../middleware/auth.middleware');

/**
 * @route   POST /api/auth/login
 * @desc    Login user with phone and password
 * @access  Public
 */
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;

    console.log('==========================================');
    console.log('📞 LOGIN REQUEST');
    console.log('Phone:', phone);
    console.log('==========================================');

    // Validate input
    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهاتف وكلمة المرور مطلوبان'
      });
    }

    // ✅ Validate Jordanian phone format
    const phoneRegex = /^07[0-9]{8}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'رقم الهاتف يجب أن يكون أردني بصيغة 07XXXXXXXX'
      });
    }

    // Login user - authService now handles JWT generation with systemAccess and routeAccess
    const result = await authService.login(phone, password);

    console.log('✅ Login successful');
    console.log('User:', result.user.name);
    console.log('Phone:', result.user.phone);
    console.log('Role:', result.user.role);
    console.log('==========================================');

    res.status(200).json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      data: result
    });
  } catch (error) {
    console.error('==========================================');
    console.error('❌ LOGIN ERROR');
    console.error('Error:', error.message);
    console.error('==========================================');
    next(error);
  }
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset (supports email or phone)
 * @access  Public
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني أو رقم الهاتف مطلوب'
      });
    }

    const result = await authService.forgotPassword(emailOrPhone);

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
        message: 'الرمز وكلمة المرور الجديدة مطلوبان'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
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
        message: 'كلمة المرور الحالية والجديدة مطلوبتان'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل'
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
      message: 'تم تحديث الرمز بنجاح',
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