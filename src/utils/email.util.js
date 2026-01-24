// src/utils/email.util.js
const nodemailer = require('nodemailer');
const logger = require('./logger.util');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter
   */
  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD
        }
      });

      // Verify connection
      this.transporter.verify((error, success) => {
        if (error) {
          logger.error('Email transporter verification failed', error);
        } else {
          logger.info('Email service is ready to send emails');
        }
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter', error);
    }
  }

  /**
   * Send password reset email
   * @param {string} to - Recipient email
   * @param {string} resetToken - Password reset token
   * @param {string} userName - User's name
   */
  async sendPasswordResetEmail(to, resetToken, userName) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      // Create reset link (adjust this URL to match your frontend)
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: `"Omega System" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: 'Password Reset Request - Omega System',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background-color: #f9f9f9;
                border-radius: 10px;
                padding: 30px;
                border: 1px solid #ddd;
              }
              .header {
                text-align: center;
                color: #2563eb;
                margin-bottom: 30px;
              }
              .content {
                background-color: white;
                padding: 20px;
                border-radius: 5px;
                margin-bottom: 20px;
              }
              .button {
                display: inline-block;
                padding: 12px 30px;
                background-color: #2563eb;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
              }
              .button:hover {
                background-color: #1d4ed8;
              }
              .token-box {
                background-color: #f3f4f6;
                padding: 15px;
                border-radius: 5px;
                font-family: monospace;
                word-break: break-all;
                margin: 15px 0;
                border-left: 4px solid #2563eb;
              }
              .warning {
                background-color: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                margin: 20px 0;
                border-radius: 5px;
              }
              .footer {
                text-align: center;
                color: #6b7280;
                font-size: 12px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #ddd;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🔐 Password Reset Request</h1>
              </div>
              
              <div class="content">
                <p>Hello <strong>${userName}</strong>,</p>
                
                <p>We received a request to reset your password for your Omega System account.</p>
                
                <p>Click the button below to reset your password:</p>
                
                <div style="text-align: center;">
                  <a href="${resetUrl}" class="button">Reset Password</a>
                </div>
                
                <p>Or copy and paste this link into your browser:</p>
                <div class="token-box">${resetUrl}</div>
                
                <div class="warning">
                  <strong>⚠️ Security Notice:</strong>
                  <ul>
                    <li>This link will expire in <strong>1 hour</strong></li>
                    <li>If you didn't request this, please ignore this email</li>
                    <li>Never share this link with anyone</li>
                  </ul>
                </div>
                
                <p>If you're having trouble clicking the button, you can use this token manually:</p>
                <div class="token-box">${resetToken}</div>
              </div>
              
              <div class="footer">
                <p>This is an automated email from Omega System</p>
                <p>Please do not reply to this email</p>
                <p>&copy; ${new Date().getFullYear()} Omega System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
Hello ${userName},

We received a request to reset your password for your Omega System account.

Reset your password by clicking this link:
${resetUrl}

Or use this token manually:
${resetToken}

SECURITY NOTICE:
- This link will expire in 1 hour
- If you didn't request this, please ignore this email
- Never share this link with anyone

This is an automated email from Omega System. Please do not reply.

© ${new Date().getFullYear()} Omega System. All rights reserved.
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Password reset email sent to: ${to}`);
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      logger.error('Failed to send password reset email', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Send welcome email to new user
   * @param {string} to - Recipient email
   * @param {string} userName - User's name
   * @param {string} username - User's username
   * @param {string} temporaryPassword - Temporary password
   */
  async sendWelcomeEmail(to, userName, username, temporaryPassword) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;

      const mailOptions = {
        from: `"omega System" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: 'Welcome to Omega System',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background-color: #f9f9f9;
                border-radius: 10px;
                padding: 30px;
                border: 1px solid #ddd;
              }
              .header {
                text-align: center;
                color: #2563eb;
                margin-bottom: 30px;
              }
              .content {
                background-color: white;
                padding: 20px;
                border-radius: 5px;
                margin-bottom: 20px;
              }
              .credentials {
                background-color: #f3f4f6;
                padding: 20px;
                border-radius: 5px;
                margin: 20px 0;
                border-left: 4px solid #2563eb;
              }
              .button {
                display: inline-block;
                padding: 12px 30px;
                background-color: #2563eb;
                color: white;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
              }
              .warning {
                background-color: #fee2e2;
                border-left: 4px solid #ef4444;
                padding: 15px;
                margin: 20px 0;
                border-radius: 5px;
              }
              .footer {
                text-align: center;
                color: #6b7280;
                font-size: 12px;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #ddd;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Welcome to Omega System!</h1>
              </div>
              
              <div class="content">
                <p>Hello <strong>${userName}</strong>,</p>
                
                <p>Your account has been created successfully. Here are your login credentials:</p>
                
                <div class="credentials">
                  <p><strong>Username:</strong> ${username}</p>
                  <p><strong>Password:</strong> ${temporaryPassword}</p>
                </div>
                
                <div style="text-align: center;">
                  <a href="${loginUrl}" class="button">Login Now</a>
                </div>
                
                <div class="warning">
                  <strong>⚠️ Important:</strong>
                  <p>Please change your password immediately after your first login for security purposes.</p>
                </div>
                
                <p>If you have any questions, please contact your system administrator.</p>
              </div>
              
              <div class="footer">
                <p>This is an automated email from Omega System</p>
                <p>&copy; ${new Date().getFullYear()} Omega System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
Welcome to Omega System!

Hello ${userName},

Your account has been created successfully. Here are your login credentials:

Username: ${username}
Password: ${temporaryPassword}

Login URL: ${loginUrl}

IMPORTANT: Please change your password immediately after your first login for security purposes.

If you have any questions, please contact your system administrator.

© ${new Date().getFullYear()} Omega System. All rights reserved.
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Welcome email sent to: ${to}`);
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      logger.error('Failed to send welcome email', error);
      throw new Error('Failed to send welcome email');
    }
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail(to) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const mailOptions = {
        from: `"Omega System" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: 'Test Email - Omega System',
        html: '<h1>Email Configuration Test</h1><p>If you receive this email, your email configuration is working correctly!</p>',
        text: 'Email Configuration Test - If you receive this email, your email configuration is working correctly!'
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Test email sent to: ${to}`);
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      logger.error('Failed to send test email', error);
      throw error;
    }
  }
}

module.exports = new EmailService();