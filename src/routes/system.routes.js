// src/routes/system.routes.js
const express = require('express');
const router = express.Router();
const resetService = require('../services/reset.service');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// All routes require super_admin
router.use(protect);
router.use(restrictTo('super_admin'));

/**
 * @route   GET /api/system/stats
 * @desc    Get system statistics
 * @access  Super Admin only
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await resetService.getSystemStats();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/system/reindex
 * @desc    Reindex all users (fix duplicate IDs and sync counter)
 * @access  Super Admin only
 */
router.post('/reindex', async (req, res, next) => {
  try {
    const result = await resetService.reindexUsers();
    
    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        totalUsers: result.totalUsers,
        newCounter: result.newCounter
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/system/reset
 * @desc    Full system reset (recreate default admin and reset counter)
 * @access  Super Admin only
 */
router.post('/reset', async (req, res, next) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'RESET_ALL_USERS') {
      return res.status(400).json({
        success: false,
        message: 'Please confirm reset by sending: { "confirm": "RESET_ALL_USERS" }'
      });
    }

    const result = await resetService.fullReset();
    
    res.status(200).json({
      success: true,
      message: 'System reset successfully. All users deleted and default admin recreated.',
      data: result.defaultAdmin
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/system/reset-counter
 * @desc    Reset user counter only (without deleting users)
 * @access  Super Admin only
 */
router.post('/reset-counter', async (req, res, next) => {
  try {
    await resetService.resetUserCounter();
    
    res.status(200).json({
      success: true,
      message: 'User counter reset to start from USER-0001'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;