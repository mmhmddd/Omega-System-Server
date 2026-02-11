// ============================================================
// COSTING SHEET SERVICE - WITH TEXT-BASED TERMS AND CONDITIONS
// src/services/costing-sheet.service.js
// ============================================================
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const costingSheetPdfGenerator = require('../utils/pdf-generator-costing-sheet.util');
const nodemailer = require('nodemailer');
const COSTING_SHEETS_FILE = path.join(__dirname, '../../data/costing-sheets/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// ✅ Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;



class CostingSheetService {
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
      
      // Try exact match first
      let user = users.find(u => u.id === userId);
      
      // If not found, try string comparison
      if (!user && typeof userId !== 'string') {
        const userIdStr = String(userId);
        console.log('Trying string conversion:', userIdStr);
        user = users.find(u => u.id === userIdStr);
      }
      
      // If still not found, try trimming whitespace
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

  async loadCostingSheets() {
    try {
      const data = await fs.readFile(COSTING_SHEETS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveCostingSheets(costingSheets) {
    await atomicWrite(COSTING_SHEETS_FILE, JSON.stringify(costingSheets, null, 2));
  }

  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.ICS || 0;
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
      counters.ICS = counter;
      await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
    } catch (error) {
      throw error;
    }
  }

  generateCSNumber(counter) {
    const paddedNumber = String(counter).padStart(4, '0');
    return `CS${paddedNumber}`;
  }

  detectLanguage(text) {
    if (!text) return 'en';
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  detectCostingSheetLanguage(costingSheetData) {
    const fieldsToCheck = [
      costingSheetData.client,
      costingSheetData.project,
      costingSheetData.notes,
      costingSheetData.additionalNotes
    ];

    if (costingSheetData.items && costingSheetData.items.length > 0) {
      costingSheetData.items.forEach(item => {
        if (item.description) fieldsToCheck.push(item.description);
      });
    }

    let arabicCount = 0;
    let totalFields = 0;

    fieldsToCheck.forEach(field => {
      if (field) {
        totalFields++;
        if (this.detectLanguage(field) === 'ar') arabicCount++;
      }
    });

    return arabicCount > (totalFields / 2) ? 'ar' : 'en';
  }

  /**
   * Add creator names to costing sheets
   */
  async enrichCostingSheetsWithCreatorNames(costingSheets) {
    const users = await this.loadUsers();
    
    return Promise.all(costingSheets.map(async costingSheet => {
      // Always look up the current user name from users database
      const user = users.find(u => u.id === costingSheet.createdBy);
      
      if (user && user.name) {
        // User found - use their current name
        return {
          ...costingSheet,
          createdByName: user.name
        };
      } else {
        // User not found - use Unknown User
        return {
          ...costingSheet,
          createdByName: 'Unknown User'
        };
      }
    }));
  }

  /**
   * ✅ CREATE COSTING SHEET - WITH TEXT-BASED TERMS & CONDITIONS
   */
  async createCostingSheet(costingSheetData, userId, userRole) {
    console.log('\n=== CREATE COSTING SHEET DEBUG ===');
    console.log('userId:', userId);
    console.log('userId type:', typeof userId);
    console.log('userRole:', userRole);
    console.log('Include Terms & Conditions:', costingSheetData.includeTermsAndConditions);
    console.log('Terms & Conditions Text Length:', costingSheetData.termsAndConditionsText?.length || 0);
    
    const costingSheets = await this.loadCostingSheets();
    
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    
    const paddedCounter = String(newCounter).padStart(4, '0');
    const id = `CS-${paddedCounter}`;
    const csNumber = this.generateCSNumber(newCounter);
    
    await this.saveCounter(newCounter);

    const today = new Date().toISOString().split('T')[0];
    const detectedLanguage = costingSheetData.forceLanguage || this.detectCostingSheetLanguage(costingSheetData);

    // Get creator name with detailed logging
    console.log('Calling getUserNameById with:', userId);
    const createdByName = await this.getUserNameById(userId);
    console.log('getUserNameById returned:', createdByName);
    console.log('createdByName is null?', createdByName === null);
    console.log('createdByName is undefined?', createdByName === undefined);
    console.log('============================\n');

    const newCostingSheet = {
      id,
      csNumber,
      date: costingSheetData.date || today,
      client: costingSheetData.client || '',
      project: costingSheetData.project || '',
      profitPercentage: costingSheetData.profitPercentage || 0,
      notes: costingSheetData.notes || '',
      items: costingSheetData.items || [],
      additionalNotes: costingSheetData.additionalNotes || '',
      // ✅ NEW: Store Terms & Conditions as text instead of file flag
      includeTermsAndConditions: costingSheetData.includeTermsAndConditions || false,
      termsAndConditionsText: costingSheetData.termsAndConditionsText || '',
      language: detectedLanguage,
      status: 'pending',
      createdBy: userId,
      createdByName: createdByName || 'Unknown User',
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    costingSheets.push(newCostingSheet);
    await this.saveCostingSheets(costingSheets);

    console.log('Costing Sheet created with name:', newCostingSheet.createdByName);
    console.log('Include Terms & Conditions:', newCostingSheet.includeTermsAndConditions);
    console.log('Terms & Conditions Text:', newCostingSheet.termsAndConditionsText ? 'Present' : 'Empty');
    return newCostingSheet;
  }

  /**
   * ✅ UPDATE COSTING SHEET - WITH TEXT-BASED TERMS & CONDITIONS
   */
  async updateCostingSheet(id, updateData, userId, userRole) {
    const costingSheets = await this.loadCostingSheets();
    const costingSheetIndex = costingSheets.findIndex(cs => cs.id === id);

    if (costingSheetIndex === -1) {
      throw new Error('Costing Sheet not found');
    }

    const costingSheet = costingSheets[costingSheetIndex];

    if (userRole === 'employee' || userRole === 'admin') {
      if (costingSheet.createdBy !== userId) {
        throw new Error('Access denied: You can only edit your own Costing Sheets');
      }
    }

    // Update fields
    if (updateData.date) costingSheet.date = updateData.date;
    if (updateData.client !== undefined) costingSheet.client = updateData.client;
    if (updateData.project !== undefined) costingSheet.project = updateData.project;
    if (updateData.profitPercentage !== undefined) costingSheet.profitPercentage = updateData.profitPercentage;
    if (updateData.notes !== undefined) costingSheet.notes = updateData.notes;
    if (updateData.items) costingSheet.items = updateData.items;
    if (updateData.additionalNotes !== undefined) costingSheet.additionalNotes = updateData.additionalNotes;
    if (updateData.status) costingSheet.status = updateData.status;
    
    // ✅ UPDATE: Handle text-based Terms & Conditions
    if (updateData.includeTermsAndConditions !== undefined) {
      costingSheet.includeTermsAndConditions = updateData.includeTermsAndConditions;
    }
    if (updateData.termsAndConditionsText !== undefined) {
      costingSheet.termsAndConditionsText = updateData.termsAndConditionsText;
    }

    const detectedLanguage = updateData.forceLanguage || this.detectCostingSheetLanguage(costingSheet);
    costingSheet.language = detectedLanguage;
    costingSheet.updatedAt = new Date().toISOString();

    costingSheets[costingSheetIndex] = costingSheet;
    await this.saveCostingSheets(costingSheets);

    // Add creator name
    const createdByName = await this.getUserNameById(costingSheet.createdBy);

    return {
      ...costingSheet,
      createdByName: createdByName || costingSheet.createdByName || 'Unknown User'
    };
  }

  /**
   * ✅ GENERATE COSTING SHEET PDF WITH TEXT-BASED TERMS & CONDITIONS
   * The PDF generator will receive the termsAndConditionsText and add it as a page
   */
  async generateCostingSheetPDF(id, userId, userRole, attachmentPdf = null) {
    // Get costing sheet data
    const costingSheet = await this.getCostingSheetById(id, userId, userRole);

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       GENERATING COSTING SHEET PDF                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('📄 CS Number:', costingSheet.csNumber);
    console.log('📎 Include Terms & Conditions:', costingSheet.includeTermsAndConditions);
    console.log('📎 Terms Text Length:', costingSheet.termsAndConditionsText?.length || 0);
    console.log('📎 User Attachment:', attachmentPdf ? 'Yes' : 'No');
    console.log('════════════════════════════════════════════════════════════');

    // Delete old PDF if exists
    if (costingSheet.pdfFilename) {
      const oldPdfPath = path.join(__dirname, '../../data/costing-sheets/pdfs', costingSheet.pdfFilename);
      if (fsSync.existsSync(oldPdfPath)) {
        try {
          fsSync.unlinkSync(oldPdfPath);
          console.log('✓ Old PDF deleted');
        } catch (err) {
          console.log('Could not delete old PDF:', err.message);
        }
      }
    }

    // Create filename pattern: CS0001_Client_DD-MM-YYYY.pdf
    const sanitizeFilename = (str) => {
      if (!str) return 'Unknown';
      return str.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, '_').substring(0, 30);
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
    
    const csNumber = costingSheet.csNumber || 'CS0000';
    const clientName = sanitizeFilename(costingSheet.client);
    const dateFormatted = formatDate(costingSheet.date);
    const customFilename = `${csNumber}_${clientName}_${dateFormatted}`;

    console.log('📝 Custom filename:', customFilename);

    // ✅ Pass termsAndConditionsText to PDF generator
    const pdfResult = await costingSheetPdfGenerator.generateCostingSheetPDF(
      costingSheet, 
      customFilename,
      costingSheet.termsAndConditionsText // Pass the text
    );

    // Prepare list of PDFs to merge (user attachment only)
    const pdfsToMerge = [];
    
    // Add user-uploaded attachment if provided
    if (attachmentPdf) {
      const isValid = await costingSheetPdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        pdfsToMerge.push(attachmentPdf);
        console.log('✅ Added user attachment PDF to merge list');
      } else {
        console.warn('⚠️  Invalid user attachment PDF, skipping');
      }
    }

    // Merge all PDFs
    let finalPdfResult = pdfResult;
    try {
      if (pdfsToMerge.length > 0) {
        console.log(`🔄 Merging ${pdfsToMerge.length} additional PDF(s) with Costing Sheet...`);
        
        let currentPath = pdfResult.filepath;
        
        // Merge each PDF sequentially
        for (let i = 0; i < pdfsToMerge.length; i++) {
          console.log(`   Merging PDF ${i + 1} of ${pdfsToMerge.length}...`);
          const mergeResult = await costingSheetPdfGenerator.mergePDFs(
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
        const headerResult = await costingSheetPdfGenerator.mergePDFs(
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

    // Update costing sheet record with PDF info
    const costingSheets = await this.loadCostingSheets();
    const costingSheetIndex = costingSheets.findIndex(cs => cs.id === id);

    if (costingSheetIndex !== -1) {
      costingSheets[costingSheetIndex].pdfFilename = finalPdfResult.filename;
      costingSheets[costingSheetIndex].pdfLanguage = finalPdfResult.language;
      costingSheets[costingSheetIndex].pdfGeneratedAt = new Date().toISOString();
      costingSheets[costingSheetIndex].pdfMerged = finalPdfResult.merged || false;
      if (finalPdfResult.pageCount) {
        costingSheets[costingSheetIndex].pdfPageCount = finalPdfResult.pageCount;
      }
      await this.saveCostingSheets(costingSheets);
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ PDF generation complete!');
    console.log('════════════════════════════════════════════════════════════\n');

    return {
      costingSheet,
      pdf: finalPdfResult
    };
  }

  /**
   * GET ALL COSTING SHEETS
   */
  async getAllCostingSheets(filters = {}, userId, userRole) {
    let costingSheets = await this.loadCostingSheets();

    // Add creator names to all costing sheets
    costingSheets = await this.enrichCostingSheetsWithCreatorNames(costingSheets);

    if (userRole === 'employee' || userRole === 'admin') {
      costingSheets = costingSheets.filter(cs => cs.createdBy === userId);
    }

    if (filters.csNumber) {
      costingSheets = costingSheets.filter(cs => 
        cs.csNumber.toLowerCase().includes(filters.csNumber.toLowerCase())
      );
    }

    if (filters.startDate) costingSheets = costingSheets.filter(cs => cs.date >= filters.startDate);
    if (filters.endDate) costingSheets = costingSheets.filter(cs => cs.date <= filters.endDate);
    if (filters.client) costingSheets = costingSheets.filter(cs => cs.client.toLowerCase().includes(filters.client.toLowerCase()));
    if (filters.project) costingSheets = costingSheets.filter(cs => cs.project.toLowerCase().includes(filters.project.toLowerCase()));

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      costingSheets = costingSheets.filter(cs =>
        cs.csNumber.toLowerCase().includes(searchLower) ||
        cs.client.toLowerCase().includes(searchLower) ||
        cs.project.toLowerCase().includes(searchLower) ||
        cs.notes.toLowerCase().includes(searchLower) ||
        (cs.createdByName && cs.createdByName.toLowerCase().includes(searchLower))
      );
    }

    costingSheets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedCostingSheets = costingSheets.slice(startIndex, endIndex);

    return {
      costingSheets: paginatedCostingSheets,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(costingSheets.length / limit),
        totalCostingSheets: costingSheets.length,
        limit
      }
    };
  }

  /**
   * GET COSTING SHEET BY ID
   */
  async getCostingSheetById(id, userId, userRole) {
    const costingSheets = await this.loadCostingSheets();
    const costingSheet = costingSheets.find(cs => cs.id === id);

    if (!costingSheet) throw new Error('Costing Sheet not found');

    if (userRole === 'employee' || userRole === 'admin') {
      if (costingSheet.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own Costing Sheets');
      }
    }

    // Add creator name
    const createdByName = await this.getUserNameById(costingSheet.createdBy);

    return {
      ...costingSheet,
      createdByName: createdByName || costingSheet.createdByName || 'Unknown User'
    };
  }

  /**
   * DELETE COSTING SHEET
   */
  async deleteCostingSheet(id) {
    const costingSheets = await this.loadCostingSheets();
    const costingSheetIndex = costingSheets.findIndex(cs => cs.id === id);

    if (costingSheetIndex === -1) throw new Error('Costing Sheet not found');

    const costingSheet = costingSheets[costingSheetIndex];
    
    // Delete from File Management if PDF exists
    if (costingSheet.pdfFilename) {
      const fileManagementService = require('./File-management.service');
      try {
        await fileManagementService.deleteFileByFilename(costingSheet.pdfFilename);
      } catch (error) {
        console.log('File Management deletion warning:', error.message);
      }
      
      // Delete physical PDF file
      const pdfPath = path.join(__dirname, '../../data/costing-sheets/pdfs', costingSheet.pdfFilename);
      if (fsSync.existsSync(pdfPath)) {
        try {
          fsSync.unlinkSync(pdfPath);
        } catch (err) {
          console.log('Could not delete PDF:', err.message);
        }
      }
    }

    costingSheets.splice(costingSheetIndex, 1);
    await this.saveCostingSheets(costingSheets);

    return { message: 'Costing Sheet deleted successfully' };
  }

  /**
   * GET COSTING SHEET STATS
   */
  async getCostingSheetStats(userId, userRole) {
    let costingSheets = await this.loadCostingSheets();

    if (userRole === 'employee' || userRole === 'admin') {
      costingSheets = costingSheets.filter(cs => cs.createdBy === userId);
    }

    const stats = {
      totalCostingSheets: costingSheets.length,
      pending: costingSheets.filter(cs => cs.status === 'pending').length,
      approved: costingSheets.filter(cs => cs.status === 'approved').length,
      rejected: costingSheets.filter(cs => cs.status === 'rejected').length,
      thisMonth: 0,
      thisWeek: 0,
      today: 0
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    costingSheets.forEach(costingSheet => {
      const costingSheetDate = new Date(costingSheet.createdAt);
      if (costingSheetDate >= startOfMonth) stats.thisMonth++;
      if (costingSheetDate >= startOfWeek) stats.thisWeek++;
      if (costingSheetDate >= startOfDay) stats.today++;
    });

    return stats;
  }

  /**
   * RESET COSTING SHEET COUNTER
   */
  async resetCostingSheetCounter() {
    const oldCounter = await this.loadCounter();
    const costingSheets = await this.loadCostingSheets();
    const deletedCount = costingSheets.length;
    
    // Delete all PDF files
    const pdfDir = path.join(__dirname, '../../data/costing-sheets/pdfs');
    if (fsSync.existsSync(pdfDir)) {
      const files = fsSync.readdirSync(pdfDir);
      files.forEach(file => {
        try {
          fsSync.unlinkSync(path.join(pdfDir, file));
        } catch (err) {
          console.log(`Could not delete PDF file ${file}:`, err.message);
        }
      });
    }
    
    await this.saveCounter(0);
    await this.saveCostingSheets([]);

    return {
      oldCounter,
      newCounter: 0,
      deletedCostingSheets: deletedCount,
      nextICSNumber: this.generateCSNumber(1),
      message: `Counter reset to 0 and ${deletedCount} Costing Sheet(s) deleted`
    };
  }

  /**
   * Send costing sheet PDF by email
   */
  async sendCostingSheetByEmail(csId, userId, userRole, recipientEmail) {
    try {
      console.log('\n📧 === SEND COSTING SHEET EMAIL DEBUG ===');
      console.log('CS ID:', csId);
      console.log('User ID:', userId);
      console.log('Recipient:', recipientEmail);
      
      if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('❌ Email credentials missing!');
        throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
      }

      const costingSheet = await this.getCostingSheetById(csId, userId, userRole);
      console.log('✅ Costing Sheet found:', costingSheet.csNumber);

      if (!costingSheet.pdfFilename) {
        throw new Error('PDF not generated yet. Please generate PDF first.');
      }

      const pdfPath = path.join(__dirname, '../../data/costing-sheets/pdfs', costingSheet.pdfFilename);

      if (!fsSync.existsSync(pdfPath)) {
        throw new Error('PDF file not found');
      }
      console.log('✅ PDF file found');

      const users = await this.loadUsers();
      const creator = users.find(u => u.id === costingSheet.createdBy);
      
      const senderName = creator && creator.name ? creator.name : 'Omega System';
      const creatorEmail = creator && creator.email ? creator.email : null;
      
      console.log('✅ Creator info:', { name: senderName, hasEmail: !!creatorEmail });

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

      console.log('🔄 Verifying SMTP connection...');
      await transporter.verify();
      console.log('✅ SMTP connection verified');

      const subject = `Costing Sheet ${costingSheet.csNumber}`;
      const text = `Please find attached the Costing Sheet ${costingSheet.csNumber}.\n\nClient: ${costingSheet.client || 'N/A'}\nProject: ${costingSheet.project || 'N/A'}\nDate: ${costingSheet.date}\nProfit: ${costingSheet.profitPercentage}%\n\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;
      
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Costing Sheet ${costingSheet.csNumber}</h2>
          </div>
          <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 10px 10px;">
            <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">Please find attached the costing sheet document.</p>
            <table style="border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">CS Number:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1565C0; font-weight: 600;">${costingSheet.csNumber}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Date:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${costingSheet.date}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Profit %:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #059669; font-weight: 600;">${costingSheet.profitPercentage}%</td>
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
      
      const sanitizeFilename = (str) => {
        if (!str) return 'Unknown';
        return str.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, '_').substring(0, 30);
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
      
      const csNumber = costingSheet.csNumber || 'CS0000';
      const clientName = sanitizeFilename(costingSheet.client);
      const dateFormatted = formatDate(costingSheet.date);
      const emailAttachmentName = `${csNumber}_${clientName}_${dateFormatted}.pdf`;

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

module.exports = new CostingSheetService();