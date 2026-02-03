// src/utils/email.util.js (Production-Ready Version)
const nodemailer = require('nodemailer');
const logger = require('./logger.util');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
    
    // Professional Color Scheme
    this.colors = {
      primary: '#0b4fa2',      // Deep Blue
      primaryDark: '#083a7a',  // Darker Blue for hover
      primaryLight: '#e3f2fd', // Light Blue for backgrounds
      success: '#10b981',      // Green
      warning: '#f59e0b',      // Amber
      danger: '#ef4444',       // Red
      text: '#1f2937',         // Dark Gray
      textLight: '#6b7280',    // Medium Gray
      background: '#f9fafb',   // Light Gray
      white: '#ffffff',
      border: '#e5e7eb'
    };
  }

  initializeTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_APP_PASSWORD
        }
      });

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
   * Get common email styles
   */
  getEmailStyles() {
    return `
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        line-height: 1.6;
        color: ${this.colors.text};
        background-color: ${this.colors.background};
        padding: 20px;
      }
      .email-wrapper {
        max-width: 600px;
        margin: 0 auto;
        background-color: ${this.colors.white};
      }
      .email-header {
        background: linear-gradient(135deg, ${this.colors.primary} 0%, ${this.colors.primaryDark} 100%);
        padding: 40px 30px;
        text-align: center;
        border-radius: 8px 8px 0 0;
      }
      .email-header h1 {
        color: ${this.colors.white};
        font-size: 28px;
        font-weight: 700;
        margin: 0;
        text-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .email-header .icon {
        font-size: 48px;
        margin-bottom: 10px;
      }
      .email-body {
        padding: 40px 30px;
        background-color: ${this.colors.white};
      }
      .email-body p {
        margin: 0 0 16px 0;
        color: ${this.colors.text};
        font-size: 15px;
      }
      .info-card {
        background-color: ${this.colors.primaryLight};
        border-left: 4px solid ${this.colors.primary};
        padding: 20px;
        border-radius: 6px;
        margin: 24px 0;
      }
      .info-card p {
        margin: 8px 0;
        font-size: 14px;
      }
      .info-card strong {
        color: ${this.colors.primary};
        font-weight: 600;
      }
      .credentials-box {
        background-color: ${this.colors.background};
        border: 2px solid ${this.colors.border};
        padding: 20px;
        border-radius: 8px;
        margin: 24px 0;
        text-align: center;
      }
      .credentials-box p {
        margin: 12px 0;
        font-size: 15px;
      }
      .credentials-box .credential-value {
        font-family: 'Courier New', monospace;
        background-color: ${this.colors.white};
        padding: 8px 16px;
        border-radius: 4px;
        display: inline-block;
        margin-top: 4px;
        border: 1px solid ${this.colors.border};
        font-size: 16px;
        font-weight: 600;
        color: ${this.colors.primary};
      }
      .button-container {
        text-align: center;
        margin: 32px 0;
      }
      .button {
        display: inline-block;
        padding: 14px 32px;
        background: linear-gradient(135deg, ${this.colors.primary} 0%, ${this.colors.primaryDark} 100%);
        color: ${this.colors.white};
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
        font-size: 15px;
        box-shadow: 0 4px 6px rgba(11, 79, 162, 0.2);
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .button:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 12px rgba(11, 79, 162, 0.3);
      }
      .alert {
        padding: 16px 20px;
        border-radius: 6px;
        margin: 24px 0;
        border-left: 4px solid;
      }
      .alert-warning {
        background-color: #fef3c7;
        border-left-color: ${this.colors.warning};
        color: #92400e;
      }
      .alert-danger {
        background-color: #fee2e2;
        border-left-color: ${this.colors.danger};
        color: #991b1b;
      }
      .alert-success {
        background-color: #d1fae5;
        border-left-color: ${this.colors.success};
        color: #065f46;
      }
      .alert h4 {
        margin: 0 0 8px 0;
        font-size: 16px;
        font-weight: 600;
      }
      .alert p, .alert ul {
        margin: 8px 0;
        font-size: 14px;
      }
      .alert ul {
        padding-left: 20px;
      }
      .alert li {
        margin: 4px 0;
      }
      .token-display {
        background-color: ${this.colors.background};
        border: 2px dashed ${this.colors.border};
        padding: 16px;
        border-radius: 6px;
        margin: 16px 0;
        word-break: break-all;
        font-family: 'Courier New', monospace;
        font-size: 13px;
        color: ${this.colors.text};
        text-align: center;
      }
      .email-footer {
        background-color: ${this.colors.background};
        padding: 30px;
        text-align: center;
        border-radius: 0 0 8px 8px;
        border-top: 1px solid ${this.colors.border};
      }
      .email-footer p {
        color: ${this.colors.textLight};
        font-size: 13px;
        margin: 8px 0;
      }
      .divider {
        height: 1px;
        background-color: ${this.colors.border};
        margin: 24px 0;
      }
      .logo {
        font-size: 32px;
        font-weight: 700;
        color: ${this.colors.white};
        margin-bottom: 8px;
      }
    `;
  }

  async sendPasswordResetEmail(to, resetToken, userName) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: `"Omega System" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: 'Password Reset Request - Omega System',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Password Reset Request</title>
            <style>${this.getEmailStyles()}</style>
          </head>
          <body>
            <div class="email-wrapper">
              <div class="email-header">
                <div class="icon">🔐</div>
                <h1>Password Reset Request</h1>
              </div>
              
              <div class="email-body">
                <p>Hello <strong>${userName}</strong>,</p>
                
                <p>We received a request to reset your password for your Omega System account.</p>
                
                <p>Click the button below to create a new password:</p>
                
                <div class="button-container">
                  <a href="${resetUrl}" class="button">Reset My Password</a>
                </div>
                
                <div class="alert alert-warning">
                  <h4>⚠️ Security Notice</h4>
                  <ul>
                    <li>This reset link will expire in <strong>1 hour</strong></li>
                    <li>If you didn't request this reset, please ignore this email</li>
                    <li>Never share this link with anyone</li>
                    <li>For security, we recommend using a strong, unique password</li>
                  </ul>
                </div>
                
                <div class="divider"></div>
                
                <p style="font-size: 14px; color: ${this.colors.textLight};">
                  <strong>Can't click the button?</strong> Copy and paste this link into your browser:
                </p>
                <div class="token-display">${resetUrl}</div>
              </div>
              
              <div class="email-footer">
                <p><strong>Omega System</strong></p>
                <p>This is an automated email. Please do not reply to this message.</p>
                <p>&copy; ${new Date().getFullYear()} Omega System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
Password Reset Request - Omega System

Hello ${userName},

We received a request to reset your password for your Omega System account.

Reset your password by visiting this link:
${resetUrl}

SECURITY NOTICE:
- This link will expire in 1 hour
- If you didn't request this, please ignore this email
- Never share this link with anyone
- For security, we recommend using a strong, unique password

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

  async sendWelcomeEmail(to, userName, username, temporaryPassword) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;

      const mailOptions = {
        from: `"Omega System" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: 'Welcome to Omega System - Your Account is Ready',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to Omega System</title>
            <style>${this.getEmailStyles()}</style>
          </head>
          <body>
            <div class="email-wrapper">
              <div class="email-header">
                <div class="icon">🎉</div>
                <h1>Welcome to Omega System</h1>
              </div>
              
              <div class="email-body">
                <p>Hello <strong>${userName}</strong>,</p>
                
                <p>Your account has been successfully created! We're excited to have you on board.</p>
                
                <div class="credentials-box">
                  <p><strong>Your Login Credentials</strong></p>
                  <div style="margin-top: 20px;">
                    <p style="margin-bottom: 4px; color: ${this.colors.textLight};">Username</p>
                    <span class="credential-value">${username}</span>
                  </div>
                  <div style="margin-top: 16px;">
                    <p style="margin-bottom: 4px; color: ${this.colors.textLight};">Temporary Password</p>
                    <span class="credential-value">${temporaryPassword}</span>
                  </div>
                </div>
                
                <div class="button-container">
                  <a href="${loginUrl}" class="button">Access Your Account</a>
                </div>
                
                <div class="alert alert-danger">
                  <h4>🔒 Important Security Steps</h4>
                  <ul>
                    <li><strong>Change your password immediately</strong> after your first login</li>
                    <li>Choose a strong password with at least 8 characters</li>
                    <li>Never share your credentials with anyone</li>
                    <li>Keep this email in a secure location</li>
                  </ul>
                </div>
                
                <div class="divider"></div>
                
                <div class="alert alert-success">
                  <h4>✅ Getting Started</h4>
                  <p>After logging in, you'll be able to:</p>
                  <ul>
                    <li>Access your dashboard and tools</li>
                    <li>Update your profile settings</li>
                    <li>Start using Omega System features</li>
                  </ul>
                </div>
                
                <p style="margin-top: 24px;">If you have any questions or need assistance, please contact your system administrator.</p>
              </div>
              
              <div class="email-footer">
                <p><strong>Omega System</strong></p>
                <p>This is an automated email. Please do not reply to this message.</p>
                <p>&copy; ${new Date().getFullYear()} Omega System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
