// src/services/receipt.service.js - UPDATED WITH LANGUAGE-AWARE TERMS & CONDITIONS
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/id-generator.util');
const pdfGenerator = require('../utils/pdf-generatorRecipts.util');

const RECEIPTS_FILE = path.join(__dirname, '../../data/receipts/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

class ReceiptService {

  detectLanguage(receiptData) {
    const fieldsToCheck = [
      receiptData.to,
      receiptData.address,
      receiptData.workLocation,
      receiptData.attention
    ];
    let arabicCount = 0;
    let totalFields = 0;
    fieldsToCheck.forEach(field => {
      if (field) {
        totalFields++;
        if (this.isArabic(field)) arabicCount++;
      }
    });
    return arabicCount > (totalFields / 2) ? 'ar' : 'en';
  }

  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  createReceiptFilename(receipt) {
    const receiptNumber = receipt.receiptNumber || 'DN0000';
    let toField = receipt.to || 'Unknown';
    toField = toField
      .replace(/[<>:"/\\|?*\s]/g, '')
      .trim()
      .substring(0, 50);
    const dateField = receipt.date || new Date().toISOString().split('T')[0];
    const filename = `${receiptNumber}_${toField}_${dateField}.pdf`;
    console.log('📄 Created filename:', filename);
    return filename;
  }

  async loadUsers() {
    try {
      console.log('Loading users from:', USERS_FILE);
      const data = await fs.readFile(USERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading users file:', error);
      if (error.code === 'ENOENT') {
        console.error('Users file does not exist at:', USERS_FILE);
        return [];
      }
      throw error;
    }
  }

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

  async loadReceipts() {
    try {
      const data = await fs.readFile(RECEIPTS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveReceipts(receipts) {
    await atomicWrite(RECEIPTS_FILE, JSON.stringify(receipts, null, 2));
  }

  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.RECEIPT || 0;
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
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
        if (error.code !== 'ENOENT') throw error;
      }
      counters.RECEIPT = counter;
      await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
    } catch (error) {
      throw error;
    }
  }

  generateReceiptNumber(counter) {
    const paddedNumber = String(counter).padStart(4, '0');
    return `DN${paddedNumber}`;
  }

  async resetReceiptCounter(newCounter = 0) {
    if (typeof newCounter !== 'number' || newCounter < 0) {
      throw new Error('Invalid counter value. Must be a positive number or 0.');
    }
    const oldCounter = await this.loadCounter();
    const receipts = await this.loadReceipts();
    const deletedCount = receipts.length;
    await this.saveCounter(newCounter);
    await this.saveReceipts([]);
    return {
      oldCounter,
      newCounter,
      deletedReceipts: deletedCount,
      nextReceiptNumber: this.generateReceiptNumber(newCounter + 1),
      message: `Counter reset to ${newCounter} and ${deletedCount} receipt(s) deleted`
    };
  }

  async createReceipt(receiptData, userId, userRole) {
    console.log('\n=== CREATE RECEIPT DEBUG ===');
    console.log('userId:', userId);
    console.log('userId type:', typeof userId);
    console.log('userRole:', userRole);

    const receipts = await this.loadReceipts();
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    const paddedCounter = String(newCounter).padStart(4, '0');
    const id = `RECEIPT-${paddedCounter}`;
    const receiptNumber = this.generateReceiptNumber(newCounter);
    await this.saveCounter(newCounter);

    const today = new Date().toISOString().split('T')[0];
    console.log('Calling getUserNameById with:', userId);
    const createdByName = await this.getUserNameById(userId);
    console.log('getUserNameById returned:', createdByName);
    console.log('createdByName is null?', createdByName === null);
    console.log('createdByName is undefined?', createdByName === undefined);
    console.log('============================\n');

    const newReceipt = {
      id,
      receiptNumber,
      to: receiptData.to,
      date: receiptData.date || today,
      address: receiptData.address || '',
      addressTitle: receiptData.addressTitle || '',
      attention: receiptData.attention || '',
      projectCode: receiptData.projectCode || '',
      workLocation: receiptData.workLocation || '',
      companyNumber: receiptData.companyNumber || '',
      additionalText: receiptData.additionalText || '',
      items: receiptData.items || [],
      notes: receiptData.notes || '',
      includeTermsAndConditions: receiptData.includeTermsAndConditions || false,
      termsAndConditionsText: receiptData.termsAndConditionsText || '',
      createdBy: userId,
      createdByName: createdByName || 'Unknown User',
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    receipts.push(newReceipt);
    await this.saveReceipts(receipts);
    console.log('Receipt created with name:', newReceipt.createdByName);
    return newReceipt;
  }

  async enrichReceiptsWithCreatorNames(receipts) {
    const users = await this.loadUsers();
    return Promise.all(receipts.map(async receipt => {
      const user = users.find(u => u.id === receipt.createdBy);
      if (user && user.name) {
        return { ...receipt, createdByName: user.name };
      } else {
        return { ...receipt, createdByName: 'Unknown User' };
      }
    }));
  }

  async getAllReceipts(filters = {}, userId, userRole) {
    let receipts = await this.loadReceipts();
    receipts = await this.enrichReceiptsWithCreatorNames(receipts);

    if (userRole === 'employee' || userRole === 'admin') {
      receipts = receipts.filter(r => r.createdBy === userId);
    }
    if (filters.receiptNumber) {
      receipts = receipts.filter(r =>
        r.receiptNumber.toLowerCase().includes(filters.receiptNumber.toLowerCase())
      );
    }
    if (filters.startDate) {
      receipts = receipts.filter(r => r.date >= filters.startDate);
    }
    if (filters.endDate) {
      receipts = receipts.filter(r => r.date <= filters.endDate);
    }
    if (filters.to) {
      receipts = receipts.filter(r =>
        r.to.toLowerCase().includes(filters.to.toLowerCase())
      );
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      receipts = receipts.filter(r =>
        r.receiptNumber.toLowerCase().includes(searchLower) ||
        r.to.toLowerCase().includes(searchLower) ||
        r.projectCode.toLowerCase().includes(searchLower) ||
        r.workLocation.toLowerCase().includes(searchLower) ||
        (r.createdByName && r.createdByName.toLowerCase().includes(searchLower))
      );
    }

    receipts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedReceipts = receipts.slice(startIndex, endIndex);

    return {
      receipts: paginatedReceipts,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(receipts.length / limit),
        totalReceipts: receipts.length,
        limit
      }
    };
  }

  async getReceiptById(id, userId, userRole) {
    const receipts = await this.loadReceipts();
    const receipt = receipts.find(r => r.id === id);
    if (!receipt) throw new Error('Receipt not found');

    if (userRole === 'employee' || userRole === 'admin') {
      if (receipt.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own receipts');
      }
    }

    const createdByName = await this.getUserNameById(receipt.createdBy);
    return { ...receipt, createdByName: createdByName || receipt.createdByName || 'Unknown User' };
  }

  async getReceiptByNumber(receiptNumber, userId, userRole) {
    const receipts = await this.loadReceipts();
    const receipt = receipts.find(r => r.receiptNumber === receiptNumber);
    if (!receipt) throw new Error('Receipt not found');

    if (userRole === 'employee' || userRole === 'admin') {
      if (receipt.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own receipts');
      }
    }

    const createdByName = await this.getUserNameById(receipt.createdBy);
    return { ...receipt, createdByName: createdByName || receipt.createdByName || 'Unknown User' };
  }

  async updateReceipt(id, updateData, userId, userRole) {
    const receipts = await this.loadReceipts();
    const receiptIndex = receipts.findIndex(r => r.id === id);
    if (receiptIndex === -1) throw new Error('Receipt not found');

    const receipt = receipts[receiptIndex];
    if (userRole === 'employee' || userRole === 'admin') {
      if (receipt.createdBy !== userId) {
        throw new Error('Access denied: You can only edit your own receipts');
      }
    }

    if (updateData.to) receipt.to = updateData.to;
    if (updateData.date) receipt.date = updateData.date;
    if (updateData.address !== undefined) receipt.address = updateData.address;
    if (updateData.addressTitle !== undefined) receipt.addressTitle = updateData.addressTitle;
    if (updateData.attention !== undefined) receipt.attention = updateData.attention;
    if (updateData.projectCode !== undefined) receipt.projectCode = updateData.projectCode;
    if (updateData.workLocation !== undefined) receipt.workLocation = updateData.workLocation;
    if (updateData.companyNumber !== undefined) receipt.companyNumber = updateData.companyNumber;
    if (updateData.additionalText !== undefined) receipt.additionalText = updateData.additionalText;
    if (updateData.items !== undefined) receipt.items = updateData.items;
    if (updateData.notes !== undefined) receipt.notes = updateData.notes;
    if (updateData.includeTermsAndConditions !== undefined) {
      receipt.includeTermsAndConditions = updateData.includeTermsAndConditions;
    }
    if (updateData.termsAndConditionsText !== undefined) {
      receipt.termsAndConditionsText = updateData.termsAndConditionsText;
    }

    receipt.updatedAt = new Date().toISOString();
    receipts[receiptIndex] = receipt;
    await this.saveReceipts(receipts);

    const createdByName = await this.getUserNameById(receipt.createdBy);
    return { ...receipt, createdByName: createdByName || receipt.createdByName || 'Unknown User' };
  }

  async deleteReceipt(id) {
    const receipts = await this.loadReceipts();
    const receiptIndex = receipts.findIndex(r => r.id === id);
    if (receiptIndex === -1) throw new Error('Receipt not found');

    const receipt = receipts[receiptIndex];

    if (receipt.pdfFilename) {
      const fileManagementService = require('./File-management.service');
      try {
        await fileManagementService.deleteFileByFilename(receipt.pdfFilename);
        console.log('✅ Receipt: File removed from File Management');
      } catch (error) {
        console.log('⚠️ Receipt: File Management deletion warning:', error.message);
      }
    }

    if (receipt.pdfFilename) {
      const pdfPath = path.join(__dirname, '../../data/receipts/pdfs', receipt.pdfFilename);
      if (fsSync.existsSync(pdfPath)) {
        await fs.unlink(pdfPath).catch(() => {});
      }
    }

    receipts.splice(receiptIndex, 1);
    await this.saveReceipts(receipts);
    return { message: 'Receipt deleted successfully' };
  }

  async getReceiptStats(userId, userRole) {
    let receipts = await this.loadReceipts();
    if (userRole === 'employee' || userRole === 'admin') {
      receipts = receipts.filter(r => r.createdBy === userId);
    }

    const stats = { totalReceipts: receipts.length, thisMonth: 0, thisWeek: 0, today: 0 };
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    receipts.forEach(receipt => {
      const receiptDate = new Date(receipt.createdAt);
      if (receiptDate >= startOfMonth) stats.thisMonth++;
      if (receiptDate >= startOfWeek) stats.thisWeek++;
      if (receiptDate >= startOfDay) stats.today++;
    });

    return stats;
  }

  /**
   * ✅ Generate receipt PDF.
   *
   *  Final page order is ALWAYS:
   *    1. Main receipt page(s)
   *    2. Attachment PDF page(s)   ← if provided
   *    3. Terms & Conditions page  ← ALWAYS LAST
   *
   *  Key fix: termsText is NOT passed into pdfGenerator.generateReceiptPDF().
   *  addTermsAndConditionsPage() is called as the very last step, after all
   *  attachments have already been merged in.
   */
  async generateReceiptPDF(id, userId, userRole, attachmentPdf = null) {
    const receipt = await this.getReceiptById(id, userId, userRole);

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       GENERATING RECEIPT PDF                             ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('📄 Receipt Number:', receipt.receiptNumber);
    console.log('📎 Include Terms & Conditions:', receipt.includeTermsAndConditions);

    // Detect receipt language
    const receiptLanguage = this.detectLanguage(receipt);
    console.log('🌐 Detected Language:', receiptLanguage === 'ar' ? 'Arabic' : 'English');

    // Resolve Terms & Conditions text — will be appended as the very last page
    let termsText = null;
    if (receipt.includeTermsAndConditions) {
      if (receipt.termsAndConditionsText && receipt.termsAndConditionsText.trim()) {
        termsText = receipt.termsAndConditionsText;
        console.log('📎 Using custom Terms & Conditions');
      } else {
        termsText = pdfGenerator.getDefaultTermsAndConditions(receiptLanguage);
        console.log('📎 Using default Terms & Conditions in', receiptLanguage === 'ar' ? 'Arabic' : 'English');
      }
    }

    console.log('📎 Terms Text Length:', termsText?.length || 0);
    console.log('📎 User Attachment:', attachmentPdf ? 'Yes' : 'No');
    console.log('════════════════════════════════════════════════════════════');

    const customFilename = this.createReceiptFilename(receipt);

    // ── Generate main receipt PDF ────────────────────────────────────────────
    // Pass null for termsText — T&C is appended AFTER the attachment below,
    // so it is guaranteed to always be the final page.
    const pdfResult = await pdfGenerator.generateReceiptPDF(
      receipt,
      customFilename,
      null  // ← intentionally null
    );

    // Validate and queue the attachment (if any)
    const pdfsToMerge = [];
    if (attachmentPdf) {
      const isValid = await pdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        pdfsToMerge.push(attachmentPdf);
        console.log('✅ Added user attachment PDF to merge list');
      } else {
        console.warn('⚠️ Invalid user attachment PDF, skipping');
      }
    }

    let finalPdfResult = pdfResult;

    try {
      if (pdfsToMerge.length > 0) {
        // ── Step 1: Merge attachment(s) after the main receipt ───────────────
        console.log(`🔄 Merging ${pdfsToMerge.length} attachment(s) with receipt...`);

        let currentPath = pdfResult.filepath;

        for (let i = 0; i < pdfsToMerge.length; i++) {
          const mergeResult = await pdfGenerator.mergePDFs(
            currentPath,
            pdfsToMerge[i],
            customFilename,
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

        console.log('✅ Attachment merge completed successfully');
      } else {
        // ── Step 1 (no attachment): stamp headers/footers only ───────────────
        const headerResult = await pdfGenerator.mergePDFs(
          pdfResult.filepath,
          null,
          customFilename,
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

      // ── Step 2: Append Terms & Conditions as the VERY LAST page ─────────
      // This always runs after all attachments are merged, so T&C is
      // guaranteed to be the final page regardless of whether there is
      // an attachment or not.
      if (termsText) {
        console.log('📄 Appending Terms & Conditions as the last page...');
        await pdfGenerator.addTermsAndConditionsPage(
          finalPdfResult.filepath,
          termsText,
          receiptLanguage
        );
        console.log('✅ Terms & Conditions appended as last page');
      }

    } catch (mergeError) {
      console.error('❌ PDF merge/header failed:', mergeError.message);
      finalPdfResult.mergeError = mergeError.message;
    }

    // Persist PDF metadata back to the receipt record
    const receipts = await this.loadReceipts();
    const receiptIndex = receipts.findIndex(r => r.id === id);

    if (receiptIndex !== -1) {
      receipts[receiptIndex].pdfFilename = finalPdfResult.filename;
      receipts[receiptIndex].pdfLanguage = finalPdfResult.language;
      receipts[receiptIndex].pdfGeneratedAt = new Date().toISOString();
      receipts[receiptIndex].pdfMerged = finalPdfResult.merged || false;
      if (finalPdfResult.pageCount) {
        receipts[receiptIndex].pdfPageCount = finalPdfResult.pageCount;
      }
      await this.saveReceipts(receipts);
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ PDF generation complete!');
    console.log('════════════════════════════════════════════════════════════\n');

    return { receipt, pdf: finalPdfResult };
  }

  /**
   * Send receipt PDF by email
   */
  async sendReceiptByEmail(receiptId, userId, userRole, recipientEmail) {
    try {
      console.log('\n📧 === SEND EMAIL DEBUG ===');
      console.log('Receipt ID:', receiptId);
      console.log('User ID:', userId);
      console.log('Recipient:', recipientEmail);

      if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('❌ Email credentials missing!');
        console.error('EMAIL_USER:', EMAIL_USER ? '✅ Set' : '❌ Not set');
        console.error('EMAIL_PASS:', EMAIL_PASS ? '✅ Set' : '❌ Not set');
        throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
      }

      const receipt = await this.getReceiptById(receiptId, userId, userRole);
      console.log('✅ Receipt found:', receipt.receiptNumber);

      if (!receipt.pdfFilename) {
        throw new Error('PDF not generated yet. Please generate PDF first.');
      }

      const pdfPath = path.join(__dirname, '../../data/receipts/pdfs', receipt.pdfFilename);
      if (!fsSync.existsSync(pdfPath)) throw new Error('PDF file not found');
      console.log('✅ PDF file found');

      const users = await this.loadUsers();
      const creator = users.find(u => u.id === receipt.createdBy);
      const senderName = creator && creator.name ? creator.name : 'Omega System';
      const creatorEmail = creator && creator.email ? creator.email : null;
      console.log('✅ Creator info:', { name: senderName, hasEmail: !!creatorEmail });

      console.log('📧 Creating email transporter...');
      console.log('  - Host:', EMAIL_HOST);
      console.log('  - Port:', EMAIL_PORT);
      console.log('  - User:', EMAIL_USER);

      const transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_PORT === 465,
        auth: { user: EMAIL_USER, pass: EMAIL_PASS },
        tls: { rejectUnauthorized: false }
      });

      console.log('🔄 Verifying SMTP connection...');
      await transporter.verify();
      console.log('✅ SMTP connection verified');

      const emailAttachmentName = this.createReceiptFilename(receipt);
      const subject = `Receipt ${receipt.receiptNumber}`;
      const text = `Please find attached the receipt ${receipt.receiptNumber}.\n\nTo: ${receipt.to || 'N/A'}\nDate: ${receipt.date}\nProject Code: ${receipt.projectCode || 'N/A'}\n\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Receipt ${receipt.receiptNumber}</h2>
          </div>
          <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 10px 10px;">
            <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">Please find attached the receipt document.</p>
            <table style="border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Receipt Number:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1565C0; font-weight: 600;">${receipt.receiptNumber}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Date:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${receipt.date}</td>
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

      console.log('📧 Sending email...');
      const mailOptions = {
        from: `"${senderName} - Omega System" <${EMAIL_USER}>`,
        to: recipientEmail,
        subject,
        text,
        html,
        attachments: [{ filename: emailAttachmentName, path: pdfPath }]
      };

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
      console.log('  - Attachment Name:', emailAttachmentName);
      if (creatorEmail) console.log('  - Reply-To:', creatorEmail);
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
      console.error('Error details:', { message: error.message, code: error.code, command: error.command });

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

module.exports = new ReceiptService();