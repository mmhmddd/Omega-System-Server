// src/services/purchase.service.js - WITH RECEIVER NAME IN FILENAME

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const atomicWrite = require('../utils/atomic-write.util');
const poPdfGenerator = require('../utils/pdf-generator-po.util');

const POS_FILE = path.join(__dirname, '../../data/purchases/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// ✅ Path to your static Terms and Conditions PDF file
const STATIC_PDF_PATH = path.join(__dirname, '../../data/Terms And Conditions/terms-and-conditions.pdf');

class PurchaseService {
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
      
      if (!userId) {
        console.log('⚠️ No userId provided');
        return null;
      }
      
      console.log('\n=== USER LOOKUP ===');
      console.log('Looking for userId:', userId);
      console.log('Type:', typeof userId);
      
      const searchId = String(userId).trim().toLowerCase();
      
      let foundUser = null;
      
      foundUser = users.find(u => u.id === userId);
      if (foundUser) {
        console.log('✓ Found (direct match):', foundUser.name);
        return foundUser.name;
      }
      
      foundUser = users.find(u => {
        const dbId = String(u.id).trim().toLowerCase();
        return dbId === searchId;
      });
      
      if (foundUser) {
        console.log('✓ Found (string match):', foundUser.name);
        return foundUser.name;
      }
      
      foundUser = users.find(u => {
        const username = String(u.username || '').trim().toLowerCase();
        return username === searchId;
      });
      
      if (foundUser) {
        console.log('✓ Found (username match):', foundUser.name);
        return foundUser.name;
      }
      
      console.log('✗ User not found');
      console.log('Searched for:', searchId);
      console.log('Available users:');
      users.forEach(u => {
        console.log(`  - ID: "${u.id}" | Username: "${u.username}" | Name: "${u.name}"`);
      });
      console.log('==================\n');
      
      return null;
      
    } catch (error) {
      console.error('❌ Error getting user name:', error);
      return null;
    }
  }

  /**
   * Load POs from JSON file
   */
  async loadPOs() {
    try {
      const data = await fs.readFile(POS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Save POs to JSON file
   */
  async savePOs(pos) {
    await atomicWrite(POS_FILE, JSON.stringify(pos, null, 2));
  }

  /**
   * Load counter from counters.json file
   */
  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.PO || 0;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }

  /**
   * Save counter to counters.json file
   */
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
      
      counters.PO = counter;
      await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate PO number from counter
   */
  generatePONumber(counter) {
    const paddedNumber = String(counter).padStart(5, '0');
    return `PO${paddedNumber}`;
  }

  /**
   * Reset PO counter to 0 AND delete all POs (super admin only)
   */
  async resetPOCounter() {
    const oldCounter = await this.loadCounter();
    const pos = await this.loadPOs();
    const deletedCount = pos.length;
    
    await this.saveCounter(0);
    await this.savePOs([]);

    return {
      oldCounter,
      newCounter: 0,
      deletedPOs: deletedCount,
      nextPONumber: this.generatePONumber(1),
      message: `Counter reset to 0 and ${deletedCount} PO(s) deleted`
    };
  }

  /**
   * Detect language from text (Arabic or English)
   */
  detectLanguage(text) {
    if (!text) return 'en';
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  /**
   * Detect primary language from PO data
   */
  detectPOLanguage(poData) {
    const fieldsToCheck = [
      poData.supplier,
      poData.supplierAddress,
      poData.receiver,
      poData.receiverCity,
      poData.receiverAddress,
      poData.tableHeaderText,
      poData.notes
    ];

    if (poData.items && poData.items.length > 0) {
      poData.items.forEach(item => {
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

  /**
   * Add creator names to POs
   */
  async enrichPOsWithCreatorNames(pos) {
    const users = await this.loadUsers();
    
    return Promise.all(pos.map(async po => {
      const user = users.find(u => u.id === po.createdBy);
      
      if (user && user.name) {
        return {
          ...po,
          createdByName: user.name
        };
      } else {
        return {
          ...po,
          createdByName: 'Unknown User'
        };
      }
    }));
  }

  /**
   * ✅ Create a new Purchase Order - WITH includeStaticFile (Terms & Conditions) SUPPORT
   */
  async createPO(poData, userId, userRole) {
    console.log('\n=== CREATE PO ===');
    console.log('User ID:', userId);
    console.log('User Role:', userRole);
    console.log('Include Terms & Conditions PDF:', poData.includeStaticFile);
    
    const pos = await this.loadPOs();
    
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    
    const paddedCounter = String(newCounter).padStart(5, '0');
    const id = `PO-${paddedCounter}`;
    const poNumber = this.generatePONumber(newCounter);
    
    await this.saveCounter(newCounter);

    const today = new Date().toISOString().split('T')[0];
    const detectedLanguage = poData.forceLanguage || this.detectPOLanguage(poData);

    let createdByName = await this.getUserNameById(userId);
    
    if (!createdByName) {
      console.log('⚠️ getUserNameById returned null, trying alternative lookup...');
      const users = await this.loadUsers();
      const user = users.find(u => 
        u.id === userId || 
        String(u.id).trim() === String(userId).trim()
      );
      
      if (user) {
        createdByName = user.name;
        console.log('✓ Found via alternative lookup:', createdByName);
      } else {
        createdByName = 'Unknown User';
        console.log('✗ User not found in alternative lookup');
      }
    }

    const newPO = {
      id,
      poNumber,
      date: poData.date || today,
      supplier: poData.supplier || '',
      supplierAddress: poData.supplierAddress || '',
      supplierPhone: poData.supplierPhone || '',
      receiver: poData.receiver || '',
      receiverCity: poData.receiverCity || '',
      receiverAddress: poData.receiverAddress || '',
      receiverPhone: poData.receiverPhone || '',
      tableHeaderText: poData.tableHeaderText || '',
      taxRate: poData.taxRate || 0,
      items: poData.items || [],
      notes: poData.notes || '',
      includeStaticFile: poData.includeStaticFile || false,
      language: detectedLanguage,
      status: 'pending',
      createdBy: userId,
      createdByName: createdByName,
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    pos.push(newPO);
    await this.savePOs(pos);

    console.log('✓ PO created successfully');
    console.log('Creator name:', newPO.createdByName);
    console.log('Include Terms & Conditions:', newPO.includeStaticFile);
    console.log('=================\n');
    
    return newPO;
  }

  /**
   * Get all POs with filtering and pagination
   */
  async getAllPOs(filters = {}, userId, userRole) {
    let pos = await this.loadPOs();

    pos = await this.enrichPOsWithCreatorNames(pos);

    if (userRole === 'employee' || userRole === 'admin') {
      pos = pos.filter(p => p.createdBy === userId);
    }

    if (filters.poNumber) {
      pos = pos.filter(p => 
        p.poNumber.toLowerCase().includes(filters.poNumber.toLowerCase())
      );
    }

    if (filters.startDate) {
      pos = pos.filter(p => p.date >= filters.startDate);
    }
    if (filters.endDate) {
      pos = pos.filter(p => p.date <= filters.endDate);
    }

    if (filters.supplier) {
      pos = pos.filter(p => 
        p.supplier.toLowerCase().includes(filters.supplier.toLowerCase())
      );
    }

    if (filters.status) {
      pos = pos.filter(p => p.status === filters.status);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      pos = pos.filter(p =>
        p.poNumber.toLowerCase().includes(searchLower) ||
        p.supplier.toLowerCase().includes(searchLower) ||
        p.receiver.toLowerCase().includes(searchLower) ||
        (p.notes && p.notes.toLowerCase().includes(searchLower)) ||
        (p.createdByName && p.createdByName.toLowerCase().includes(searchLower))
      );
    }

    pos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedPOs = pos.slice(startIndex, endIndex);

    return {
      pos: paginatedPOs,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(pos.length / limit),
        totalPOs: pos.length,
        limit
      }
    };
  }

  /**
   * Get PO by ID
   */
  async getPOById(id, userId, userRole) {
    const pos = await this.loadPOs();
    const po = pos.find(p => p.id === id);

    if (!po) {
      throw new Error('Purchase Order not found');
    }

    if (userRole === 'employee' || userRole === 'admin') {
      if (po.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own Purchase Orders');
      }
    }

    const createdByName = await this.getUserNameById(po.createdBy);

    return {
      ...po,
      createdByName: createdByName || po.createdByName || 'Unknown User'
    };
  }

  /**
   * ✅ Update PO - WITH includeStaticFile (Terms & Conditions) SUPPORT
   */
  async updatePO(id, updateData, userId, userRole) {
    const pos = await this.loadPOs();
    const poIndex = pos.findIndex(p => p.id === id);

    if (poIndex === -1) {
      throw new Error('Purchase Order not found');
    }

    const po = pos[poIndex];

    if (userRole === 'employee' || userRole === 'admin') {
      if (po.createdBy !== userId) {
        throw new Error('Access denied: You can only edit your own Purchase Orders');
      }
    }

    if (updateData.date) po.date = updateData.date;
    if (updateData.supplier !== undefined) po.supplier = updateData.supplier;
    if (updateData.supplierAddress !== undefined) po.supplierAddress = updateData.supplierAddress;
    if (updateData.supplierPhone !== undefined) po.supplierPhone = updateData.supplierPhone;
    if (updateData.receiver !== undefined) po.receiver = updateData.receiver;
    if (updateData.receiverCity !== undefined) po.receiverCity = updateData.receiverCity;
    if (updateData.receiverAddress !== undefined) po.receiverAddress = updateData.receiverAddress;
    if (updateData.receiverPhone !== undefined) po.receiverPhone = updateData.receiverPhone;
    if (updateData.tableHeaderText !== undefined) po.tableHeaderText = updateData.tableHeaderText;
    if (updateData.taxRate !== undefined) po.taxRate = updateData.taxRate;
    if (updateData.items) po.items = updateData.items;
    if (updateData.notes !== undefined) po.notes = updateData.notes;
    if (updateData.status) po.status = updateData.status;
    if (updateData.includeStaticFile !== undefined) po.includeStaticFile = updateData.includeStaticFile;

    const detectedLanguage = updateData.forceLanguage || this.detectPOLanguage(po);
    po.language = detectedLanguage;

    po.updatedAt = new Date().toISOString();

    pos[poIndex] = po;
    await this.savePOs(pos);

    const createdByName = await this.getUserNameById(po.createdBy);

    return {
      ...po,
      createdByName: createdByName || po.createdByName || 'Unknown User'
    };
  }

  /**
   * ✅ Delete PO - WITH FILE MANAGEMENT INTEGRATION
   */
  async deletePO(id) {
    const pos = await this.loadPOs();
    const poIndex = pos.findIndex(p => p.id === id);

    if (poIndex === -1) {
      throw new Error('Purchase Order not found');
    }

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

  /**
   * Get PO statistics
   */
  async getPOStats(userId, userRole) {
    let pos = await this.loadPOs();

    if (userRole === 'employee' || userRole === 'admin') {
      pos = pos.filter(p => p.createdBy === userId);
    }

    const stats = {
      totalPOs: pos.length,
      pending: pos.filter(p => p.status === 'pending').length,
      approved: pos.filter(p => p.status === 'approved').length,
      rejected: pos.filter(p => p.status === 'rejected').length,
      thisMonth: 0,
      thisWeek: 0,
      today: 0
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    pos.forEach(po => {
      const poDate = new Date(po.createdAt);
      
      if (poDate >= startOfMonth) stats.thisMonth++;
      if (poDate >= startOfWeek) stats.thisWeek++;
      if (poDate >= startOfDay) stats.today++;
    });

    return stats;
  }
  /**
   * ✅ Generate PO PDF with custom filename pattern: PO00001_Receiver_DD-MM-YYYY.pdf
   * 
   * Merge order:
   * 1. Generated PO PDF (always first)
   * 2. User-uploaded attachment PDF (if provided)
   * 3. Terms & Conditions static PDF (if includeStaticFile is true)
   */
  async generatePOPDF(id, userId, userRole, attachmentPdf = null) {
    const po = await this.getPOById(id, userId, userRole);
    
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║          GENERATING PURCHASE ORDER PDF                   ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('📄 PO Number:', po.poNumber);
    console.log('📎 Include Terms & Conditions:', po.includeStaticFile);
    console.log('📎 User Attachment:', attachmentPdf ? 'Yes' : 'No');
    console.log('════════════════════════════════════════════════════════════');
    
    // ✅ Create custom filename: PO00001_Receiver_DD-MM-YYYY
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
    
    const poNumber = po.poNumber || 'PO00000';
    const receiverName = sanitizeFilename(po.receiver);
    const dateFormatted = formatDate(po.date);
    const customFilename = `${poNumber}_${receiverName}_${dateFormatted}`;

    console.log('📝 Custom filename:', customFilename);
    
    // Generate the main PO PDF with custom filename
    const pdfResult = await poPdfGenerator.generatePOPDF(po, customFilename);
    
    // ✅ Prepare list of PDFs to merge (in order)
    const pdfsToMerge = [];
    
    // 1. Add user-uploaded attachment if provided
    if (attachmentPdf) {
      const isValid = await poPdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        pdfsToMerge.push(attachmentPdf);
        console.log('✅ Added user attachment PDF to merge list');
      } else {
        console.warn('⚠️  Invalid user attachment PDF, skipping');
      }
    }
    
    // 2. ✅ Add Terms & Conditions static PDF if includeStaticFile is true
    if (po.includeStaticFile === true) {
      try {
        const fsSync = require('fs');
        if (fsSync.existsSync(STATIC_PDF_PATH)) {
          const staticPdfBytes = fsSync.readFileSync(STATIC_PDF_PATH);
          pdfsToMerge.push(staticPdfBytes);
          console.log('✅ Added Terms & Conditions PDF to merge list');
        } else {
          console.warn('⚠️  Terms & Conditions PDF not found at:', STATIC_PDF_PATH);
        }
      } catch (error) {
        console.error('❌ Error reading Terms & Conditions PDF:', error.message);
      }
    }
    
    // Merge all PDFs
    let finalPdfResult = pdfResult;
    try {
      if (pdfsToMerge.length > 0) {
        console.log(`🔄 Merging ${pdfsToMerge.length} additional PDF(s) with PO...`);
        
        let currentPath = pdfResult.filepath;
        
        // Merge each PDF sequentially
        for (let i = 0; i < pdfsToMerge.length; i++) {
          console.log(`   Merging PDF ${i + 1} of ${pdfsToMerge.length}...`);
          const mergeResult = await poPdfGenerator.mergePDFs(
            currentPath,
            pdfsToMerge[i],
            null,
            pdfResult.language
          );
          currentPath = mergeResult.filepath;
          
          // Update final result on last merge
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
        console.log('   Total pages:', finalPdfResult.pageCount.total);
      } else {
        // No PDFs to merge, just add headers/footers
        console.log('ℹ️  No additional PDFs to merge, adding headers/footers only...');
        const headerResult = await poPdfGenerator.mergePDFs(
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
    
    // Update PO record with PDF metadata
    const pos = await this.loadPOs();
    const poIndex = pos.findIndex(p => p.id === id);
    
    if (poIndex !== -1) {
      pos[poIndex].pdfFilename = finalPdfResult.filename;
      pos[poIndex].pdfLanguage = finalPdfResult.language;
      pos[poIndex].pdfGeneratedAt = new Date().toISOString();
      pos[poIndex].pdfMerged = finalPdfResult.merged || false;
      if (finalPdfResult.pageCount) {
        pos[poIndex].pdfPageCount = finalPdfResult.pageCount;
      }
      await this.savePOs(pos);
    }
    
    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ PDF generation complete!');
    console.log('════════════════════════════════════════════════════════════\n');
    
    return {
      po,
      pdf: finalPdfResult
    };
  }

  /**
   * ✅ Send Purchase Order PDF by email with custom filename DD-MM-YYYY format
   */
  async sendPOByEmail(poId, userId, userRole, recipientEmail) {
    try {
      console.log('\n📧 === SEND PO EMAIL DEBUG ===');
      console.log('PO ID:', poId);
      console.log('User ID:', userId);
      console.log('Recipient:', recipientEmail);
      
      // ✅ Check credentials first
      const EMAIL_USER = process.env.EMAIL_USER;
      const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
      const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
      const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
      const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
      
      if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('❌ Email credentials missing!');
        throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
      }

      // Get PO
      const po = await this.getPOById(poId, userId, userRole);
      console.log('✅ PO found:', po.poNumber);

      if (!po.pdfFilename) {
        throw new Error('PDF not generated yet. Please generate PDF first.');
      }

      const pdfPath = path.join(__dirname, '../../data/purchases/pdfs', po.pdfFilename);

      const fsSync = require('fs');
      if (!fsSync.existsSync(pdfPath)) {
        throw new Error('PDF file not found');
      }
      console.log('✅ PDF file found');

      // Get creator's information
      const users = await this.loadUsers();
      const creator = users.find(u => u.id === po.createdBy);
      
      const senderName = creator && creator.name ? creator.name : 'Omega System';
      const creatorEmail = creator && creator.email ? creator.email : null;
      
      console.log('✅ Creator info:', { name: senderName, hasEmail: !!creatorEmail });

      // ✅ Create transporter with system credentials
      const nodemailer = require('nodemailer');
      console.log('📧 Creating email transporter...');
      
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
      const subject = `Purchase Order ${po.poNumber}`;
      const text = `Please find attached the Purchase Order ${po.poNumber}.\n\nSupplier: ${po.supplier || 'N/A'}\nReceiver: ${po.receiver || 'N/A'}\nDate: ${po.date}\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;
      
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

      // ✅ Create custom email attachment filename: PO00001_Receiver_DD-MM-YYYY.pdf
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
      
      const poNumber = po.poNumber || 'PO00000';
      const receiverName = sanitizeFilename(po.receiver);
      const dateFormatted = formatDate(po.date);
      const emailAttachmentName = `${poNumber}_${receiverName}_${dateFormatted}.pdf`;

      // ✅ Send email using system credentials
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
      console.log('  - Attachment:', emailAttachmentName);
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
      
      // Provide helpful error messages
      let errorMessage = error.message;
      if (error.code === 'EAUTH') {
        errorMessage = 'Email authentication failed. Please check your EMAIL_USER and EMAIL_APP_PASSWORD in .env file.';
      } else if (error.code === 'ESOCKET') {
        errorMessage = 'Cannot connect to email server. Please check your EMAIL_HOST and EMAIL_PORT settings.';
      }
      
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }
}

module.exports = new PurchaseService();