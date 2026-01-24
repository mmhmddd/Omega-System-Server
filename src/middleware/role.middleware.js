// src/middleware/role.middleware.js (محدث)

/**
 * Restrict access to specific roles
 * @param  {...string} roles - Allowed roles (e.g., 'super_admin', 'admin', 'employee', 'secretariat')
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    // Check if user is attached to request (from auth middleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Check if user's role is in the allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `You do not have permission to access this resource. Required roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

module.exports = { restrictTo };