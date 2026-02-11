// src/routes/users.routes.js (COMPLETE FIX - All Validation Issues Resolved)
const express = require('express');
const router = express.Router();
const userService = require('../services/user.service');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// Apply authentication to all routes
router.use(protect);

// ============================================
// CURRENT USER ENDPOINTS
// ============================================

router.get('/me', async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.user.id);
    
    const { password, ...userWithoutPassword } = user;
    
    res.status(200).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('❌ Error in GET /me:', error);
    next(error);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.user.id);
    const { password, ...userWithoutPassword } = user;
    
    res.status(200).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    next(error);
  }
});

router.put('/profile', async (req, res, next) => {
  try {
    const { name, email } = req.body;
    
    const allowedUpdates = {};
    if (name !== undefined) allowedUpdates.name = name;
    if (email !== undefined) allowedUpdates.email = email;
    
    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid update fields provided'
      });
    }
    
    const user = await userService.updateUser(req.user.id, allowedUpdates);
    const { password, ...userWithoutPassword } = user;
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    next(error);
  }
});

router.get('/available-routes', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const availableRoutes = userService.getAvailableRoutes();
    
    res.status(200).json({
      success: true,
      data: availableRoutes
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stats/summary', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const stats = await userService.getUserStats();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

router.get('/', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { role, active, search, page = 1, limit = 10 } = req.query;

    const filters = {
      role,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await userService.getAllUsers(filters);

    res.status(200).json({
      success: true,
      data: result.users,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const userData = req.body;
    
    
    // Validate required fields
    const requiredFields = ['name', 'email', 'password', 'role'];
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
        message: `Invalid role. Valid: ${validRoles.join(', ')}`
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

    // ✅ Validate systemAccess if provided
    if (userData.systemAccess !== undefined) {
      if (typeof userData.systemAccess !== 'object' || userData.systemAccess === null) {
        return res.status(400).json({
          success: false,
          message: 'systemAccess must be an object'
        });
      }
    }

    // ✅ Validate routeAccess if provided
    if (userData.routeAccess !== undefined) {
      if (!Array.isArray(userData.routeAccess)) {
        return res.status(400).json({
          success: false,
          message: 'routeAccess must be an array'
        });
      }
    }

    const user = await userService.createUser(userData);
    const { password, ...userWithoutPassword } = user;



    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('==========================================');
    console.error('❌ Error creating user:', error.message);
    console.error('==========================================');
    
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    next(error);
  }
});

router.get('/check/username/:username', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { username } = req.params;
    const isAvailable = await userService.isUsernameAvailable(username);
    
    res.status(200).json({
      success: true,
      data: { username, available: isAvailable }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const updateData = req.body;
    
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

    // ✅ Validate systemAccess if provided
    if (updateData.systemAccess !== undefined) {
      if (typeof updateData.systemAccess !== 'object' || updateData.systemAccess === null) {
        return res.status(400).json({
          success: false,
          message: 'systemAccess must be an object'
        });
      }
    }

    // ✅ Validate routeAccess if provided
    if (updateData.routeAccess !== undefined) {
      if (!Array.isArray(updateData.routeAccess)) {
        return res.status(400).json({
          success: false,
          message: 'routeAccess must be an array'
        });
      }
    }

    const user = await userService.updateUser(req.params.id, updateData);
    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    next(error);
  }
});

router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    await userService.deleteUser(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/role', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { role } = req.body;
    
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

    res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/toggle-active', restrictTo('super_admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot deactivate your own account'
      });
    }

    const user = await userService.toggleUserActive(req.params.id);
    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: `User ${user.active ? 'activated' : 'deactivated'} successfully`,
      data: userWithoutPassword
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ FIXED: UPDATE SYSTEM ACCESS with proper validation
 */
router.patch('/:id/system-access', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const systemAccess = req.body;
    

    
    // ✅ Validate that systemAccess is an object
    if (typeof systemAccess !== 'object' || systemAccess === null || Array.isArray(systemAccess)) {
      console.error('❌ systemAccess validation failed');
      return res.status(400).json({
        success: false,
        message: 'systemAccess must be an object'
      });
    }

    // ✅ Update only systemAccess field
    const user = await userService.updateUser(req.params.id, { systemAccess });
    const { password, ...userWithoutPassword } = user;


    res.status(200).json({
      success: true,
      message: 'System access updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('==========================================');
    console.error('❌ Error updating system access:', error.message);
    console.error('==========================================');
    next(error);
  }
});

/**
 * ✅ FIXED: UPDATE ROUTE ACCESS with proper validation
 */
router.patch('/:id/route-access', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { routeAccess } = req.body;
    
    
    // ✅ Validate that routeAccess is an array
    if (!Array.isArray(routeAccess)) {
      console.error('❌ routeAccess validation failed');
      return res.status(400).json({
        success: false,
        message: 'routeAccess must be an array'
      });
    }

    // ✅ Update only routeAccess field
    const user = await userService.updateUser(req.params.id, { routeAccess });
    const { password, ...userWithoutPassword } = user;

    res.status(200).json({
      success: true,
      message: 'Route access updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('==========================================');
    console.error('❌ Error updating route access:', error.message);
    console.error('==========================================');
    next(error);
  }
});

/**
 * ✅ UPDATE BOTH PERMISSIONS
 */
router.patch('/:id/permissions', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { systemAccess, routeAccess } = req.body;
    
    if (!systemAccess && !routeAccess) {
      return res.status(400).json({
        success: false,
        message: 'At least one of systemAccess or routeAccess required'
      });
    }

    const updateData = {};
    
    if (systemAccess !== undefined) {
      if (typeof systemAccess !== 'object' || systemAccess === null || Array.isArray(systemAccess)) {
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

    res.status(200).json({
      success: true,
      message: 'Permissions updated successfully',
      data: userWithoutPassword
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;