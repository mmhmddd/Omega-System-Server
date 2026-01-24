// src/routes/users.routes.js
const express = require('express');
const router = express.Router();
const userService = require('../services/user.service');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// Import validation functions - check if they exist
let validateUser, validateUserUpdate;
try {
  const validation = require('../middleware/validate.middleware');
  validateUser = validation.validateUser;
  validateUserUpdate = validation.validateUserUpdate;
} catch (error) {
  console.log('⚠️  Validation middleware not found, using passthrough');
  validateUser = (req, res, next) => next();
  validateUserUpdate = (req, res, next) => next();
}

// All routes require authentication
router.use(protect);

// Only super_admin can access user management
router.use(restrictTo('super_admin'));

/**
 * @route   POST /api/users
 * @desc    Create a new user
 * @access  Super Admin only
 */
router.post('/', validateUser, async (req, res, next) => {
  try {
    const userData = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: req.body.role || 'employee',
      systemAccess: req.body.systemAccess || {}
    };

    const user = await userService.createUser(userData);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users
 * @desc    Get all users with optional filters
 * @access  Super Admin only
 */
router.get('/', async (req, res, next) => {
  try {
    const { role, search, page = 1, limit = 10 } = req.query;
    
    const result = await userService.getAllUsers({
      role,
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
    res.status(200).json({
      success: true,
      data: result.users,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get specific user by ID
 * @access  Super Admin only
 */
router.get('/:id', async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:id
 * @desc    Update user information
 * @access  Super Admin only
 */
router.put('/:id', validateUserUpdate, async (req, res, next) => {
  try {
    const updateData = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: req.body.role,
      active: req.body.active,
      systemAccess: req.body.systemAccess
    };

    const user = await userService.updateUser(req.params.id, updateData);
    
    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user
 * @access  Super Admin only
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/role
 * @desc    Update user role
 * @access  Super Admin only
 */
router.patch('/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    
    if (!role || !['super_admin', 'admin', 'employee'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role specified'
      });
    }

    const user = await userService.updateUserRole(req.params.id, role);
    
    res.status(200).json({
      success: true,
      message: 'User role updated successfully',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/toggle-active
 * @desc    Activate or deactivate user
 * @access  Super Admin only
 */
router.patch('/:id/toggle-active', async (req, res, next) => {
  try {
    const user = await userService.toggleUserActive(req.params.id);
    
    res.status(200).json({
      success: true,
      message: user.active ? 'User activated' : 'User deactivated',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/check/username/:username
 * @desc    Check if username is available
 * @access  Super Admin only
 */
router.get('/check/username/:username', async (req, res, next) => {
  try {
    const isAvailable = await userService.checkUsernameAvailability(req.params.username);
    
    res.status(200).json({
      success: true,
      available: isAvailable,
      message: isAvailable ? 'Username is available' : 'Username is already taken'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/username
 * @desc    Update username manually
 * @access  Super Admin only
 */
router.patch('/:id/username', async (req, res, next) => {
  try {
    const { username } = req.body;
    
    if (!username || username.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Username must be at least 3 characters long'
      });
    }

    // Validate username format (only lowercase letters, numbers, dots, underscores)
    const usernameRegex = /^[a-z0-9._]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'Username can only contain lowercase letters, numbers, dots and underscores'
      });
    }

    const user = await userService.updateUsername(req.params.id, username);
    
    res.status(200).json({
      success: true,
      message: 'Username updated successfully',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/users/:id/system-access
 * @desc    Update user system access permissions
 * @access  Super Admin only
 */
router.patch('/:id/system-access', async (req, res, next) => {
  try {
    const systemAccessUpdates = req.body;

    // Validate that at least one system access field is provided
    if (!systemAccessUpdates || Object.keys(systemAccessUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one system access permission to update'
      });
    }

    // Validate that all values are boolean
    const invalidFields = Object.entries(systemAccessUpdates).filter(
      ([key, value]) => typeof value !== 'boolean'
    );

    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid system access values. All values must be boolean. Invalid fields: ${invalidFields.map(([key]) => key).join(', ')}`
      });
    }

    const user = await userService.updateSystemAccess(req.params.id, systemAccessUpdates);
    
    res.status(200).json({
      success: true,
      message: 'System access updated successfully',
      data: user
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;