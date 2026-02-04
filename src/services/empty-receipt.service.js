// src/services/empty-receipt.service.js - ENHANCED WITH EMAIL SENDING (MATCHING RECEIPTS PATTERN)
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');
const pdfGenerator = require('../utils/pdf-generator-empty-receipt.util');

const DATA_DIR = path.join(__dirname, '../../data/empty-receipts');
const PDFS_DIR = path.join(DATA_DIR, 'pdfs');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// ✅ Email configuration (matching receipts service)
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// ✅ Log configuration on startup
console.log('📧 Empty Receipt Email Configuration:');
console.log('  - Host:', EMAIL_HOST);
console.log('  - Port:', EMAIL_PORT);
console.log('  - User:', EMAIL_USER ? '✅ Configured' : '❌ Missing');
console.log('  - Password:', EMAIL_PASS ? '✅ Configured' : '❌ Missing');
console.log('  - From:', EMAIL_FROM);

class EmptyReceiptService {
  constructor() {
    this.ensureDataDirectory();
  }

  /**
   * Ensure data directory and index file exist
   */
  async ensureDataDirectory() {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.mkdir(PDFS_DIR, { recursive: true });
      
      try {
        await fs.access(INDEX_FILE);
      } catch {
        await fs.writeFile(INDEX_FILE, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Error ensuring data directory:', error);
    }
  }

  /**
   * Load users from JSON file
   */
  async loadUsers() {
    try {
      console.log('Loading users from:', USERS_FILE);
      const data = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      console.log('Loaded users count:', users.length);
      return users;
    } catch (error) {
      console.error('Error loading users file:', error);
      if (error.code === 'ENOENT') {
        console.error('Users file does not exist at:', USERS_FILE);
        return [];
      }
      throw error;
    }
  }

  /**
   * Get user name by ID
   */
  async getUserNameById(userId) {
    try {
      const users = await this.loadUsers();
      console.log('=== USER LOOKUP DEBUG ===');
      console.log('Looking for userId:', userId);
      console.log('Type of userId:', typeof userId);
      console.log('All user IDs in database:');
      users.forEach(u => {
        console.log(`  - ID: "${u.id}" (type: ${typeof u.id}) | Name: "${u.name}"`);
      });
      
      let user = users.find(u => u.id === userId);
      
      if (!user && typeof userId !== 'string') {
        const userIdStr = String(userId);
        console.log('Trying string conversion:', userIdStr);
        user = users.find(u => u.id === userIdStr);
      }
      
      if (!user && typeof userId === 'string') {
        const userIdTrimmed = userId.trim();
        console.log('Trying trimmed version:', userIdTrimmed);
        user = users.find(u => u.id.trim() === userIdTrimmed);
      }
      
      if (user) {
        console.log('✓ Found user:', user.name);
        console.log('========================');
        return user.name;
      } else {
        console.log('✗ User not found for ID:', userId);
        console.log('========================');
        return null;
      }
    } catch (error) {
      console.error('Error getting user name:', error);
      return null;
    }
  }

  /**
   * Read index file
   */
  async readIndex() {
    try {
      const data = await fs.readFile(INDEX_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading index file:', error);
      return [];
    }
  }

  /**
   * Write index file
   */
  async writeIndex(data) {
    try {
      await fs.writeFile(INDEX_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing index file:', error);
      throw error;
    }
  }

  /**
   * Add creator names to receipts
   */
  async enrichReceiptsWithCreatorNames(receipts) {
    const users = await this.loadUsers();
    
    return Promise.all(receipts.map(async receipt => {
      const user = users.find(u => u.id === receipt.createdBy);
      
      if (user && user.name) {
        return {
          ...receipt,
          createdByName: user.name
        };
      } else {
        return {
          ...receipt,
          createdByName: 'Unknown User'
        };
      }
    }));
  }

  /**
   * Generate receipt number (like ER-00001)
   */
  async generateReceiptNumber() {
    const receipts = await this.readIndex();
    
    if (receipts.length === 0) {
      return 'ER-00001';
    }

    const receiptNumberPattern = /ER-(\d+)/;
    const numberedReceipts = receipts
      .filter(r => r.receiptNumber && receiptNumberPattern.test(r.receiptNumber))
      .map(r => {
        const match = r.receiptNumber.match(receiptNumberPattern);
        return match ? parseInt(match[1]) : 0;
      });

    if (numberedReceipts.length === 0) {
      return 'ER-00001';
    }

    const maxNumber = Math.max(...numberedReceipts);
    const newNumber = maxNumber + 1;
    
    return `ER-${String(newNumber).padStart(5, '0')}`;
  }

  /**
   * Generate empty receipt PDF with header only
   */
  async generateEmptyReceiptPDF(language = 'ar', userId, userRole) {
    try {
      console.log('\n=== CREATE EMPTY RECEIPT DEBUG ===');
      console.log('userId:', userId);
      console.log('userId type:', typeof userId);
      console.log('userRole:', userRole);
      
      console.log('🔵 Generating empty receipt PDF in language:', language);
      
      console.log('Calling getUserNameById with:', userId);
      const createdByName = await this.getUserNameById(userId);
      console.log('getUserNameById returned:', createdByName);
      console.log('createdByName is null?', createdByName === null);
      console.log('createdByName is undefined?', createdByName === undefined);
      console.log('============================\n');
      
      const receiptNumber = await this.generateReceiptNumber();
      console.log('📋 Generated receipt number:', receiptNumber);
      
      const pdfResult = await pdfGenerator.generateEmptyReceiptPDF(language);
      
      console.log('✅ Empty receipt PDF generated:', pdfResult.filename);
      
      const receipts = await this.readIndex();
      
      const newReceipt = {
        id: this.generateId(receipts),
        receiptNumber: receiptNumber,
        filename: pdfResult.filename,
        pdfFilename: pdfResult.filename,
        language: language,
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userId,
        createdByName: createdByName || 'Unknown User',
        createdByRole: userRole || 'user',
        pdfGenerated: true
      };
      
      console.log('💾 Saving receipt record:', newReceipt);
      
      receipts.unshift(newReceipt);
      await this.writeIndex(receipts);
      
      console.log('✅ Receipt saved to index successfully');
      console.log('Empty receipt created with name:', newReceipt.createdByName);
      
      return {
        id: newReceipt.id,
        receiptNumber: newReceipt.receiptNumber,
        filename: pdfResult.filename,
        filepath: pdfResult.filepath,
        language: pdfResult.language,
        success: true
      };
    } catch (error) {
      console.error('❌ Error generating empty receipt:', error);
      throw new Error(`Failed to generate empty receipt: ${error.message}`);
    }
  }

  /**
   * Create empty receipt without PDF generation
   */
  async create(receiptData) {
    const receipts = await this.readIndex();
    
    const receiptNumber = await this.generateReceiptNumber();
    const newReceipt = {
      id: this.generateId(receipts),
      receiptNumber,
      notes: receiptData.notes || '',
      language: receiptData.language || 'ar',
      createdBy: receiptData.createdBy,
      createdByRole: receiptData.createdByRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pdfGenerated: false,
      pdfFilename: null,
      filename: null
    };

    const createdByName = await this.getUserNameById(receiptData.createdBy);
    newReceipt.createdByName = createdByName || 'Unknown User';

    receipts.unshift(newReceipt);
    await this.writeIndex(receipts);

    return newReceipt;
  }

  /**
   * Get empty receipt by ID
   */
  async getById(id) {
    const receipts = await this.readIndex();
    let receipt = receipts.find(r => r.id === parseInt(id));

    if (!receipt) {
      throw new Error('Empty receipt not found');
    }

    const enriched = await this.enrichReceiptsWithCreatorNames([receipt]);
    return enriched[0];
  }

  /**
   * Get empty receipt by receipt number
   */
  async getByReceiptNumber(receiptNumber) {
    const receipts = await this.readIndex();
    let receipt = receipts.find(r => r.receiptNumber === receiptNumber);

    if (!receipt) {
      throw new Error('Empty receipt not found');
    }

    const enriched = await this.enrichReceiptsWithCreatorNames([receipt]);
    return enriched[0];
  }

  /**
   * Update empty receipt
   */
  async update(id, updateData) {
    const receipts = await this.readIndex();
    const index = receipts.findIndex(r => r.id === parseInt(id));

    if (index === -1) {
      throw new Error('Empty receipt not found');
    }

    receipts[index] = {
      ...receipts[index],
      ...updateData,
      updatedAt: new Date().toISOString()
    };

    await this.writeIndex(receipts);

    const enriched = await this.enrichReceiptsWithCreatorNames([receipts[index]]);
    return enriched[0];
  }

  /**
   * Generate unique ID for new receipt
   */
  generateId(receipts) {
    if (receipts.length === 0) return 1;
    const maxId = Math.max(...receipts.map(r => parseInt(r.id) || 0));
    return maxId + 1;
  }

  /**
   * Get all empty receipts with pagination and search
   */
  async getAllEmptyReceipts(params = {}) {
    try {
      const { search, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', startDate, endDate, createdBy } = params;
      
      let receipts = await this.readIndex();
      
      console.log(`📊 Total receipts in index: ${receipts.length}`);
      
      receipts = await this.enrichReceiptsWithCreatorNames(receipts);
      
      if (startDate) {
        receipts = receipts.filter(r => new Date(r.createdAt) >= new Date(startDate));
      }

      if (endDate) {
        receipts = receipts.filter(r => new Date(r.createdAt) <= new Date(endDate));
      }

      if (createdBy) {
        receipts = receipts.filter(r => r.createdBy === createdBy);
      }
      
      if (search && search !== 'undefined' && search.trim() !== '') {
        const searchLower = search.toLowerCase();
        receipts = receipts.filter(receipt => 
          (receipt.filename && receipt.filename.toLowerCase().includes(searchLower)) ||
          (receipt.receiptNumber && receipt.receiptNumber.toLowerCase().includes(searchLower)) ||
          (receipt.createdByName && receipt.createdByName.toLowerCase().includes(searchLower)) ||
          (receipt.notes && receipt.notes.toLowerCase().includes(searchLower)) ||
          (receipt.language && receipt.language.toLowerCase().includes(searchLower))
        );
        console.log(`🔍 After search filter: ${receipts.length} receipts`);
      }

      receipts.sort((a, b) => {
        let aVal = a[sortBy];
        let bVal = b[sortBy];

        if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
          aVal = new Date(aVal);
          bVal = new Date(bVal);
        }

        if (sortOrder === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
      
      const totalReceipts = receipts.length;
      const totalPages = Math.ceil(totalReceipts / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      
      const paginatedReceipts = receipts.slice(startIndex, endIndex);
      
      if (paginatedReceipts.length > 0) {
        console.log('📄 First receipt data:', paginatedReceipts[0]);
      }
      
      return {
        receipts: paginatedReceipts,
        data: paginatedReceipts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalReceipts,
          limit: parseInt(limit)
        }
      };
    } catch (error) {
      console.error('❌ Error fetching empty receipts:', error);
      throw new Error(`Failed to fetch empty receipts: ${error.message}`);
    }
  }

  /**
   * Alias for getAllEmptyReceipts
   */
  async getAll(filters = {}) {
    return this.getAllEmptyReceipts(filters);
  }

  /**
   * Delete empty receipt with file management integration
   */
  async deleteEmptyReceipt(id) {
    try {
      const receipts = await this.readIndex();
      const receiptIndex = receipts.findIndex(r => r.id === parseInt(id));
      
      if (receiptIndex === -1) {
        throw new Error('Empty receipt not found');
      }
      
      const receipt = receipts[receiptIndex];
      
      // Delete from file management
      if (receipt.pdfFilename) {
        const fileManagementService = require('./File-management.service');
        try {
          await fileManagementService.deleteFileByFilename(receipt.pdfFilename);
          console.log('✅ Empty Receipt: File removed from File Management');
        } catch (error) {
          console.log('⚠️ Empty Receipt: File Management deletion warning:', error.message);
        }
      }
      
      // Delete physical file
      const possiblePaths = [
        path.join(DATA_DIR, receipt.filename),
        path.join(PDFS_DIR, receipt.filename)
      ];

      for (const pdfPath of possiblePaths) {
        try {
          await fs.unlink(pdfPath);
          console.log('✅ Physical file deleted:', receipt.filename);
          break;
        } catch (fileError) {
          // Continue to next path
        }
      }
      
      receipts.splice(receiptIndex, 1);
      await this.writeIndex(receipts);
      
      console.log('✅ Empty receipt deleted from index:', id);
      
      return { success: true, message: 'Empty receipt deleted successfully', receipt };
    } catch (error) {
      console.error('❌ Error deleting empty receipt:', error);
      throw new Error(`Failed to delete empty receipt: ${error.message}`);
    }
  }

  /**
   * Alias for deleteEmptyReceipt
   */
  async delete(id) {
    return this.deleteEmptyReceipt(id);
  }

  /**
   * Generate PDF for existing receipt
   */
  async generatePdf(id) {
    const receipt = await this.getById(id);
    
    if (receipt.pdfGenerated && receipt.pdfFilename) {
      console.log('⚠️ PDF already exists for this receipt');
      return receipt;
    }

    const language = receipt.language || 'ar';
    const pdfResult = await pdfGenerator.generateEmptyReceiptPDF(language);
    
    const updatedReceipt = await this.update(id, {
      pdfGenerated: true,
      pdfFilename: pdfResult.filename,
      filename: pdfResult.filename
    });

    return updatedReceipt;
  }

  /**
   * Get PDF path for download
   */
  async getPdfPath(id) {
    const receipt = await this.getById(id);

    if (!receipt.pdfGenerated || !receipt.pdfFilename) {
      throw new Error('PDF not generated yet');
    }

    const possiblePaths = [
      path.join(DATA_DIR, receipt.pdfFilename),
      path.join(PDFS_DIR, receipt.pdfFilename)
    ];

    for (const pdfPath of possiblePaths) {
      const fsSync = require('fs');
      if (fsSync.existsSync(pdfPath)) {
        return pdfPath;
      }
    }

    throw new Error('PDF file not found');
  }

  /**
   * Get PDF file path (for backward compatibility)
   */
  getPDFPath(filename) {
    const fsSync = require('fs');
    const possiblePaths = [
      path.join(DATA_DIR, filename),
      path.join(PDFS_DIR, filename)
    ];

    for (const pdfPath of possiblePaths) {
      if (fsSync.existsSync(pdfPath)) {
        return pdfPath;
      }
    }

    return path.join(DATA_DIR, filename);
  }

  /**
   * Get statistics (role-based)
   */
  async getStats(userId = null) {
    let receipts = await this.readIndex();
    
    if (userId) {
      receipts = receipts.filter(r => r.createdBy === userId);
    }
    
    const enriched = await this.enrichReceiptsWithCreatorNames(receipts);

    return {
      total: receipts.length,
      withPdf: receipts.filter(r => r.pdfGenerated).length,
      withoutPdf: receipts.filter(r => !r.pdfGenerated).length,
      byLanguage: {
        ar: receipts.filter(r => r.language === 'ar').length,
        en: receipts.filter(r => r.language === 'en').length
      },
      recentReceipts: enriched.slice(0, 10)
    };
  }

  /**
   * Reset counter
   */
  async resetCounter() {
    const receipts = await this.readIndex();
    
    return {
      message: 'Counter information',
      currentCount: receipts.length,
      lastNumber: receipts.length > 0 ? receipts[0].receiptNumber : 'None',
      warning: 'Counter reset should be implemented with caution in production'
    };
  }

  /**
   * ✅ Send empty receipt PDF by email (matching receipts pattern)
   */
  async sendReceiptByEmail(receiptId, userId, userRole, recipientEmail) {
    try {
      console.log('\n📧 === SEND EMPTY RECEIPT EMAIL DEBUG ===');
      console.log('Receipt ID:', receiptId);
      console.log('User ID:', userId);
      console.log('Recipient:', recipientEmail);
      
      // Check credentials first
      if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('❌ Email credentials missing!');
        console.error('EMAIL_USER:', EMAIL_USER ? '✅ Set' : '❌ Not set');
        console.error('EMAIL_PASS:', EMAIL_PASS ? '✅ Set' : '❌ Not set');
        throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
      }

      // Get receipt
      const receipt = await this.getById(receiptId);
      console.log('✅ Receipt found:', receipt.receiptNumber || receipt.filename);

      // Check if PDF exists
      if (!receipt.pdfGenerated || !receipt.pdfFilename) {
        throw new Error('PDF not generated yet. Please generate PDF first.');
      }

      const pdfPath = await this.getPdfPath(receiptId);

      const fsSync = require('fs');
      if (!fsSync.existsSync(pdfPath)) {
        throw new Error('PDF file not found');
      }
      console.log('✅ PDF file found');

      // Get creator's information
      const users = await this.loadUsers();
      const creator = users.find(u => u.id === receipt.createdBy);
      
      const senderName = creator && creator.name ? creator.name : 'Omega System';
      const creatorEmail = creator && creator.email ? creator.email : null;
      
      console.log('✅ Creator info:', { name: senderName, hasEmail: !!creatorEmail });

      // Create transporter with system credentials
      console.log('📧 Creating email transporter...');
      console.log('  - Host:', EMAIL_HOST);
      console.log('  - Port:', EMAIL_PORT);
      console.log('  - User:', EMAIL_USER);
      
      const transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_PORT === 465,
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // Verify connection
      console.log('🔄 Verifying SMTP connection...');
      await transporter.verify();
      console.log('✅ SMTP connection verified');

      // Email subject and body
      const receiptNumber = receipt.receiptNumber || receipt.filename;
      const subject = `Empty Receipt ${receiptNumber}`;
      const text = `Please find attached the empty receipt ${receiptNumber}.\n\nLanguage: ${receipt.language === 'ar' ? 'Arabic' : 'English'}\nDate: ${receipt.createdAt}\n\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Empty Receipt ${receiptNumber}</h2>
          </div>
          <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 10px 10px;">
            <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">Please find attached the empty receipt document.</p>
            <table style="border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Receipt Number:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1565C0; font-weight: 600;">${receiptNumber}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Language:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${receipt.language === 'ar' ? 'Arabic' : 'English'}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; font-weight: bold; color: #334155;">Sent By:</td>
                <td style="padding: 12px 16px; color: #475569;">${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}</td>
              </tr>
            </table>
            <div style="margin-top: 20px; padding: 16px; background: #e0f2fe; border-left: 4px solid #1565C0; border-radius: 6px;">
              <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
                <strong>Note:</strong> This is an automated email from Omega System.
              </p>
            </div>
          </div>
        </div>
      `;

      // Send email using system credentials
      console.log('📧 Sending email...');
      const mailOptions = {
        from: `"${senderName} - Omega System" <${EMAIL_USER}>`,
        to: recipientEmail,
        subject: subject,
        text: text,
        html: html,
        attachments: [
          {
            filename: `Empty_Receipt_${receiptNumber}.pdf`,
            path: pdfPath,
          },
        ],
      };

      // Add reply-to if creator has email
      if (creatorEmail) {
        mailOptions.replyTo = creatorEmail;
        console.log('✅ Reply-to set:', creatorEmail);
      }

      const info = await transporter.sendMail(mailOptions);

      console.log('✅ Email sent successfully!');
      console.log('  - Message ID:', info.messageId);
      console.log('  - From:', EMAIL_USER);
      console.log('  - To:', recipientEmail);
      console.log('  - Sender Name:', senderName);
      if (creatorEmail) {
        console.log('  - Reply-To:', creatorEmail);
      }
      console.log('========================\n');

      return {
        message: 'Email sent successfully',
        messageId: info.messageId,
        sentFrom: EMAIL_USER,
        sentBy: senderName,
        replyTo: creatorEmail || null
      };
    } catch (error) {
      console.error('❌ Email sending error:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        command: error.command
      });
      
      // Provide helpful error messages
      let errorMessage = error.message;
      if (error.code === 'EAUTH') {
        errorMessage = 'Email authentication failed. Please check your EMAIL_USER and EMAIL_APP_PASSWORD in .env file.';
      } else if (error.code === 'ESOCKET') {
        errorMessage = 'Cannot connect to email server. Please check your EMAIL_HOST and EMAIL_PORT settings.';
      } else if (error.message.includes('Missing credentials')) {
        errorMessage = 'Email credentials are not configured. Please set EMAIL_USER and EMAIL_APP_PASSWORD in your .env file.';
      }
      
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }
}

module.exports = new EmptyReceiptService();