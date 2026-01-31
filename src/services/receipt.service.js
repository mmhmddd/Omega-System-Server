// src/services/receipt.service.js - COMPLETE FIXED VERSION
const fs = require('fs').promises;
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/id-generator.util');
const pdfGenerator = require('../utils/pdf-generatorRecipts.util');

const RECEIPTS_FILE = path.join(__dirname, '../../data/receipts/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

class ReceiptService {
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
   * Load receipts from JSON file
   */
  async loadReceipts() {
    try {
      const data = await fs.readFile(RECEIPTS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Save receipts to JSON file
   */
  async saveReceipts(receipts) {
    await atomicWrite(RECEIPTS_FILE, JSON.stringify(receipts, null, 2));
  }

  /**
   * Load counter from counters.json file
   */
  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.RECEIPT || 0;
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
      
      counters.RECEIPT = counter;
      await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate receipt number from counter
   */
  generateReceiptNumber(counter) {
    const paddedNumber = String(counter).padStart(4, '0');
    return `RN${paddedNumber}`;
  }

  /**
   * Reset receipt counter to 0 AND delete all receipts
   */
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

  /**
   * Create a new receipt
   */
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

    // Get creator name with detailed logging
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
   * Get all receipts with filtering and pagination
   */
  async getAllReceipts(filters = {}, userId, userRole) {
    let receipts = await this.loadReceipts();

    // Add creator names to all receipts
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

  /**
   * Get receipt by ID
   */
  async getReceiptById(id, userId, userRole) {
    const receipts = await this.loadReceipts();
    const receipt = receipts.find(r => r.id === id);

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    if (userRole === 'employee' || userRole === 'admin') {
      if (receipt.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own receipts');
      }
    }

    // Add creator name
    const createdByName = await this.getUserNameById(receipt.createdBy);

    return {
      ...receipt,
      createdByName: createdByName || receipt.createdByName || 'Unknown User'
    };
  }

  /**
   * Get receipt by receipt number
   */
  async getReceiptByNumber(receiptNumber, userId, userRole) {
    const receipts = await this.loadReceipts();
    const receipt = receipts.find(r => r.receiptNumber === receiptNumber);

    if (!receipt) {
      throw new Error('Receipt not found');
    }

    if (userRole === 'employee' || userRole === 'admin') {
      if (receipt.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own receipts');
      }
    }

    // Add creator name
    const createdByName = await this.getUserNameById(receipt.createdBy);

    return {
      ...receipt,
      createdByName: createdByName || receipt.createdByName || 'Unknown User'
    };
  }

  /**
   * Update receipt
   */
  async updateReceipt(id, updateData, userId, userRole) {
    const receipts = await this.loadReceipts();
    const receiptIndex = receipts.findIndex(r => r.id === id);

    if (receiptIndex === -1) {
      throw new Error('Receipt not found');
    }

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

    receipt.updatedAt = new Date().toISOString();

    receipts[receiptIndex] = receipt;
    await this.saveReceipts(receipts);

    // Add creator name
    const createdByName = await this.getUserNameById(receipt.createdBy);

    return {
      ...receipt,
      createdByName: createdByName || receipt.createdByName || 'Unknown User'
    };
  }

  /**
   * Delete receipt
   */
  async deleteReceipt(id) {
    const receipts = await this.loadReceipts();
    const receiptIndex = receipts.findIndex(r => r.id === id);

    if (receiptIndex === -1) {
      throw new Error('Receipt not found');
    }

    receipts.splice(receiptIndex, 1);
    await this.saveReceipts(receipts);

    return { message: 'Receipt deleted successfully' };
  }

  /**
   * Get receipt statistics
   */
  async getReceiptStats(userId, userRole) {
    let receipts = await this.loadReceipts();

    if (userRole === 'employee' || userRole === 'admin') {
      receipts = receipts.filter(r => r.createdBy === userId);
    }

    const stats = {
      totalReceipts: receipts.length,
      thisMonth: 0,
      thisWeek: 0,
      today: 0
    };

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
   * Generate receipt PDF with optional attachment merge
   */
  async generateReceiptPDF(id, userId, userRole, attachmentPdf = null) {

    
    // Get receipt data
    const receipt = await this.getReceiptById(id, userId, userRole);
    
    // Generate the receipt PDF
    const pdfResult = await pdfGenerator.generateReceiptPDF(receipt);
    
    // Merge with attachment
    let finalPdfResult = pdfResult;
    try {
      if (attachmentPdf) {
        // Validate attachment
        const isValid = await pdfGenerator.isValidPDF(attachmentPdf);
        if (!isValid) {
          throw new Error('Invalid PDF attachment');
        }
      }

      // Merge PDFs
      const mergeResult = await pdfGenerator.mergePDFs(
        pdfResult.filepath,
        attachmentPdf,
        null,
        pdfResult.language
      );

      finalPdfResult = {
        ...pdfResult,
        filename: mergeResult.filename,
        filepath: mergeResult.filepath,
        merged: mergeResult.merged,
        pageCount: mergeResult.pageCount
      };
    } catch (mergeError) {
      console.error('PDF merge/header failed:', mergeError.message);
      finalPdfResult.mergeError = mergeError.message;
    }
    
    // Update receipt record with PDF info
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
    
    return {
      receipt,
      pdf: finalPdfResult
    };
  }
}

module.exports = new ReceiptService();