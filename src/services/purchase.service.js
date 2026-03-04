// src/services/purchase.service.js - WITH TERMS & CONDITIONS ALWAYS LAST PAGE

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const atomicWrite = require('../utils/atomic-write.util');
const poPdfGenerator = require('../utils/pdf-generator-po.util');

const POS_FILE     = path.join(__dirname, '../../data/purchases/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE   = path.join(__dirname, '../../data/users/users.json');

// ── Shared filename helpers ────────────────────────────────────────────────
const sanitizeFilename = (str) => {
  if (!str) return 'Unknown';
  return str
    .replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 30);
};

const formatDate = (dateStr) => {
  if (!dateStr) {
    const today = new Date().toISOString().split('T')[0];
    const [year, month, day] = today.split('-');
    return `${day}-${month}-${year}`;
  }
  const [year, month, day] = dateStr.split('-');
  return `${day}-${month}-${year}`;
};

/**
 * Build the standard PO download / attachment filename.
 * Pattern: PO00001_SupplierName_DD-MM-YYYY.pdf
 * ✅ Uses supplier (المورد) — NOT receiver (المستلم)
 */
const buildPOFilename = (po) => {
  const poNumber     = po.poNumber  || 'PO00000';
  const supplierName = sanitizeFilename(po.supplier);   // ✅ supplier, not receiver
  const dateFmt      = formatDate(po.date);
  return `${poNumber}_${supplierName}_${dateFmt}`;      // no .pdf — callers add it
};

class PurchaseService {
  async loadUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async getUserNameById(userId) {
    try {
      const users = await this.loadUsers();

      if (!userId) return null;

      const searchId = String(userId).trim().toLowerCase();

      let found = users.find(u => u.id === userId);
      if (found) return found.name;

      found = users.find(u => String(u.id).trim().toLowerCase() === searchId);
      if (found) return found.name;

      found = users.find(u => String(u.username || '').trim().toLowerCase() === searchId);
      if (found) return found.name;

      return null;
    } catch (error) {
      console.error('❌ Error getting user name:', error);
      return null;
    }
  }

