// src/routes/users.routes.js - FINAL VERSION MATCHING API ENDPOINTS
const express = require('express');
const router = express.Router();
const userService = require('../services/user.service');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// Apply authentication to all routes
router.use(protect);

// ============================================
// CURRENT USER ENDPOINTS (All Authenticated Users)
// ============================================

/**
 * ✅ GET CURRENT USER DATA
 * @route   GET /api/users/me
 * @desc    Get current logged-in user's data (for auto-refresh)
 * @access  Private (Any authenticated user)
 */
router.get('/me', async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    console.log('📥 GET /api/users/me - User:', userId);
    
    const user = await userService.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    
    console.log('✅ Returning user data:', {
      id: user.id,
      role: user.role,
      systemAccess: user.systemAccess,
      routeAccess: user.routeAccess
    });
    
    res.status(200).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error getting current user:', error);
    next(error);
  }
});

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's profile
 * @access  Private (Any authenticated user)
 */
router.get('/profile', async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    console.log('📥 GET /api/users/profile - User:', userId);
    
    const user = await userService.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const { password, ...userWithoutPassword } = user;
    
    res.status(200).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error getting profile:', error);
    next(error);
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user's profile (limited fields)
 * @access  Private (Any authenticated user)
 */
router.put('/profile', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, email } = req.body;
    
    console.log('📝 PUT /api/users/profile - Updating:', { userId, name, email });
    
    const allowedUpdates = {};
    if (name !== undefined) allowedUpdates.name = name;
    if (email !== undefined) allowedUpdates.email = email;
    
    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid update fields provided. Allowed: name, email'
      });
    }
    
    const user = await userService.updateUser(userId, allowedUpdates);
    const { password, ...userWithoutPassword } = user;
    
    console.log('✅ Profile updated successfully');
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error updating profile:', error);
    next(error);
  }
});

/**
 * @route   GET /api/users/available-routes
 * @desc    Get list of available routes for permission assignment
 * @access  Private (Super Admin only)
 */
router.get('/available-routes', restrictTo('super_admin'), async (req, res, next) => {
  try {
    console.log('📋 GET /api/users/available-routes');
    
    const availableRoutes = [
      { key: 'suppliers', label: 'إدارة الموردين', path: '/suppliers' },
      { key: 'itemsControl', label: 'إدارة الأصناف', path: '/items-control' },
      { key: 'receipts', label: 'إشعارات الاستلام', path: '/receipts' },
      { key: 'emptyReceipt', label: 'إشعار استلام فارغ', path: '/empty-receipt' },
      { key: 'rfqs', label: 'طلبات التسعير', path: '/rfqs' },
      { key: 'purchases', label: 'أوامر الشراء', path: '/purchases' },
      { key: 'materialRequests', label: 'طلبات المواد', path: '/material-requests' },
      { key: 'priceQuotes', label: 'عروض الأسعار', path: '/price-quotes' },
      { key: 'proformaInvoice', label: 'الفواتير الأولية', path: '/Proforma-invoice' },
      { key: 'costingSheet', label: 'كشف التكاليف', path: '/costing-sheet' },
      { key: 'secretariatUserManagement', label: 'طلبات الموظفين', path: '/secretariat-user' },
      { key: 'secretariat', label: 'قسم السكرتاريا', path: '/secretariat' },
    ];
    
    res.status(200).json({
      success: true,
      data: availableRoutes
    });
  } catch (error) {
    console.error('❌ Error getting available routes:', error);
    next(error);
  }
});

/**
 * @route   GET /api/users/stats/summary
 * @desc    Get user statistics
 * @access  Private (Super Admin only)
 */
router.get('/stats/summary', restrictTo('super_admin'), async (req, res, next) => {
  try {
    console.log('📊 GET /api/users/stats/summary');
    
    const stats = await userService.getUserStats();
    
    console.log('✅ Statistics retrieved');
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error getting statistics:', error);
    next(error);
  }
});

// ============================================
// ADMIN ENDPOINTS (Super Admin Only)
// ============================================

/**
 * @route   GET /api/users
 * @desc    Get all users with filters and pagination
 * @access  Private (Super Admin only)
 */
