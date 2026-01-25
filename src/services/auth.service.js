// src/services/auth.service.js (UPDATED)
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../utils/logger.util');
const emailService = require('../utils/email.util');
const atomicWrite = require('../utils/atomic-write.util');

const USERS_FILE = path.join(__dirname, '../../data/users/users.json');
const RESET_TOKENS_FILE = path.join(__dirname, '../../data/users/reset-tokens.json');

class AuthService {
  /**
   * Read users from file
   */
  _readUsers() {
    try {
      if (!fs.existsSync(USERS_FILE)) {
        return [];
      }
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error reading users file', error);
      throw new Error('Failed to read users data');
    }
  }

  /**
   * Write users to file
   */
  _writeUsers(users) {
    try {
      // Use sync version since this is a synchronous method
      atomicWrite.sync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
      logger.error('Error writing users file', error);
      throw new Error('Failed to save users data');
    }
  }

  /**
   * Read reset tokens from file
   */
  _readResetTokens() {
    try {
      if (!fs.existsSync(RESET_TOKENS_FILE)) {
        return [];
      }
      const data = fs.readFileSync(RESET_TOKENS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Error reading reset tokens file', error);
      return [];
    }
  }

  /**
   * Write reset tokens to file
   */
  _writeResetTokens(tokens) {
    try {
      // Use sync version since this is a synchronous method
      atomicWrite.sync(RESET_TOKENS_FILE, JSON.stringify(tokens, null, 2));
    } catch (error) {
      logger.error('Error writing reset tokens file', error);
      throw new Error('Failed to save reset tokens');
    }
  }

  /**
   * Generate JWT token with systemAccess and routeAccess
   */
  _generateToken(userId, role, systemAccess = {}, routeAccess = []) {
    return jwt.sign(
      { 
        id: userId, 
        role: role,
        systemAccess: systemAccess,
        routeAccess: routeAccess // NEW
      },
      process.env.JWT_SECRET || 'your-secret-key-change-this',
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
  }

  /**
   * Generate password reset token
   */
  _generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Login user with username and password
   */
  async login(username, password) {
    try {
      const users = this._readUsers();

      // Find user by username (case-insensitive)
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());

      if (!user) {
        const error = new Error('Invalid username or password');
        error.statusCode = 401;
        throw error;
      }

      // Check if user is active
      if (!user.active) {
        const error = new Error('Account is deactivated. Please contact administrator');
        error.statusCode = 403;
        throw error;
      }

      // Verify password (plain text comparison - you should hash in production)
      if (user.password !== password) {
        const error = new Error('Invalid username or password');
        error.statusCode = 401;
        throw error;
      }

      // Initialize systemAccess if it doesn't exist
      const systemAccess = user.systemAccess || {
        laserCuttingManagement: false
      };

      // Initialize routeAccess if it doesn't exist (NEW)
      const routeAccess = user.routeAccess || [];

      // Generate token with systemAccess and routeAccess
      const token = this._generateToken(user.id, user.role, systemAccess, routeAccess);

      // Update last login
      user.lastLogin = new Date().toISOString();
      this._writeUsers(users);

      logger.info(`User logged in: ${user.username}`);

      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      logger.error('Login error', error);
      throw error;
    }
  }

  /**
   * Forgot password - Generate reset token and send email
   */
  async forgotPassword(email) {
    try {
      const users = this._readUsers();

      // Find user by email
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

      if (!user) {
        const error = new Error('No user found with this email address');
        error.statusCode = 404;
        throw error;
      }

      // Check if user is active
      if (!user.active) {
        const error = new Error('Account is deactivated. Please contact administrator');
        error.statusCode = 403;
        throw error;
      }

      // Generate reset token
      const resetToken = this._generateResetToken();
      const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour

      // Store reset token
      const resetTokens = this._readResetTokens();
      
      // Remove any existing tokens for this user
      const filteredTokens = resetTokens.filter(t => t.userId !== user.id);
      
      // Add new token
      filteredTokens.push({
        userId: user.id,
        token: resetToken,
        email: user.email,
        expiresAt: resetTokenExpiry,
        createdAt: new Date().toISOString(),
        used: false
      });

      this._writeResetTokens(filteredTokens);

      // Send email with reset token
      try {
        await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);
        logger.info(`Password reset email sent to: ${user.email}`);
      } catch (emailError) {
        logger.error('Failed to send password reset email', emailError);
        // Remove the token if email fails
        this._writeResetTokens(resetTokens.filter(t => t.userId !== user.id));
        throw new Error('Failed to send password reset email. Please try again later.');
      }

      return {
        message: 'Password reset email has been sent to your email address',
        email: user.email
      };
    } catch (error) {
      logger.error('Forgot password error', error);
      throw error;
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(token, newPassword) {
    try {
      const resetTokens = this._readResetTokens();

      // Find valid token
      const tokenData = resetTokens.find(t => 
        t.token === token && 
        !t.used && 
        new Date(t.expiresAt) > new Date()
      );

      if (!tokenData) {
        const error = new Error('Invalid or expired reset token');
        error.statusCode = 400;
        throw error;
      }

      // Update user password
      const users = this._readUsers();
      const userIndex = users.findIndex(u => u.id === tokenData.userId);

      if (userIndex === -1) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      // Update password
      users[userIndex].password = newPassword;
      users[userIndex].updatedAt = new Date().toISOString();
      this._writeUsers(users);

      // Mark token as used
      tokenData.used = true;
      tokenData.usedAt = new Date().toISOString();
      this._writeResetTokens(resetTokens);

      logger.info(`Password reset successful for user: ${users[userIndex].email}`);

      return { message: 'Password reset successful' };
    } catch (error) {
      logger.error('Reset password error', error);
      throw error;
    }
  }

  /**
   * Change password for logged in user
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const users = this._readUsers();
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      const user = users[userIndex];

      // Verify current password
      if (user.password !== currentPassword) {
        const error = new Error('Current password is incorrect');
        error.statusCode = 401;
        throw error;
      }

      // Update password
      users[userIndex].password = newPassword;
      users[userIndex].updatedAt = new Date().toISOString();
      this._writeUsers(users);

      logger.info(`Password changed for user: ${user.email}`);

      return { message: 'Password changed successfully' };
    } catch (error) {
      logger.error('Change password error', error);
      throw error;
    }
  }

  /**
   * Get current user by ID
   */
  async getCurrentUser(userId) {
    try {
      const users = this._readUsers();
      const user = users.find(u => u.id === userId);

      if (!user) {
        const error = new Error('User not found');
        error.statusCode = 404;
        throw error;
      }

      // Return user without password
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      logger.error('Get current user error', error);
      throw error;
    }
  }

  /**
   * Verify reset token validity
   */
  async verifyResetToken(token) {
    try {
      const resetTokens = this._readResetTokens();

      const tokenData = resetTokens.find(t => 
        t.token === token && 
        !t.used && 
        new Date(t.expiresAt) > new Date()
      );

      return !!tokenData;
    } catch (error) {
      logger.error('Verify reset token error', error);
      return false;
    }
  }

  /**
   * Clean up expired reset tokens (call this periodically)
   */
  async cleanExpiredTokens() {
    try {
      const resetTokens = this._readResetTokens();
      const now = new Date();

      const validTokens = resetTokens.filter(t => 
        !t.used && new Date(t.expiresAt) > now
      );

      this._writeResetTokens(validTokens);
      logger.info(`Cleaned up expired reset tokens`);
    } catch (error) {
      logger.error('Clean expired tokens error', error);
    }
  }
}

module.exports = new AuthService();