  async loadPOs() {
    try {
      const data = await fs.readFile(POS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async savePOs(pos) {
    await atomicWrite(POS_FILE, JSON.stringify(pos, null, 2));
  }

  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.PO || 0;
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }
  }

  async saveCounter(counter) {
    let counters = {};
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      counters = JSON.parse(data);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    counters.PO = counter;
    await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
  }

  generatePONumber(counter) {
    return `PO${String(counter).padStart(5, '0')}`;
  }

  async resetPOCounter() {
    const oldCounter  = await this.loadCounter();
    const pos         = await this.loadPOs();
    const deletedCount = pos.length;

    await this.saveCounter(0);
    await this.savePOs([]);

    return {
      oldCounter,
      newCounter:   0,
      deletedPOs:   deletedCount,
      nextPONumber: this.generatePONumber(1),
      message:      `Counter reset to 0 and ${deletedCount} PO(s) deleted`
    };
  }

  detectLanguage(text) {
    if (!text) return 'en';
    return /[\u0600-\u06FF]/.test(text) ? 'ar' : 'en';
  }

  detectPOLanguage(poData) {
    const fieldsToCheck = [
      poData.supplier, poData.supplierAddress,
      poData.receiver, poData.receiverCity, poData.receiverAddress,
      poData.tableHeaderText, poData.notes
    ];

    if (poData.items && poData.items.length > 0) {
      poData.items.forEach(item => { if (item.description) fieldsToCheck.push(item.description); });
    }

    let arabicCount = 0, totalFields = 0;
    fieldsToCheck.forEach(field => {
      if (field) {
        totalFields++;
        if (this.detectLanguage(field) === 'ar') arabicCount++;
      }
    });

    return arabicCount > (totalFields / 2) ? 'ar' : 'en';
  }

  async enrichPOsWithCreatorNames(pos) {
    const users = await this.loadUsers();
    return Promise.all(pos.map(async po => {
      const user = users.find(u => u.id === po.createdBy);
      return { ...po, createdByName: user?.name || 'Unknown User' };
    }));
  }

  async createPO(poData, userId, userRole) {
    console.log('\n=== CREATE PO ===');
    console.log('User ID:', userId);
    console.log('User Role:', userRole);
    console.log('Include Terms & Conditions:', poData.includeTermsAndConditions);

    const pos        = await this.loadPOs();
    const counter    = await this.loadCounter();
    const newCounter = counter + 1;

    const paddedCounter = String(newCounter).padStart(5, '0');
    const id       = `PO-${paddedCounter}`;
    const poNumber = this.generatePONumber(newCounter);

    await this.saveCounter(newCounter);

    const today           = new Date().toISOString().split('T')[0];
    const detectedLanguage = poData.forceLanguage || this.detectPOLanguage(poData);

    let createdByName = await this.getUserNameById(userId);
    if (!createdByName) {
      const users = await this.loadUsers();
      const user  = users.find(u =>
        u.id === userId || String(u.id).trim() === String(userId).trim()
      );
      createdByName = user ? user.name : 'Unknown User';
    }

    const newPO = {
      id,
      poNumber,
      date:             poData.date || today,
      supplier:         poData.supplier         || '',
      supplierAddress:  poData.supplierAddress   || '',
      supplierPhone:    poData.supplierPhone     || '',
      receiver:         poData.receiver         || '',
      receiverCity:     poData.receiverCity      || '',
      receiverAddress:  poData.receiverAddress   || '',
      receiverPhone:    poData.receiverPhone     || '',
      tableHeaderText:  poData.tableHeaderText   || '',
      taxRate:          poData.taxRate           || 0,
      items:            poData.items             || [],
      notes:            poData.notes             || '',
      includeTermsAndConditions: poData.includeTermsAndConditions || false,
      termsAndConditionsText:    poData.termsAndConditionsText    || '',
      language:      detectedLanguage,
      status:        'pending',
      createdBy:     userId,
      createdByName: createdByName,
      createdByRole: userRole,
      createdAt:     new Date().toISOString(),
      updatedAt:     new Date().toISOString()
    };

    pos.push(newPO);
    await this.savePOs(pos);

    console.log('✓ PO created:', newPO.poNumber, '| Creator:', newPO.createdByName);
    console.log('=================\n');

    return newPO;
  }

  async updatePO(id, updateData, userId, userRole) {
    const pos     = await this.loadPOs();
    const poIndex = pos.findIndex(p => p.id === id);

    if (poIndex === -1) throw new Error('Purchase Order not found');

    const po = pos[poIndex];

    if (userRole === 'employee' || userRole === 'admin') {
      if (po.createdBy !== userId) {
        throw new Error('Access denied: You can only edit your own Purchase Orders');
      }
    }

    if (updateData.date)                        po.date            = updateData.date;
    if (updateData.supplier         !== undefined) po.supplier         = updateData.supplier;
    if (updateData.supplierAddress  !== undefined) po.supplierAddress  = updateData.supplierAddress;
    if (updateData.supplierPhone    !== undefined) po.supplierPhone    = updateData.supplierPhone;
    if (updateData.receiver         !== undefined) po.receiver         = updateData.receiver;
    if (updateData.receiverCity     !== undefined) po.receiverCity     = updateData.receiverCity;
    if (updateData.receiverAddress  !== undefined) po.receiverAddress  = updateData.receiverAddress;
    if (updateData.receiverPhone    !== undefined) po.receiverPhone    = updateData.receiverPhone;
    if (updateData.tableHeaderText  !== undefined) po.tableHeaderText  = updateData.tableHeaderText;
    if (updateData.taxRate          !== undefined) po.taxRate          = updateData.taxRate;
    if (updateData.items)                          po.items            = updateData.items;
    if (updateData.notes            !== undefined) po.notes            = updateData.notes;
    if (updateData.status)                         po.status           = updateData.status;
    if (updateData.includeTermsAndConditions !== undefined)
      po.includeTermsAndConditions = updateData.includeTermsAndConditions;
    if (updateData.termsAndConditionsText !== undefined)
      po.termsAndConditionsText = updateData.termsAndConditionsText;

    po.language  = updateData.forceLanguage || this.detectPOLanguage(po);
    po.updatedAt = new Date().toISOString();

    pos[poIndex] = po;
    await this.savePOs(pos);

    const createdByName = await this.getUserNameById(po.createdBy);
    return { ...po, createdByName: createdByName || po.createdByName || 'Unknown User' };
  }

  async getAllPOs(filters = {}, userId, userRole) {
    let pos = await this.loadPOs();
    pos = await this.enrichPOsWithCreatorNames(pos);

    if (userRole === 'employee' || userRole === 'admin') {
      pos = pos.filter(p => p.createdBy === userId);
    }

    if (filters.poNumber) {
      pos = pos.filter(p => p.poNumber.toLowerCase().includes(filters.poNumber.toLowerCase()));
    }
    if (filters.startDate) pos = pos.filter(p => p.date >= filters.startDate);
    if (filters.endDate)   pos = pos.filter(p => p.date <= filters.endDate);
    if (filters.supplier) {
      pos = pos.filter(p => p.supplier.toLowerCase().includes(filters.supplier.toLowerCase()));
    }
    if (filters.status) {
      pos = pos.filter(p => p.status === filters.status);
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      pos = pos.filter(p =>
        p.poNumber.toLowerCase().includes(s)      ||
        p.supplier.toLowerCase().includes(s)      ||
        p.receiver.toLowerCase().includes(s)      ||
        (p.notes           && p.notes.toLowerCase().includes(s))          ||
        (p.createdByName   && p.createdByName.toLowerCase().includes(s))
      );
    }

    pos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page       = filters.page  || 1;
    const limit      = filters.limit || 10;
    const startIndex = (page - 1) * limit;

    return {
      pos: pos.slice(startIndex, startIndex + limit),
      pagination: {
        currentPage: page,
        totalPages:  Math.ceil(pos.length / limit),
        totalPOs:    pos.length,
        limit
      }
    };
  }

  async getPOById(id, userId, userRole) {
    const pos = await this.loadPOs();
    const po  = pos.find(p => p.id === id);

    if (!po) throw new Error('Purchase Order not found');

    if (userRole === 'employee' || userRole === 'admin') {
      if (po.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own Purchase Orders');
      }
    }

    const createdByName = await this.getUserNameById(po.createdBy);
    return { ...po, createdByName: createdByName || po.createdByName || 'Unknown User' };
  }

  async deletePO(id) {
    const pos     = await this.loadPOs();
    const poIndex = pos.findIndex(p => p.id === id);

    if (poIndex === -1) throw new Error('Purchase Order not found');

    const po = pos[poIndex];

    if (po.pdfFilename) {
      const fileManagementService = require('./File-management.service');
      try {
        await fileManagementService.deleteFileByFilename(po.pdfFilename);
        console.log('✅ Purchase Order: File removed from File Management');
      } catch (error) {
        console.log('⚠️ Purchase Order: File Management deletion warning:', error.message);
      }
    }

    if (po.pdfFilename) {
      const pdfPath = path.join(__dirname, '../../data/purchases/pdfs', po.pdfFilename);
      if (fsSync.existsSync(pdfPath)) {
        await fs.unlink(pdfPath).catch(() => {});
      }
    }

    pos.splice(poIndex, 1);
    await this.savePOs(pos);

    return { message: 'Purchase Order deleted successfully' };
  }

  async getPOStats(userId, userRole) {
    let pos = await this.loadPOs();

    if (userRole === 'employee' || userRole === 'admin') {
      pos = pos.filter(p => p.createdBy === userId);
    }

    const stats = {
      totalPOs: pos.length,
      pending:  pos.filter(p => p.status === 'pending').length,
      approved: pos.filter(p => p.status === 'approved').length,
      rejected: pos.filter(p => p.status === 'rejected').length,
      thisMonth: 0, thisWeek: 0, today: 0
    };

    const now          = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek  = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay   = new Date(now.setHours(0, 0, 0, 0));

    pos.forEach(po => {
      const d = new Date(po.createdAt);
      if (d >= startOfMonth) stats.thisMonth++;
      if (d >= startOfWeek)  stats.thisWeek++;
      if (d >= startOfDay)   stats.today++;
    });

    return stats;
  }

  async generatePOPDF(id, userId, userRole, attachmentPdf = null) {
    const po = await this.getPOById(id, userId, userRole);

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║          GENERATING PURCHASE ORDER PDF                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('📄 PO Number:', po.poNumber);
    console.log('📄 Supplier (المورد):', po.supplier);
    console.log('📄 Include T&C:', po.includeTermsAndConditions);
    console.log('📄 User Attachment:', attachmentPdf ? 'Yes' : 'No');
    console.log('════════════════════════════════════════════════════════════');

    // ✅ Filename based on supplier (المورد), not receiver (المستلم)
    const customFilename = buildPOFilename(po);
    console.log('📝 Custom filename:', customFilename);

    console.log('\n📄 Step 1: Generating main PO PDF...');
    const pdfResult = await poPdfGenerator.generatePOPDF(po, customFilename);
    console.log('✅ Main PO PDF generated');

    let finalPdfResult = pdfResult;

    if (attachmentPdf) {
      console.log('\n📄 Step 2: Processing user attachment...');
      const isValid = await poPdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        console.log('🔄 Merging user attachment PDF with main PO...');
        const mergeResult = await poPdfGenerator.mergePDFs(
          pdfResult.filepath,
          attachmentPdf,
          null,
          pdfResult.language
        );
        finalPdfResult = {
          ...pdfResult,
          filename:  mergeResult.filename,
          filepath:  mergeResult.filepath,
          merged:    true,
          pageCount: mergeResult.pageCount
        };
        console.log('✅ User attachment merged. Total pages:', mergeResult.pageCount.total);
      } else {
        console.warn('⚠️  Invalid attachment PDF, skipping');
      }
    } else {
      console.log('\n📄 Step 2: No attachment — adding headers/footers only...');
      const headerResult = await poPdfGenerator.mergePDFs(
        pdfResult.filepath,
        null,
        null,
        pdfResult.language
      );
      finalPdfResult = {
        ...pdfResult,
        filename:  headerResult.filename,
        filepath:  headerResult.filepath,
        merged:    false,
        pageCount: headerResult.pageCount
      };
      console.log('✅ Headers/footers added');
    }

    if (po.includeTermsAndConditions) {
      console.log('\n📄 Step 3: Adding Terms & Conditions page (LAST PAGE)...');
      const termsText = (po.termsAndConditionsText && po.termsAndConditionsText.trim())
        ? po.termsAndConditionsText
        : (pdfResult.language === 'ar'
            ? poPdfGenerator.DEFAULT_TERMS_AR
            : poPdfGenerator.DEFAULT_TERMS_EN);

      await poPdfGenerator.addTermsAndConditionsPage(
        finalPdfResult.filepath,
        termsText,
        pdfResult.language
      );
      console.log('✅ T&C page added as last page');

      if (finalPdfResult.pageCount) finalPdfResult.pageCount.total += 1;
    } else {
      console.log('\n📄 Step 3: T&C disabled, skipping');
    }

    console.log('\n📄 Step 4: Updating PO record...');
    const pos     = await this.loadPOs();
    const poIndex = pos.findIndex(p => p.id === id);

    if (poIndex !== -1) {
      pos[poIndex].pdfFilename    = finalPdfResult.filename;
      pos[poIndex].pdfLanguage    = finalPdfResult.language;
      pos[poIndex].pdfGeneratedAt = new Date().toISOString();
      pos[poIndex].pdfMerged      = finalPdfResult.merged || false;
      if (finalPdfResult.pageCount) pos[poIndex].pdfPageCount = finalPdfResult.pageCount;
      await this.savePOs(pos);
      console.log('✅ PO record updated');
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ PDF GENERATION COMPLETE!');
    console.log('════════════════════════════════════════════════════════════\n');

    return { po, pdf: finalPdfResult };
  }

  async sendPOByEmail(poId, userId, userRole, recipientEmail) {
    try {
      console.log('\n📧 === SEND PO EMAIL ===');
      console.log('PO ID:', poId, '| Recipient:', recipientEmail);

      const EMAIL_USER = process.env.EMAIL_USER;
      const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
      const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
      const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
      const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

      if (!EMAIL_USER || !EMAIL_PASS) {
        throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
      }

      const po = await this.getPOById(poId, userId, userRole);
      console.log('✅ PO found:', po.poNumber);

      if (!po.pdfFilename) throw new Error('PDF not generated yet. Please generate PDF first.');

      const pdfPath = path.join(__dirname, '../../data/purchases/pdfs', po.pdfFilename);
      if (!fsSync.existsSync(pdfPath)) throw new Error('PDF file not found');
      console.log('✅ PDF file found');

      const users   = await this.loadUsers();
      const creator = users.find(u => u.id === po.createdBy);

      const senderName   = creator?.name  || 'Omega System';
      const creatorEmail = creator?.email || null;

      const transporter = nodemailer.createTransport({
        host:   EMAIL_HOST,
        port:   EMAIL_PORT,
        secure: EMAIL_PORT === 465,
        auth:   { user: EMAIL_USER, pass: EMAIL_PASS },
        tls:    { rejectUnauthorized: false }
      });

      await transporter.verify();
      console.log('✅ SMTP connection verified');

      // ✅ Email attachment filename also uses supplier (المورد)
      const emailAttachmentName = `${buildPOFilename(po)}.pdf`;
      console.log('📎 Attachment filename:', emailAttachmentName);

      const subject = `Purchase Order ${po.poNumber}`;
      const text    = `Please find attached Purchase Order ${po.poNumber}.\n\nSupplier: ${po.supplier || 'N/A'}\nReceiver: ${po.receiver || 'N/A'}\nDate: ${po.date}\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;

      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Purchase Order ${po.poNumber}</h2>
          </div>
          <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 10px 10px;">
            <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">Please find attached the Purchase Order document.</p>
            <table style="border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">PO Number:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1565C0; font-weight: 600;">${po.poNumber}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Supplier:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${po.supplier || 'N/A'}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Date:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${po.date}</td>
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

      const mailOptions = {
        from:        `"${senderName} - Omega System" <${EMAIL_USER}>`,
        to:          recipientEmail,
        subject,
        text,
        html,
        attachments: [{ filename: emailAttachmentName, path: pdfPath }]
      };

      if (creatorEmail) mailOptions.replyTo = creatorEmail;

      const info = await transporter.sendMail(mailOptions);

      console.log('✅ Email sent! Message ID:', info.messageId);
      console.log('========================\n');

      return {
        message:   'Email sent successfully',
        messageId: info.messageId,
        sentFrom:  EMAIL_USER,
        sentBy:    senderName,
        replyTo:   creatorEmail || null
      };
    } catch (error) {
      console.error('❌ Email sending error:', error);

      let errorMessage = error.message;
      if (error.code === 'EAUTH')   errorMessage = 'Email authentication failed. Please check your EMAIL_USER and EMAIL_APP_PASSWORD in .env file.';
      if (error.code === 'ESOCKET') errorMessage = 'Cannot connect to email server. Please check your EMAIL_HOST and EMAIL_PORT settings.';

      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }
}

module.exports = new PurchaseService();