router.get('/', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { role, active, search, page = 1, limit = 10 } = req.query;

    console.log('📋 GET /api/users - Filters:', { role, active, search, page, limit });

    const filters = {
      role,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await userService.getAllUsers(filters);

    console.log('✅ Retrieved users:', result.pagination.totalUsers);

    res.status(200).json({
      success: true,
      data: result.users,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('❌ Error getting users:', error);
    next(error);
  }
});

/**
 * @route   POST /api/users
 * @desc    Create new user
 * @access  Private (Super Admin only)
 */
router.post('/', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const userData = req.body;
    
    console.log('➕ POST /api/users - Creating:', { username: userData.username, role: userData.role });
    
    // Validate required fields
    const requiredFields = ['username', 'name', 'email', 'password', 'role'];
    const missingFields = requiredFields.filter(field => !userData[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate role
    const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
    if (!validRoles.includes(userData.role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles: ${validRoles.join(', ')}`
      });
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate password
    if (userData.password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await userService.createUser(userData);
    const { password, ...userWithoutPassword } = user;

    console.log('✅ User created:', user.id);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error creating user:', error);
    
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    next(error);
  }
});

/**
 * @route   GET /api/users/check/username/:username
 * @desc    Check if username is available
 * @access  Private (Super Admin only)
 */
router.get('/check/username/:username', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { username } = req.params;
    
    console.log('🔍 Checking username availability:', username);
    
    const isAvailable = await userService.isUsernameAvailable(username);
    
    res.status(200).json({
      success: true,
      data: {
        username,
        available: isAvailable
      }
    });
  } catch (error) {
    console.error('❌ Error checking username:', error);
    next(error);
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (Super Admin only)
 */
router.get('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    console.log('🔍 GET /api/users/:id -', req.params.id);
    
    const user = await userService.getUserById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error getting user:', error);
    next(error);
  }
});

/**
 * @route   PUT /api/users/:id
 * @desc    Update user
 * @access  Private (Super Admin only)
 */
router.put('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const updateData = req.body;
    
    console.log('📝 PUT /api/users/:id -', req.params.id);

    // Validate role if provided
    if (updateData.role) {
      const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
      if (!validRoles.includes(updateData.role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Valid: ${validRoles.join(', ')}`
        });
      }
    }

    // Validate email if provided
    if (updateData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updateData.email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }
    }

    // Validate password if provided
    if (updateData.password && updateData.password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const user = await userService.updateUser(req.params.id, updateData);
    const { password, ...userWithoutPassword } = user;

    console.log('✅ User updated:', user.id);

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error updating user:', error);
    
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    next(error);
  }
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Private (Super Admin only)
 */
router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    console.log('🗑️ DELETE /api/users/:id -', req.params.id);
    
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    await userService.deleteUser(req.params.id);

    console.log('✅ User deleted');

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting user:', error);
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/role
 * @desc    Update user role
 * @access  Private (Super Admin only)
 */
router.patch('/:id/role', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    
    console.log('🔄 PATCH /api/users/:id/role -', req.params.id, role);
    
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
      });
    }

    const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid: ${validRoles.join(', ')}`
      });
    }

    const user = await userService.updateUser(req.params.id, { role });
    const { password, ...userWithoutPassword } = user;

    console.log('✅ Role updated');

    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error updating role:', error);
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/toggle-active
 * @desc    Toggle user active status
 * @access  Private (Super Admin only)
 */
router.patch('/:id/toggle-active', restrictTo('super_admin'), async (req, res, next) => {
  try {
    console.log('🔄 PATCH /api/users/:id/toggle-active -', req.params.id);
    
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    const user = await userService.toggleUserActive(req.params.id);
    const { password, ...userWithoutPassword } = user;

    console.log('✅ Active status toggled:', user.active);

    res.status(200).json({
      success: true,
      message: `User ${user.active ? 'activated' : 'deactivated'} successfully`,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error toggling active status:', error);
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/username
 * @desc    Update username
 * @access  Private (Super Admin only)
 */
router.patch('/:id/username', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { username } = req.body;
    
    console.log('📝 PATCH /api/users/:id/username -', req.params.id, username);
    
    if (!username) {
      return res.status(400).json({
        success: false,
        message: 'Username is required'
      });
    }

    const user = await userService.updateUser(req.params.id, { username });
    const { password, ...userWithoutPassword } = user;

    console.log('✅ Username updated');

    res.status(200).json({
      success: true,
      message: 'Username updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error updating username:', error);
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/system-access
 * @desc    Update user system access
 * @access  Private (Super Admin only)
 */
router.patch('/:id/system-access', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { systemAccess } = req.body;
    
    console.log('🔐 PATCH /api/users/:id/system-access -', req.params.id, systemAccess);
    
    if (!systemAccess || typeof systemAccess !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'systemAccess must be an object'
      });
    }

    const user = await userService.updateUser(req.params.id, { systemAccess });
    const { password, ...userWithoutPassword } = user;

    console.log('✅ System access updated');

    res.status(200).json({
      success: true,
      message: 'System access updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error updating system access:', error);
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/route-access
 * @desc    Update user route access
 * @access  Private (Super Admin only)
 */
router.patch('/:id/route-access', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { routeAccess } = req.body;
    
    console.log('🔐 PATCH /api/users/:id/route-access -', req.params.id, routeAccess);
    
    if (!Array.isArray(routeAccess)) {
      return res.status(400).json({
        success: false,
        message: 'routeAccess must be an array'
      });
    }

    const user = await userService.updateUser(req.params.id, { routeAccess });
    const { password, ...userWithoutPassword } = user;

    console.log('✅ Route access updated');

    res.status(200).json({
      success: true,
      message: 'Route access updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error updating route access:', error);
    next(error);
  }
});

/**
 * ✅ COMBINED PERMISSIONS UPDATE
 * @route   PATCH /api/users/:id/permissions
 * @desc    Update both systemAccess and routeAccess
 * @access  Private (Super Admin only)
 */
router.patch('/:id/permissions', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { systemAccess, routeAccess } = req.body;
    
    console.log('🔐 PATCH /api/users/:id/permissions -', req.params.id, {
      systemAccess,
      routeAccess
    });

    if (!systemAccess && !routeAccess) {
      return res.status(400).json({
        success: false,
        message: 'At least one of systemAccess or routeAccess required'
      });
    }

    const updateData = {};
    
    if (systemAccess !== undefined) {
      if (typeof systemAccess !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'systemAccess must be an object'
        });
      }
      updateData.systemAccess = systemAccess;
    }

    if (routeAccess !== undefined) {
      if (!Array.isArray(routeAccess)) {
        return res.status(400).json({
          success: false,
          message: 'routeAccess must be an array'
        });
      }
      updateData.routeAccess = routeAccess;
    }

    const user = await userService.updateUser(req.params.id, updateData);
    const { password, ...userWithoutPassword } = user;

    console.log('✅ Permissions updated');

    res.status(200).json({
      success: true,
      message: 'User permissions updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error updating permissions:', error);
    next(error);
  }
});

module.exports = router;