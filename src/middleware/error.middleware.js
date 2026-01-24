// src/middleware/error.middleware.js

/**
 * Global error handling middleware
 * Catches all errors and sends a formatted JSON response
 */
const errorMiddleware = (err, req, res, next) => {
  // Log error to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ Error:', {
      message: err.message,
      path: req.originalUrl,
      method: req.method
    });
  }

  // Default error status and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
  }

  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  if (err.code === 'ENOENT') {
    statusCode = 404;
    message = 'Resource not found';
  }

  if (err.code === 11000) {
    statusCode = 400;
    message = 'Duplicate field value entered';
  }

  // Custom error messages
  if (err.message === 'User not found') {
    statusCode = 404;
  }

  if (err.message === 'Email already exists') {
    statusCode = 400;
  }

  if (err.message === 'Username already exists') {
    statusCode = 400;
  }

  if (err.message === 'Invalid role specified') {
    statusCode = 400;
  }

  // Send error response
  const response = {
    success: false,
    message
  };

  // Include error details only in development
  if (process.env.NODE_ENV === 'development') {
    response.error = err.message;
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

module.exports = errorMiddleware;