// src/services/rfq.service.js - UPDATED WITH EMAIL SENDING AND CUSTOM FILENAME

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const atomicWrite = require('../utils/atomic-write.util');
const rfqPdfGenerator = require('../utils/pdf-generator-rfq.util');

const RFQS_FILE = path.join(__dirname, '../../data/rfqs/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');
const STATIC_PDF_PATH = path.join(__dirname, '../../data/Terms And Conditions/terms-and-conditions.pdf');

// ✅ Email configuration with proper credential checks
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// ✅ Log configuration on startup (without exposing password)
console.log('📧 RFQ Email Configuration:');
console.log('  - Host:', EMAIL_HOST);
console.log('  - Port:', EMAIL_PORT);
console.log('  - User:', EMAIL_USER ? '✅ Configured' : '❌ Missing');
console.log('  - Password:', EMAIL_PASS ? '✅ Configured' : '❌ Missing');
console.log('  - From:', EMAIL_FROM);

class RFQService {
  async loadRFQs() {
    try {
      const data = await fs.readFile(RFQS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async saveRFQs(rfqs) {
    await atomicWrite(RFQS_FILE, JSON.stringify(rfqs, null, 2));
  }

  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.RFQ || 0;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  async saveCounter(counter) {
    try {
      let counters = {};
      try {
        const data = await fs.readFile(COUNTER_FILE, 'utf8');
        counters = JSON.parse(data);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
      
      counters.RFQ = counter;
      await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
    } catch (error) {
      throw error;
    }
  }

  async getUserName(userId) {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      
      const user = users.find(u => u.id === userId);
      
      if (user) {
        return user.name || user.username || userId;
      }
      
      return userId;
    } catch (error) {
      console.log('Could not fetch user name:', error.message);
      return userId;
    }
  }

  /**
   * ✅ NEW: Load users from JSON file
   */
  async loadUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      return users;
    } catch (error) {
      console.error('Error loading users file:', error);
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  generateRFQNumber(counter) {
    const paddedNumber = String(counter).padStart(4, '0');
    return `RFQ${paddedNumber}`;
  }

  async resetRFQCounter() {
    const oldCounter = await this.loadCounter();
    const rfqs = await this.loadRFQs();
    const deletedCount = rfqs.length;
    
    await this.saveCounter(0);
    await this.saveRFQs([]);

    return {
      oldCounter,
      newCounter: 0,
      deletedRFQs: deletedCount,
      nextRFQNumber: this.generateRFQNumber(1),
      message: `Counter reset to 0 and ${deletedCount} RFQ(s) deleted`
    };
  }

  detectLanguage(text) {
    if (!text) return 'en';
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  detectRFQLanguage(rfqData) {
    const fieldsToCheck = [
      rfqData.production,
      rfqData.supplier,
      rfqData.supplierAddress,
      rfqData.notes
    ];

    if (rfqData.items && rfqData.items.length > 0) {
      rfqData.items.forEach(item => {
        if (item.description) {
          fieldsToCheck.push(item.description);
        }
      });
    }

    let arabicCount = 0;
    let totalFields = 0;

    fieldsToCheck.forEach(field => {
      if (field) {
        totalFields++;
        if (this.detectLanguage(field) === 'ar') {
          arabicCount++;
        }
      }
    });

    return arabicCount > (totalFields / 2) ? 'ar' : 'en';
  }

  async createRFQ(rfqData, userId, userRole) {
    console.log('\n=== CREATE RFQ DEBUG ===');
    console.log('includeStaticFile:', rfqData.includeStaticFile);
    
    const rfqs = await this.loadRFQs();
    
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    
    const paddedCounter = String(newCounter).padStart(4, '0');
    const id = `RFQ-${paddedCounter}`;
    const rfqNumber = this.generateRFQNumber(newCounter);
    
    await this.saveCounter(newCounter);

    const today = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().split(' ')[0];

    const detectedLanguage = rfqData.forceLanguage || this.detectRFQLanguage(rfqData);

    const userName = await this.getUserName(userId);

    let requesterName = rfqData.requester;
    if (!requesterName || requesterName.trim() === '') {
      requesterName = userName;
    }

    const newRFQ = {
      id,
      rfqNumber,
      date: rfqData.date || today,
      time: rfqData.time || currentTime,
      requester: requesterName,
      production: rfqData.production || '',
      supplier: rfqData.supplier || '',
      supplierAddress: rfqData.supplierAddress || '',
      urgent: rfqData.urgent || false,
      items: rfqData.items || [],
      notes: rfqData.notes || '',
      includeStaticFile: rfqData.includeStaticFile || false,
      language: detectedLanguage,
      status: 'pending',
      createdBy: userId,
      createdByName: userName,
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    rfqs.push(newRFQ);
    await this.saveRFQs(rfqs);

    console.log('RFQ created with includeStaticFile:', newRFQ.includeStaticFile);
    return newRFQ;
  }

  async getAllRFQs(filters = {}, userId, userRole) {
    let rfqs = await this.loadRFQs();

    if (userRole === 'employee' || userRole === 'admin') {
      rfqs = rfqs.filter(r => r.createdBy === userId);
    }

    if (filters.rfqNumber) {
      rfqs = rfqs.filter(r => 
        r.rfqNumber.toLowerCase().includes(filters.rfqNumber.toLowerCase())
      );
    }

    if (filters.startDate) {
      rfqs = rfqs.filter(r => r.date >= filters.startDate);
    }
    if (filters.endDate) {
      rfqs = rfqs.filter(r => r.date <= filters.endDate);
    }

    if (filters.supplier) {
      rfqs = rfqs.filter(r => 
        r.supplier.toLowerCase().includes(filters.supplier.toLowerCase())
      );
    }

    if (filters.production) {
      rfqs = rfqs.filter(r => 
        r.production.toLowerCase().includes(filters.production.toLowerCase())
      );
    }

    if (filters.status) {
      rfqs = rfqs.filter(r => r.status === filters.status);
    }

    if (filters.urgent !== undefined) {
      const isUrgent = filters.urgent === 'true' || filters.urgent === true;
      rfqs = rfqs.filter(r => r.urgent === isUrgent);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      rfqs = rfqs.filter(r =>
        r.rfqNumber.toLowerCase().includes(searchLower) ||
        r.supplier.toLowerCase().includes(searchLower) ||
        r.production.toLowerCase().includes(searchLower) ||
        (r.supplierAddress && r.supplierAddress.toLowerCase().includes(searchLower)) ||
        r.notes.toLowerCase().includes(searchLower)
      );
    }

    rfqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedRFQs = rfqs.slice(startIndex, endIndex);

    for (let rfq of paginatedRFQs) {
      if (!rfq.createdByName) {
        rfq.createdByName = await this.getUserName(rfq.createdBy);
      }
    }

    return {
      rfqs: paginatedRFQs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(rfqs.length / limit),
        totalRFQs: rfqs.length,
        limit
      }
    };
  }

  async getRFQById(id, userId, userRole) {
    const rfqs = await this.loadRFQs();
    const rfq = rfqs.find(r => r.id === id);

    if (!rfq) {
      throw new Error('RFQ not found');
    }

    if (userRole === 'employee' || userRole === 'admin') {
      if (rfq.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own RFQs');
      }
    }

    if (!rfq.createdByName) {
      rfq.createdByName = await this.getUserName(rfq.createdBy);
    }

    return rfq;
  }

  async updateRFQ(id, updateData, userId, userRole) {
    const rfqs = await this.loadRFQs();
    const rfqIndex = rfqs.findIndex(r => r.id === id);

    if (rfqIndex === -1) {
      throw new Error('RFQ not found');
    }

    const rfq = rfqs[rfqIndex];

    if (userRole === 'employee' || userRole === 'admin') {
      if (rfq.createdBy !== userId) {
        throw new Error('Access denied: You can only edit your own RFQs');
      }
    }

    if (updateData.date) rfq.date = updateData.date;
    if (updateData.time) rfq.time = updateData.time;
    if (updateData.requester !== undefined) rfq.requester = updateData.requester;
    if (updateData.production !== undefined) rfq.production = updateData.production;
    if (updateData.supplier !== undefined) rfq.supplier = updateData.supplier;
    if (updateData.supplierAddress !== undefined) rfq.supplierAddress = updateData.supplierAddress;
    if (updateData.urgent !== undefined) rfq.urgent = updateData.urgent;
    if (updateData.items) rfq.items = updateData.items;
    if (updateData.notes !== undefined) rfq.notes = updateData.notes;
    if (updateData.status) rfq.status = updateData.status;
    if (updateData.includeStaticFile !== undefined) rfq.includeStaticFile = updateData.includeStaticFile;

    const detectedLanguage = updateData.forceLanguage || this.detectRFQLanguage(rfq);
    rfq.language = detectedLanguage;

    rfq.updatedAt = new Date().toISOString();

    if (!rfq.createdByName) {
      rfq.createdByName = await this.getUserName(rfq.createdBy);
    }

    rfqs[rfqIndex] = rfq;
    await this.saveRFQs(rfqs);

    return rfq;
  }

  async deleteRFQ(id) {
    const rfqs = await this.loadRFQs();
    const rfqIndex = rfqs.findIndex(r => r.id === id);

    if (rfqIndex === -1) throw new Error('RFQ not found');

    const rfq = rfqs[rfqIndex];
    
    // Delete from File Management
    if (rfq.pdfFilename) {
      const fileManagementService = require('./File-management.service');
      try {
        await fileManagementService.deleteFileByFilename(rfq.pdfFilename);
        console.log('✅ RFQ: File removed from File Management');
      } catch (error) {
        console.log('⚠️ RFQ: File Management deletion warning:', error.message);
      }
      
      // Delete physical PDF file
      const pdfPath = path.join(__dirname, '../../data/rfqs/pdfs', rfq.pdfFilename);
      if (fsSync.existsSync(pdfPath)) {
        try {
          fsSync.unlinkSync(pdfPath);
        } catch (err) {
          console.log('Could not delete PDF:', err.message);
        }
      }
    }

    rfqs.splice(rfqIndex, 1);
    await this.saveRFQs(rfqs);

    return { message: 'RFQ deleted successfully' };
  }

  async getRFQStats(userId, userRole) {
    let rfqs = await this.loadRFQs();

    if (userRole === 'employee' || userRole === 'admin') {
      rfqs = rfqs.filter(r => r.createdBy === userId);
    }

    const stats = {
      totalRFQs: rfqs.length,
      pending: rfqs.filter(r => r.status === 'pending').length,
      approved: rfqs.filter(r => r.status === 'approved').length,
      rejected: rfqs.filter(r => r.status === 'rejected').length,
      urgent: rfqs.filter(r => r.urgent === true).length,
      thisMonth: 0,
      thisWeek: 0,
      today: 0
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    rfqs.forEach(rfq => {
      const rfqDate = new Date(rfq.createdAt);
      
      if (rfqDate >= startOfMonth) stats.thisMonth++;
      if (rfqDate >= startOfWeek) stats.thisWeek++;
      if (rfqDate >= startOfDay) stats.today++;
    });

    return stats;
  }

  /**
   * ✅ GENERATE RFQ PDF WITH CUSTOM FILENAME PATTERN: RFQ0001_Requester_DD-MM-YYYY.pdf
   */
  async generateRFQPDF(id, userId, userRole, attachmentPdf = null) {
    const rfq = await this.getRFQById(id, userId, userRole);
    
    if (!rfq.requester || rfq.requester.trim() === '') {
      rfq.requester = await this.getUserName(userId);
    }
    
    console.log('🔵 Generating PDF for RFQ:', rfq.rfqNumber);
    console.log('🔵 Include static file:', rfq.includeStaticFile);
    
    // ✅ Create custom filename: RFQ0001_Requester_DD-MM-YYYY
    const sanitizeFilename = (str) => {
      if (!str) return 'Unknown';
      return str.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, '_').substring(0, 30);
    };
    
    // ✅ Format date as DD-MM-YYYY
    const formatDate = (dateStr) => {
      if (!dateStr) {
        const today = new Date().toISOString().split('T')[0];
        const [year, month, day] = today.split('-');
        return `${day}-${month}-${year}`;
      }
      const [year, month, day] = dateStr.split('-');
      return `${day}-${month}-${year}`;
    };
    
    const rfqNumber = rfq.rfqNumber || 'RFQ0000';
    const requesterName = sanitizeFilename(rfq.requester);
    const dateFormatted = formatDate(rfq.date);
    const customFilename = `${rfqNumber}_${requesterName}_${dateFormatted}`;

    console.log('📝 Custom filename:', customFilename);
    
    const pdfResult = await rfqPdfGenerator.generateRFQPDF(rfq, customFilename);
    
    const pdfsToMerge = [];
    
    if (attachmentPdf) {
      const isValid = await rfqPdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        pdfsToMerge.push(attachmentPdf);
        console.log('✅ Added user attachment PDF to merge list');
      } else {
        console.warn('⚠️ Invalid user attachment PDF, skipping');
      }
    }
    
    let staticPdfPath = null;
    if (rfq.includeStaticFile === true) {
      try {
        const fsSync = require('fs');
        if (fsSync.existsSync(STATIC_PDF_PATH)) {
          const staticPdfBytes = fsSync.readFileSync(STATIC_PDF_PATH);
          pdfsToMerge.push(staticPdfBytes);
          staticPdfPath = STATIC_PDF_PATH;
          console.log('✅ Added static PDF to merge list');
        } else {
          console.warn('⚠️ Static PDF file not found at:', STATIC_PDF_PATH);
        }
      } catch (error) {
        console.error('❌ Error reading static PDF:', error.message);
      }
    }
    
    let finalPdfResult = pdfResult;
    try {
      if (pdfsToMerge.length > 0) {
        console.log(`🔄 Merging ${pdfsToMerge.length} PDF(s) with RFQ...`);
        
        let currentPath = pdfResult.filepath;
        
        for (let i = 0; i < pdfsToMerge.length; i++) {
          const mergeResult = await rfqPdfGenerator.mergePDFs(
            currentPath,
            pdfsToMerge[i],
            null,
            pdfResult.language
          );
          currentPath = mergeResult.filepath;
          
          if (i === pdfsToMerge.length - 1) {
            finalPdfResult = {
              ...pdfResult,
              filename: mergeResult.filename,
              filepath: mergeResult.filepath,
              merged: true,
              pageCount: mergeResult.pageCount
            };
          }
        }
        
        console.log('✅ PDF merge completed successfully');
      } else {
        const headerResult = await rfqPdfGenerator.mergePDFs(
          pdfResult.filepath,
          null,
          null,
          pdfResult.language
        );
        
        finalPdfResult = {
          ...pdfResult,
          filename: headerResult.filename,
          filepath: headerResult.filepath,
          merged: false,
          pageCount: headerResult.pageCount
        };
      }
    } catch (mergeError) {
      console.error('❌ PDF merge/header failed:', mergeError.message);
      finalPdfResult.mergeError = mergeError.message;
    }
    
    const rfqs = await this.loadRFQs();
    const rfqIndex = rfqs.findIndex(r => r.id === id);
    
    if (rfqIndex !== -1) {
      rfqs[rfqIndex].pdfFilename = finalPdfResult.filename;
      rfqs[rfqIndex].pdfLanguage = finalPdfResult.language;
      rfqs[rfqIndex].pdfGeneratedAt = new Date().toISOString();
      rfqs[rfqIndex].pdfMerged = finalPdfResult.merged || false;
      if (finalPdfResult.pageCount) {
        rfqs[rfqIndex].pdfPageCount = finalPdfResult.pageCount;
      }
      await this.saveRFQs(rfqs);
    }
    
    return {
      rfq,
      pdf: finalPdfResult
    };
  }

  /**
   * ✅ Send RFQ PDF by email with custom filename DD-MM-YYYY format
   */
  async sendRFQByEmail(rfqId, userId, userRole, recipientEmail) {
    try {
      console.log('\n📧 === SEND RFQ EMAIL DEBUG ===');
      console.log('RFQ ID:', rfqId);
      console.log('User ID:', userId);
      console.log('Recipient:', recipientEmail);
      
      // ✅ Check credentials first
      if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('❌ Email credentials missing!');
        console.error('EMAIL_USER:', EMAIL_USER ? '✅ Set' : '❌ Not set');
        console.error('EMAIL_PASS:', EMAIL_PASS ? '✅ Set' : '❌ Not set');
        throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
      }

      // Get RFQ
      const rfq = await this.getRFQById(rfqId, userId, userRole);
      console.log('✅ RFQ found:', rfq.rfqNumber);

      if (!rfq.pdfFilename) {
        throw new Error('PDF not generated yet. Please generate PDF first.');
      }

      const pdfPath = path.join(__dirname, '../../data/rfqs/pdfs', rfq.pdfFilename);

      if (!fsSync.existsSync(pdfPath)) {
        throw new Error('PDF file not found');
      }
      console.log('✅ PDF file found');

      // Get creator's information
      const users = await this.loadUsers();
      const creator = users.find(u => u.id === rfq.createdBy);
      
      const senderName = creator && creator.name ? creator.name : 'Omega System';
      const creatorEmail = creator && creator.email ? creator.email : null;
      
      console.log('✅ Creator info:', { name: senderName, hasEmail: !!creatorEmail });

      // ✅ Create transporter with system credentials
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

      // ✅ Verify connection
      console.log('🔄 Verifying SMTP connection...');
      await transporter.verify();
      console.log('✅ SMTP connection verified');

      // Email subject and body
      const subject = `Request for Quotation ${rfq.rfqNumber}`;
      const text = `Please find attached the Request for Quotation ${rfq.rfqNumber}.\n\nSupplier: ${rfq.supplier || 'N/A'}\nDate: ${rfq.date}\nDepartment: ${rfq.production || 'N/A'}\n${rfq.urgent ? 'URGENT REQUEST\n' : ''}\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Request for Quotation ${rfq.rfqNumber}</h2>
            ${rfq.urgent ? '<div style="background: #ef4444; color: white; padding: 8px 12px; border-radius: 6px; margin-top: 10px; font-weight: 600; text-align: center;">⚠️ URGENT REQUEST</div>' : ''}
          </div>
          <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 10px 10px;">
            <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">Please find attached the Request for Quotation document.</p>
            <table style="border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">RFQ Number:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1565C0; font-weight: 600;">${rfq.rfqNumber}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Date:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${rfq.date}</td>
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

      // ✅ Create custom email attachment filename: RFQ0001_Requester_DD-MM-YYYY.pdf
      const sanitizeFilename = (str) => {
        if (!str) return 'Unknown';
        return str.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, '_').substring(0, 30);
      };
      
      // ✅ Format date as DD-MM-YYYY
      const formatDate = (dateStr) => {
        if (!dateStr) {
          const today = new Date().toISOString().split('T')[0];
          const [year, month, day] = today.split('-');
          return `${day}-${month}-${year}`;
        }
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
      };
      
      const rfqNumber = rfq.rfqNumber || 'RFQ0000';
      const requesterName = sanitizeFilename(rfq.requester);
      const dateFormatted = formatDate(rfq.date);
      const emailAttachmentName = `${rfqNumber}_${requesterName}_${dateFormatted}.pdf`;

      // ✅ Send email using system credentials, but show creator info in body
      console.log('📧 Sending email...');
      const mailOptions = {
        from: `"${senderName} - Omega System" <${EMAIL_USER}>`,
        to: recipientEmail,
        subject: subject,
        text: text,
        html: html,
        attachments: [
          {
            filename: emailAttachmentName,
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
      console.log('  - Attachment:', emailAttachmentName);
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

module.exports = new RFQService();