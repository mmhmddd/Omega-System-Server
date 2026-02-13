// src/services/auth.service.js (UPDATED - Phone-based Login)
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
      atomicWrite.sync(RESET_TOKENS_FILE, JSON.stringify(tokens, null, 2));
    } catch (error) {
      logger.error('Error writing reset tokens file', error);
      throw new Error('Failed to save reset tokens');
    }
  }

  /**
   * Generate JWT token
   */
  _generateToken(user) {
    const systemAccess = user.systemAccess || {
      laserCuttingManagement: false
    };

    const routeAccess = Array.isArray(user.routeAccess) ? user.routeAccess : [];

    const payload = {
      id: user.id,
      role: user.role,
      systemAccess: systemAccess,
      routeAccess: routeAccess
    };

    console.log('🔐 Generating JWT with:', payload);

    return jwt.sign(
      payload,
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
   * ✅ UPDATED: Login user with phone and password
   */
  async login(phone, password) {
    try {
      const users = this._readUsers();

      console.log('🔍 Login attempt for phone:', phone);

      // ✅ Find user by phone number
      const user = users.find(u => u.phone === phone);

      if (!user) {
        console.log('❌ User not found with phone:', phone);
        const error = new Error('رقم الهاتف أو كلمة المرور غير صحيحة');
        error.statusCode = 401;
        throw error;
      }

      console.log('✅ User found:', user.username, '(', user.name, ')');

      // Check if user is active
      if (!user.active) {
        console.log('❌ User account is deactivated:', user.username);
        const error = new Error('الحساب معطل. يرجى الاتصال بالمسؤول');
        error.statusCode = 403;
        throw error;
      }

      // Verify password (plain text comparison - you should hash in production)
      if (user.password !== password) {
        console.log('❌ Invalid password for user:', user.username);
        const error = new Error('رقم الهاتف أو كلمة المرور غير صحيحة');
        error.statusCode = 401;
        throw error;
      }

      console.log('✅ Password verified for user:', user.username);

      // Initialize systemAccess if it doesn't exist
      if (!user.systemAccess) {
        user.systemAccess = {
          laserCuttingManagement: false
        };
        console.log('⚠️ systemAccess was missing, initialized with defaults');
      }

      // Initialize routeAccess if it doesn't exist
      if (!user.routeAccess) {
        user.routeAccess = [];
        console.log('⚠️ routeAccess was missing, initialized as empty array');
      }

      // ✅ Generate token with complete user object
      const token = this._generateToken(user);
      
      // Update last login
      user.lastLogin = new Date().toISOString();
      this._writeUsers(users);

      logger.info(`User logged in: ${user.username} (${user.role})`);
      console.log('✅ Login successful for user:', user.username);

      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      logger.error('Login error', error);
      console.error('❌ Login error:', error.message);
      throw error;
    }
  }

  /**
   * ✅ UPDATED: Forgot password - now supports both email and phone
   */
  async forgotPassword(emailOrPhone) {
    try {
      const users = this._readUsers();

      console.log('🔍 Password reset request for:', emailOrPhone);

      // ✅ Find user by email OR phone
      const user = users.find(u => 
        (u.email && u.email.toLowerCase() === emailOrPhone.toLowerCase()) ||
        u.phone === emailOrPhone
      );

      if (!user) {
        console.log('❌ User not found with:', emailOrPhone);
        const error = new Error('لم يتم العثور على مستخدم بهذا البريد الإلكتروني أو رقم الهاتف');
        error.statusCode = 404;
        throw error;
      }

      // Check if user is active
      if (!user.active) {
        console.log('❌ User account is deactivated:', user.phone);
        const error = new Error('الحساب معطل. يرجى الاتصال بالمسؤول');
        error.statusCode = 403;
        throw error;
      }

      // ✅ Check if user has email for password reset
      if (!user.email) {
        console.log('❌ User has no email for password reset');
        const error = new Error('لا يوجد بريد إلكتروني مسجل لهذا الحساب. يرجى الاتصال بالمسؤول');
        error.statusCode = 400;
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
        phone: user.phone,
        expiresAt: resetTokenExpiry,
        createdAt: new Date().toISOString(),
        used: false
      });

      this._writeResetTokens(filteredTokens);

      console.log('✅ Reset token generated for user:', user.phone);

      // Send email with reset token
      try {
        await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);
        logger.info(`Password reset email sent to: ${user.email}`);
        console.log('✅ Password reset email sent to:', user.email);
      } catch (emailError) {
        logger.error('Failed to send password reset email', emailError);
        console.error('❌ Failed to send email:', emailError.message);
        // Remove the token if email fails
        this._writeResetTokens(resetTokens.filter(t => t.userId !== user.id));
        throw new Error('فشل إرسال البريد الإلكتروني. يرجى المحاولة مرة أخرى لاحقاً');
      }

      return {
        message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني',
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
      console.log('🔍 Password reset attempt with token');

      const resetTokens = this._readResetTokens();

      // Find valid token
      const tokenData = resetTokens.find(t => 
        t.token === token && 
        !t.used && 
        new Date(t.expiresAt) > new Date()
      );

      if (!tokenData) {
        console.log('❌ Invalid or expired reset token');
        const error = new Error('رمز إعادة التعيين غير صالح أو منتهي الصلاحية');
        error.statusCode = 400;
        throw error;
      }

      console.log('✅ Valid reset token found for user:', tokenData.phone || tokenData.email);

      // Update user password
      const users = this._readUsers();
      const userIndex = users.findIndex(u => u.id === tokenData.userId);

      if (userIndex === -1) {
        console.log('❌ User not found for token');
        const error = new Error('المستخدم غير موجود');
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

      logger.info(`Password reset successful for user: ${users[userIndex].phone}`);
      console.log('✅ Password reset successful for user:', users[userIndex].phone);

      return { message: 'تم إعادة تعيين كلمة المرور بنجاح' };
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
      console.log('🔍 Password change request for user ID:', userId);

      const users = this._readUsers();
      const userIndex = users.findIndex(u => u.id === userId);

      if (userIndex === -1) {
        console.log('❌ User not found:', userId);
        const error = new Error('المستخدم غير موجود');
        error.statusCode = 404;
        throw error;
      }

      const user = users[userIndex];

      // Verify current password
      if (user.password !== currentPassword) {
        console.log('❌ Current password is incorrect for user:', user.username);
        const error = new Error('كلمة المرور الحالية غير صحيحة');
        error.statusCode = 401;
        throw error;
      }

      console.log('✅ Current password verified for user:', user.username);

      // Update password
      users[userIndex].password = newPassword;
      users[userIndex].updatedAt = new Date().toISOString();
      this._writeUsers(users);

      logger.info(`Password changed for user: ${user.phone}`);
      console.log('✅ Password changed successfully for user:', user.username);

      return { message: 'تم تغيير كلمة المرور بنجاح' };
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
      console.log('🔍 Fetching current user data for ID:', userId);

      const users = this._readUsers();
      const user = users.find(u => u.id === userId);

      if (!user) {
        console.log('❌ User not found:', userId);
        const error = new Error('المستخدم غير موجود');
        error.statusCode = 404;
        throw error;
      }

      // Initialize systemAccess if it doesn't exist
      if (!user.systemAccess) {
        user.systemAccess = {
          laserCuttingManagement: false
        };
      }

      // Initialize routeAccess if it doesn't exist
      if (!user.routeAccess) {
        user.routeAccess = [];
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

      const isValid = !!tokenData;
      console.log(`🔍 Reset token verification: ${isValid ? 'Valid' : 'Invalid'}`);

      return isValid;
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

      const beforeCount = resetTokens.length;
      const validTokens = resetTokens.filter(t => 
        !t.used && new Date(t.expiresAt) > now
      );
      const afterCount = validTokens.length;

      this._writeResetTokens(validTokens);
      
      const cleanedCount = beforeCount - afterCount;
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired reset tokens`);
        console.log(`🧹 Cleaned up ${cleanedCount} expired reset tokens`);
      }
    } catch (error) {
      logger.error('Clean expired tokens error', error);
    }
  }

  /**
   * Refresh token with latest user data
   */
  async refreshToken(userId) {
    try {
      console.log('🔄 Token refresh request for user ID:', userId);

      const users = this._readUsers();
      const user = users.find(u => u.id === userId);

      if (!user) {
        console.log('❌ User not found:', userId);
        const error = new Error('المستخدم غير موجود');
        error.statusCode = 404;
        throw error;
      }

      if (!user.active) {
        console.log('❌ User account is deactivated:', user.username);
        const error = new Error('الحساب معطل');
        error.statusCode = 403;
        throw error;
      }

      // Initialize systemAccess if it doesn't exist
      if (!user.systemAccess) {
        user.systemAccess = {
          laserCuttingManagement: false
        };
      }

      // Initialize routeAccess if it doesn't exist
      if (!user.routeAccess) {
        user.routeAccess = [];
      }

      // Generate new token with latest permissions
      const token = this._generateToken(user);

      logger.info(`Token refreshed for user: ${user.username}`);
      console.log('✅ Token refreshed successfully for user:', user.username);

      // Return user data without password
      const { password: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        token
      };
    } catch (error) {
      logger.error('Refresh token error', error);
      throw error;
    }
  }
}

module.exports = new AuthService();