Welcome to Omega System!

Hello ${userName},

Your account has been successfully created! We're excited to have you on board.

YOUR LOGIN CREDENTIALS:
Username: ${username}
Temporary Password: ${temporaryPassword}

Login URL: ${loginUrl}

IMPORTANT SECURITY STEPS:
- Change your password immediately after your first login
- Choose a strong password with at least 8 characters
- Never share your credentials with anyone
- Keep this email in a secure location

If you have any questions or need assistance, please contact your system administrator.

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
   * إرسال إشعار بالبريد الإلكتروني للسكرتارية عند إنشاء نموذج جديد
   * UPDATED: Now always includes mohamed.m.mahmoud29@gmail.com
   */
  async sendFormNotificationEmail(recipients, secretariatName, employeeName, formType, formNumber, date) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      // Ensure recipients is an array
      let emailList = Array.isArray(recipients) ? recipients : [recipients];
      
      // Always include mohamed.m.mahmoud29@gmail.com
      const mandatoryEmail = 'mohamed.m.mahmoud29@gmail.com';
      if (!emailList.includes(mandatoryEmail)) {
        emailList.push(mandatoryEmail);
      }

      // Remove duplicates and filter out empty emails
      emailList = [...new Set(emailList)].filter(email => email && email.trim() !== '');

      const mailOptions = {
        from: `"Omega System" <${process.env.EMAIL_USER}>`,
        to: emailList.join(', '),
        subject: `نموذج جديد - ${formType}`,
        html: `
          <!DOCTYPE html>
          <html lang="ar" dir="rtl">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>نموذج جديد</title>
            <style>
              ${this.getEmailStyles()}
              body {
                font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
                direction: rtl;
                text-align: right;
              }
              .info-card p {
                text-align: right;
              }
            </style>
          </head>
          <body>
            <div class="email-wrapper">
              <div class="email-header">
                <div class="icon">📋</div>
                <h1>نموذج جديد يحتاج إلى مراجعة</h1>
              </div>
              
              <div class="email-body">
                <p>مرحباً <strong>${secretariatName}</strong>،</p>
                
                <p>تم إنشاء نموذج جديد من قبل أحد الموظفين ويتطلب مراجعتك والموافقة عليه.</p>
                
                <div class="info-card">
                  <p><strong>نوع النموذج:</strong> ${formType}</p>
                  <p><strong>رقم النموذج:</strong> ${formNumber}</p>
                  <p><strong>اسم الموظف:</strong> ${employeeName}</p>
                  <p><strong>تاريخ الإنشاء:</strong> ${date}</p>
                </div>
                
                <div class="button-container">
                  <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="button">مراجعة النموذج</a>
                </div>
                
                <div class="alert alert-warning">
                  <h4>⏱️ تنبيه</h4>
                  <p>يرجى مراجعة النموذج في أقرب وقت ممكن لضمان سير العمل بسلاسة.</p>
                </div>
                
                <div class="divider"></div>
                
                <p style="font-size: 14px; color: ${this.colors.textLight};">
                  يمكنك تسجيل الدخول إلى النظام لعرض تفاصيل النموذج الكاملة واتخاذ الإجراء المناسب.
                </p>
              </div>
              
              <div class="email-footer">
                <p><strong>نظام Omega</strong></p>
                <p>هذا بريد إلكتروني تلقائي. يرجى عدم الرد على هذه الرسالة.</p>
                <p>&copy; ${new Date().getFullYear()} Omega System. جميع الحقوق محفوظة.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
نموذج جديد يحتاج إلى مراجعة - نظام Omega

مرحباً ${secretariatName},

تم إنشاء نموذج جديد من قبل أحد الموظفين ويتطلب مراجعتك والموافقة عليه.

تفاصيل النموذج:
- نوع النموذج: ${formType}
- رقم النموذج: ${formNumber}
- اسم الموظف: ${employeeName}
- تاريخ الإنشاء: ${date}

يرجى تسجيل الدخول إلى النظام لمراجعة النموذج:
${process.env.FRONTEND_URL || 'http://localhost:3000'}/login

تنبيه: يرجى مراجعة النموذج في أقرب وقت ممكن لضمان سير العمل بسلاسة.

هذا بريد إلكتروني تلقائي من نظام Omega. يرجى عدم الرد.

© ${new Date().getFullYear()} Omega System. جميع الحقوق محفوظة.
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      logger.info(`Form notification email sent to: ${emailList.join(', ')}`);
      return {
        success: true,
        messageId: info.messageId,
        recipients: emailList
      };
    } catch (error) {
      logger.error('Failed to send form notification email', error);
      throw new Error('Failed to send form notification email');
    }
  }

  async sendTestEmail(to) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const mailOptions = {
        from: `"Omega System" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: 'Email Configuration Test - Omega System',
        html: `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Email Test</title>
            <style>${this.getEmailStyles()}</style>
          </head>
          <body>
            <div class="email-wrapper">
              <div class="email-header">
                <div class="icon">✅</div>
                <h1>Email Configuration Test</h1>
              </div>
              
              <div class="email-body">
                <div class="alert alert-success">
                  <h4>Success!</h4>
                  <p>Your email configuration is working correctly. This is a test message from Omega System.</p>
                </div>
                
                <p>If you received this email, it means:</p>
                <ul style="padding-left: 20px; margin: 16px 0;">
                  <li>SMTP settings are configured properly</li>
                  <li>Email authentication is working</li>
                  <li>Email delivery is operational</li>
                </ul>
                
                <div class="info-card">
                  <p><strong>Test Date:</strong> ${new Date().toLocaleString()}</p>
                  <p><strong>Recipient:</strong> ${to}</p>
                </div>
              </div>
              
              <div class="email-footer">
                <p><strong>Omega System</strong></p>
                <p>&copy; ${new Date().getFullYear()} Omega System. All rights reserved.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
Email Configuration Test - Omega System

Success! Your email configuration is working correctly.

If you received this email, it means:
- SMTP settings are configured properly
- Email authentication is working
- Email delivery is operational

Test Date: ${new Date().toLocaleString()}
Recipient: ${to}

© ${new Date().getFullYear()} Omega System. All rights reserved.
        `
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