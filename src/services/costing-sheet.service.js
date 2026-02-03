// ============================================================
// COSTING SHEET SERVICE - WITH TERMS AND CONDITIONS PDF SUPPORT
// src/services/costing-sheet.service.js
// ============================================================
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const costingSheetPdfGenerator = require('../utils/pdf-generator-costing-sheet.util');

const COSTING_SHEETS_FILE = path.join(__dirname, '../../data/costing-sheets/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// ✅ Path to your static Terms and Conditions PDF file
const STATIC_PDF_PATH = path.join(__dirname, '../../data/Terms And Conditions/terms-and-conditions.pdf');

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
    return `ICS${paddedNumber}`;
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
   * ✅ CREATE COSTING SHEET - WITH includeStaticFile (Terms & Conditions) SUPPORT
   */
  async createCostingSheet(costingSheetData, userId, userRole) {
    console.log('\n=== CREATE COSTING SHEET DEBUG ===');
    console.log('userId:', userId);
    console.log('userId type:', typeof userId);
    console.log('userRole:', userRole);
    console.log('Include Terms & Conditions PDF:', costingSheetData.includeStaticFile); // ✅ LOG
    
    const costingSheets = await this.loadCostingSheets();
    
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    
    const paddedCounter = String(newCounter).padStart(4, '0');
    const id = `ICS-${paddedCounter}`;
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
      includeStaticFile: costingSheetData.includeStaticFile || false, // ✅ STORE THE FLAG
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
    console.log('Include Terms & Conditions:', newCostingSheet.includeStaticFile); // ✅ LOG
    return newCostingSheet;
  }

  /**
   * ✅ UPDATE COSTING SHEET - WITH includeStaticFile (Terms & Conditions) SUPPORT
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
    if (updateData.includeStaticFile !== undefined) costingSheet.includeStaticFile = updateData.includeStaticFile; // ✅ UPDATE THE FLAG

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
   * ✅ GENERATE COSTING SHEET PDF WITH TERMS & CONDITIONS SUPPORT
   * 
   * Merge order:
   * 1. Generated Costing Sheet PDF (always first)
   * 2. User-uploaded attachment PDF (if provided)
   * 3. Terms & Conditions static PDF (if includeStaticFile is true)
   */
  async generateCostingSheetPDF(id, userId, userRole, attachmentPdf = null) {
    // Get costing sheet data
    const costingSheet = await this.getCostingSheetById(id, userId, userRole);

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       GENERATING COSTING SHEET PDF                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('📄 CS Number:', costingSheet.csNumber);
    console.log('📎 Include Terms & Conditions:', costingSheet.includeStaticFile);
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

    // Generate the costing sheet PDF
    const pdfResult = await costingSheetPdfGenerator.generateCostingSheetPDF(costingSheet);

    // ✅ Prepare list of PDFs to merge (in order)
    const pdfsToMerge = [];
    
    // 1. Add user-uploaded attachment if provided
    if (attachmentPdf) {
      const isValid = await costingSheetPdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        pdfsToMerge.push(attachmentPdf);
        console.log('✅ Added user attachment PDF to merge list');
      } else {
        console.warn('⚠️  Invalid user attachment PDF, skipping');
      }
    }
    
    // 2. ✅ Add Terms & Conditions static PDF if includeStaticFile is true
    if (costingSheet.includeStaticFile === true) {
      try {
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
/**
   * DELETE COSTING SHEET
   * ✅ UPDATED: Now notifies File Management service
   */
  async deleteCostingSheet(id) {
    const costingSheets = await this.loadCostingSheets();
    const costingSheetIndex = costingSheets.findIndex(cs => cs.id === id);

    if (costingSheetIndex === -1) throw new Error('Costing Sheet not found');

    const costingSheet = costingSheets[costingSheetIndex];
    
    // ✅ Delete from File Management if PDF exists
    if (costingSheet.pdfFilename) {
      const fileManagementService = require('./File-management.service'); // Import here to avoid circular dependency
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
}

module.exports = new CostingSheetService();