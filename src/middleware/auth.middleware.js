// src/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');

/**
 * Protect routes - Verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check if authorization header exists and starts with Bearer
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login to access this resource'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-this');

      // Attach user info to request (including systemAccess)
      req.user = {
        id: decoded.id,
        role: decoded.role,
        systemAccess: decoded.systemAccess || {}
      };

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token. Please login again'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: error.message
    });
  }
};

/**
 * Check if user has access to a specific system
 * @param {string} systemName - Name of the system (e.g., 'laserCuttingManagement')
 */
const checkSystemAccess = (systemName) => {
  return (req, res, next) => {
    // Super admins have access to everything
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Check if user has systemAccess and the specific system is enabled
    if (!req.user.systemAccess || !req.user.systemAccess[systemName]) {
      return res.status(403).json({
        success: false,
        message: `You don't have access to ${systemName}. Please contact your administrator.`
      });
    }

    next();
  };
};

module.exports = { protect, checkSystemAccess };
