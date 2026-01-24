// src/middleware/validate.middleware.js

/**
 * Simple validation middleware without external dependencies
 * You can install Joi later with: npm install joi
 */

/**
 * Validate user creation data
 */
const validateUser = (req, res, next) => {
  const { name, email, password, role } = req.body;
  const errors = [];

  // Validate name
  if (!name || name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name is required' });
  } else if (name.length < 3) {
    errors.push({ field: 'name', message: 'Name must be at least 3 characters long' });
  } else if (name.length > 100) {
    errors.push({ field: 'name', message: 'Name must not exceed 100 characters' });
  }

  // Validate email
  if (!email || email.trim().length === 0) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({ field: 'email', message: 'Email is invalid' });
    }
  }

  // Validate password
  if (!password || password.trim().length === 0) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (password.length < 6) {
    errors.push({ field: 'password', message: 'Password must be at least 6 characters long' });
  } else if (password.length > 50) {
    errors.push({ field: 'password', message: 'Password must not exceed 50 characters' });
  }

  // Validate role
  if (role) {
    const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
    if (!validRoles.includes(role)) {
      errors.push({ field: 'role', message: 'Role must be one of: super_admin, admin, employee, or secretariat' });
    }
  }

  // If there are errors, return 400
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors
    });
  }

  // Set default role if not provided
  if (!req.body.role) {
    req.body.role = 'employee';
  }

  next();
};

/**
 * Validate user update data
 */
const validateUserUpdate = (req, res, next) => {
  const { name, email, password, role, active } = req.body;
  const errors = [];

  // Check if at least one field is provided
  if (!name && !email && !password && !role && active === undefined) {
    return res.status(400).json({
      success: false,
      message: 'At least one field must be provided for update'
    });
  }

  // Validate name if provided
  if (name !== undefined) {
    if (name.trim().length < 3) {
      errors.push({ field: 'name', message: 'Name must be at least 3 characters long' });
    } else if (name.length > 100) {
      errors.push({ field: 'name', message: 'Name must not exceed 100 characters' });
    }
  }

  // Validate email if provided
  if (email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({ field: 'email', message: 'Email is invalid' });
    }
  }

  // Validate password if provided
  if (password !== undefined) {
    if (password.length < 6) {
      errors.push({ field: 'password', message: 'Password must be at least 6 characters long' });
    } else if (password.length > 50) {
      errors.push({ field: 'password', message: 'Password must not exceed 50 characters' });
    }
  }

  // Validate role if provided
  if (role !== undefined) {
    const validRoles = ['super_admin', 'admin', 'employee', 'secretariat'];
    if (!validRoles.includes(role)) {
      errors.push({ field: 'role', message: 'Role must be one of: super_admin, admin, employee, or secretariat' });
    }
  }

  // Validate active if provided
  if (active !== undefined && typeof active !== 'boolean') {
    errors.push({ field: 'active', message: 'Active must be a boolean value' });
  }

  // If there are errors, return 400
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors
    });
  }

  next();
};

/**
 * Validate login data
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  // Validate email
  if (!email || email.trim().length === 0) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push({ field: 'email', message: 'Email is invalid' });
    }
  }

  // Validate password
  if (!password || password.trim().length === 0) {
    errors.push({ field: 'password', message: 'Password is required' });
  }

  // If there are errors, return 400
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors
    });
  }

  next();
};

module.exports = {
  validateUser,
  validateUserUpdate,
  validateLogin
};