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

      // Attach user info to request (including systemAccess and routeAccess)
      req.user = {
        id: decoded.id,
        role: decoded.role,
        systemAccess: decoded.systemAccess || {},
        routeAccess: decoded.routeAccess || []
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

/**
 * Check if user has access to a specific route
 * @param {string} routeKey - Route key to check access for
 */
const checkRouteAccess = (routeKey) => {
  return (req, res, next) => {
    const user = req.user;
    
    console.log('=== Route Access Check ===');
    console.log('Route Key:', routeKey);
    console.log('User Role:', user.role);
    console.log('User Route Access:', user.routeAccess);
    
    // Super admins and admins have access to all routes
    if (user.role === 'super_admin' || user.role === 'admin') {
      console.log('✅ Access granted: Super Admin or Admin');
      return next();
    }

    // Secretariat has access to their specific routes
    if (user.role === 'secretariat') {
      const secretariatRoutes = ['secretariat', 'secretariat-user'];
      if (secretariatRoutes.includes(routeKey)) {
        console.log('✅ Access granted: Secretariat has access to', routeKey);
        return next();
      }
      
      console.log('❌ Access denied: Route not in secretariat allowed routes');
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this route. Please contact your administrator.'
      });
    }

    // For employees, check routeAccess array
    if (user.role === 'employee') {
      if (!user.routeAccess || !Array.isArray(user.routeAccess)) {
        console.log('❌ Access denied: No routeAccess array found for employee');
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this route. Please contact your administrator.'
        });
      }

      if (!user.routeAccess.includes(routeKey)) {
        console.log('❌ Access denied: Route key not in employee routeAccess array');
        console.log('Available routes:', user.routeAccess);
        return res.status(403).json({
          success: false,
          message: `You do not have access to ${routeKey}. Please contact your administrator.`
        });
      }

      console.log('✅ Access granted: Employee has routeAccess to', routeKey);
      return next();
    }

    // Default deny
    console.log('❌ Access denied: Default deny');
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to access this resource.'
    });
  };
};

module.exports = {
  protect,
  checkSystemAccess,
  checkRouteAccess
};