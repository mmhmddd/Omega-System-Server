// src/services/empty-receipt.service.js - ENHANCED WITH NEW FEATURES
const fs = require('fs').promises;
const path = require('path');
const pdfGenerator = require('../utils/pdf-generator-empty-receipt.util');

const DATA_DIR = path.join(__dirname, '../../data/empty-receipts');
const PDFS_DIR = path.join(DATA_DIR, 'pdfs');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

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
      await fs.mkdir(PDFS_DIR, { recursive: true }); // ✅ NEW: Ensure pdfs subdirectory
      
      try {
        await fs.access(INDEX_FILE);
      } catch {
        // Create empty index if it doesn't exist
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
      // Always look up the current user name from users database
      const user = users.find(u => u.id === receipt.createdBy);
      
      if (user && user.name) {
        // User found - use their current name
        return {
          ...receipt,
          createdByName: user.name
        };
      } else {
        // User not found - use Unknown User
        return {
          ...receipt,
          createdByName: 'Unknown User'
        };
      }
    }));
  }

  /**
   * ✅ NEW: Generate receipt number (like ER-00001)
   */
  async generateReceiptNumber() {
    const receipts = await this.readIndex();
    
    if (receipts.length === 0) {
      return 'ER-00001';
    }

    // Get the last receipt number and increment
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
   * EXISTING: Generate empty receipt PDF with header only
   * ✅ ENHANCED: Now also saves to receipts format with receiptNumber
   */
  async generateEmptyReceiptPDF(language = 'ar', userId, userRole) {
    try {
      console.log('\n=== CREATE EMPTY RECEIPT DEBUG ===');
      console.log('userId:', userId);
      console.log('userId type:', typeof userId);
      console.log('userRole:', userRole);
      
      console.log('🔵 Generating empty receipt PDF in language:', language);
      
      // Get creator name with detailed logging
      console.log('Calling getUserNameById with:', userId);
      const createdByName = await this.getUserNameById(userId);
      console.log('getUserNameById returned:', createdByName);
      console.log('createdByName is null?', createdByName === null);
      console.log('createdByName is undefined?', createdByName === undefined);
      console.log('============================\n');
      
      // ✅ NEW: Generate receipt number
      const receiptNumber = await this.generateReceiptNumber();
      console.log('📋 Generated receipt number:', receiptNumber);
      
      // Generate the empty receipt PDF (header only)
      const pdfResult = await pdfGenerator.generateEmptyReceiptPDF(language);
      
      console.log('✅ Empty receipt PDF generated:', pdfResult.filename);
      
      // Read current index
      const receipts = await this.readIndex();
      
      // ✅ ENHANCED: Create new receipt record with receipt number
      const newReceipt = {
        id: this.generateId(receipts),
        receiptNumber: receiptNumber, // ✅ NEW field
        filename: pdfResult.filename,
        pdfFilename: pdfResult.filename, // ✅ NEW: For file management compatibility
        language: language,
        notes: '', // ✅ NEW: For future use
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), // ✅ NEW field
        createdBy: userId,
        createdByName: createdByName || 'Unknown User',
        createdByRole: userRole || 'user',
        pdfGenerated: true // ✅ NEW: Track PDF generation status
      };
      
      console.log('💾 Saving receipt record:', newReceipt);
      
      // Add to index
      receipts.unshift(newReceipt); // Add to beginning
      await this.writeIndex(receipts);
      
      console.log('✅ Receipt saved to index successfully');
      console.log('Empty receipt created with name:', newReceipt.createdByName);
      
      return {
        id: newReceipt.id, // ✅ NEW: Return ID
        receiptNumber: newReceipt.receiptNumber, // ✅ NEW: Return receipt number
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
   * ✅ NEW: Create empty receipt without PDF generation (following receipts pattern)
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
      filename: null // Keep for backward compatibility
    };

    // Get creator name
    const createdByName = await this.getUserNameById(receiptData.createdBy);
    newReceipt.createdByName = createdByName || 'Unknown User';

    receipts.unshift(newReceipt);
    await this.writeIndex(receipts);

    return newReceipt;
  }

  /**
   * ✅ NEW: Get empty receipt by ID
   */
  async getById(id) {
    const receipts = await this.readIndex();
    let receipt = receipts.find(r => r.id === parseInt(id));

    if (!receipt) {
      throw new Error('Empty receipt not found');
    }

    // Enrich with creator name
    const enriched = await this.enrichReceiptsWithCreatorNames([receipt]);
    return enriched[0];
  }

  /**
   * ✅ NEW: Get empty receipt by receipt number
   */
  async getByReceiptNumber(receiptNumber) {
    const receipts = await this.readIndex();
    let receipt = receipts.find(r => r.receiptNumber === receiptNumber);

    if (!receipt) {
      throw new Error('Empty receipt not found');
    }

    // Enrich with creator name
    const enriched = await this.enrichReceiptsWithCreatorNames([receipt]);
    return enriched[0];
  }

  /**
   * ✅ NEW: Update empty receipt
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

    // Enrich with creator name
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
   * EXISTING: Get all empty receipts with pagination and search
   * ✅ ENHANCED: Now compatible with new receipt structure
   */
  async getAllEmptyReceipts(params = {}) {
    try {
      const { search, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', startDate, endDate, createdBy } = params;
      
      // Read all receipts
      let receipts = await this.readIndex();
      
      console.log(`📊 Total receipts in index: ${receipts.length}`);
      
      // Add creator names to all receipts
      receipts = await this.enrichReceiptsWithCreatorNames(receipts);
      
      // ✅ NEW: Apply date filters
      if (startDate) {
        receipts = receipts.filter(r => new Date(r.createdAt) >= new Date(startDate));
      }

      if (endDate) {
        receipts = receipts.filter(r => new Date(r.createdAt) <= new Date(endDate));
      }

      // ✅ NEW: Apply creator filter
      if (createdBy) {
        receipts = receipts.filter(r => r.createdBy === createdBy);
      }
      
      // Apply search filter - only if search is provided and not 'undefined' string
      if (search && search !== 'undefined' && search.trim() !== '') {
        const searchLower = search.toLowerCase();
        receipts = receipts.filter(receipt => 
          (receipt.filename && receipt.filename.toLowerCase().includes(searchLower)) ||
          (receipt.receiptNumber && receipt.receiptNumber.toLowerCase().includes(searchLower)) || // ✅ NEW
          (receipt.createdByName && receipt.createdByName.toLowerCase().includes(searchLower)) ||
          (receipt.notes && receipt.notes.toLowerCase().includes(searchLower)) || // ✅ NEW
          (receipt.language && receipt.language.toLowerCase().includes(searchLower))
        );
        console.log(`🔍 After search filter: ${receipts.length} receipts`);
      }

      // ✅ NEW: Sort receipts
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
      
      // Calculate pagination
      const totalReceipts = receipts.length;
      const totalPages = Math.ceil(totalReceipts / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      
      // Get paginated data
      const paginatedReceipts = receipts.slice(startIndex, endIndex);
      
      // Log first receipt for debugging
      if (paginatedReceipts.length > 0) {
        console.log('📄 First receipt data:', paginatedReceipts[0]);
      }
      
      return {
        receipts: paginatedReceipts, // ✅ CHANGED: 'data' to 'receipts' for consistency
        data: paginatedReceipts, // Keep 'data' for backward compatibility
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
   * ✅ NEW: Alias for getAllEmptyReceipts (following receipts pattern)
   */
  async getAll(filters = {}) {
    return this.getAllEmptyReceipts(filters);
  }

  /**
   * EXISTING: Delete empty receipt
   * ✅ ENHANCED: Now handles both old and new file structures
   */
/**
 * ✅ DELETE EMPTY RECEIPT - WITH FILE MANAGEMENT INTEGRATION (like price-quote)
 */
async deleteEmptyReceipt(id) {
  try {
    const receipts = await this.readIndex();
    const receiptIndex = receipts.findIndex(r => r.id === parseInt(id));
    
    if (receiptIndex === -1) {
      throw new Error('Empty receipt not found');
    }
    
    const receipt = receipts[receiptIndex];
    
    // ✅ DELETE FROM FILE MANAGEMENT (like price-quote)
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
   * ✅ NEW: Alias for deleteEmptyReceipt (following receipts pattern)
   */
  async delete(id) {
    return this.deleteEmptyReceipt(id);
  }

  /**
   * ✅ NEW: Generate PDF for existing receipt
   */
  async generatePdf(id) {
    const receipt = await this.getById(id);
    
    if (receipt.pdfGenerated && receipt.pdfFilename) {
      console.log('⚠️ PDF already exists for this receipt');
      return receipt;
    }

    const language = receipt.language || 'ar';
    const pdfResult = await pdfGenerator.generateEmptyReceiptPDF(language);
    
    // Update receipt with PDF info
    const updatedReceipt = await this.update(id, {
      pdfGenerated: true,
      pdfFilename: pdfResult.filename,
      filename: pdfResult.filename
    });

    return updatedReceipt;
  }

  /**
   * ✅ NEW: Get PDF path for download
   */
  async getPdfPath(id) {
    const receipt = await this.getById(id);

    if (!receipt.pdfGenerated || !receipt.pdfFilename) {
      throw new Error('PDF not generated yet');
    }

    // Try both locations
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
   * EXISTING: Get PDF file path (for backward compatibility)
   */
  getPDFPath(filename) {
    // Try both locations
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

    // Default to DATA_DIR for backward compatibility
    return path.join(DATA_DIR, filename);
  }

  /**
   * ✅ NEW: Get statistics
   */
  async getStats() {
    const receipts = await this.readIndex();
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
   * ✅ NEW: Reset counter
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
}

module.exports = new EmptyReceiptService();