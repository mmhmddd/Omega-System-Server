// src/services/rfq.service.js - COMPLETE RFQ SERVICE WITH PDF
const fs = require('fs').promises;
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const rfqPdfGenerator = require('../utils/pdf-generator-rfq.util');

const RFQS_FILE = path.join(__dirname, '../../data/rfqs/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

class RFQService {
  /**
   * Load RFQs from JSON file
   */
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

  /**
   * Save RFQs to JSON file
   */
  async saveRFQs(rfqs) {
    await atomicWrite(RFQS_FILE, JSON.stringify(rfqs, null, 2));
  }

  /**
   * Load counter from counters.json file
   */
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
      
      counters.RFQ = counter;
      await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get user name by user ID
   */
  async getUserName(userId) {
    try {
      console.log('getUserName called with userId:', userId);
      const data = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      console.log('Total users found:', users.length);
      
      const user = users.find(u => u.id === userId);
      console.log('User found:', user);
      
      if (user) {
        const returnName = user.name || user.username || userId;
        console.log('Returning name:', returnName);
        return returnName;
      }
      
      console.log('User not found, returning userId:', userId);
      return userId;
    } catch (error) {
      console.log('Could not fetch user name:', error.message);
      return userId;
    }
  }

  /**
   * Generate RFQ number from counter
   */
  generateRFQNumber(counter) {
    const paddedNumber = String(counter).padStart(4, '0');
    return `RFQ${paddedNumber}`;
  }

  /**
   * Reset RFQ counter to 0 AND delete all RFQs (super admin only)
   */
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

  /**
   * Detect language from text (Arabic or English)
   */
  detectLanguage(text) {
    if (!text) return 'en';
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  /**
   * Detect primary language from RFQ data
   */
  detectRFQLanguage(rfqData) {
    const fieldsToCheck = [
      rfqData.production,
      rfqData.supplier,
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

  /**
   * Create a new RFQ
   */
  async createRFQ(rfqData, userId, userRole) {
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

    // Auto-populate requester with user's name if not provided
    let requesterName = rfqData.requester;
    if (!requesterName || requesterName.trim() === '') {
      requesterName = await this.getUserName(userId);
    }

    const newRFQ = {
      id,
      rfqNumber,
      date: rfqData.date || today,
      time: rfqData.time || currentTime,
      requester: requesterName,
      production: rfqData.production || '',
      supplier: rfqData.supplier || '',
      urgent: rfqData.urgent || false,
      items: rfqData.items || [],
      notes: rfqData.notes || '',
      language: detectedLanguage,
      status: 'pending',
      createdBy: userId,
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    rfqs.push(newRFQ);
    await this.saveRFQs(rfqs);

    return newRFQ;
  }

  /**
   * Get all RFQs with filtering and pagination
   */
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
        r.notes.toLowerCase().includes(searchLower)
      );
    }

    rfqs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedRFQs = rfqs.slice(startIndex, endIndex);

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

  /**
   * Get RFQ by ID
   */
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

    return rfq;
  }

  /**
   * Update RFQ
   */
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
    if (updateData.urgent !== undefined) rfq.urgent = updateData.urgent;
    if (updateData.items) rfq.items = updateData.items;
    if (updateData.notes !== undefined) rfq.notes = updateData.notes;
    if (updateData.status) rfq.status = updateData.status;

    const detectedLanguage = updateData.forceLanguage || this.detectRFQLanguage(rfq);
    rfq.language = detectedLanguage;

    rfq.updatedAt = new Date().toISOString();

    rfqs[rfqIndex] = rfq;
    await this.saveRFQs(rfqs);

    return rfq;
  }

  /**
   * Delete RFQ (super admin only)
   */
  async deleteRFQ(id) {
    const rfqs = await this.loadRFQs();
    const rfqIndex = rfqs.findIndex(r => r.id === id);

    if (rfqIndex === -1) {
      throw new Error('RFQ not found');
    }

    rfqs.splice(rfqIndex, 1);
    await this.saveRFQs(rfqs);

    return { message: 'RFQ deleted successfully' };
  }

  /**
   * Get RFQ statistics
   */
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
   * Generate RFQ PDF with optional attachment merge
   */
  async generateRFQPDF(id, userId, userRole, attachmentPdf = null) {
    // Get RFQ data
    const rfq = await this.getRFQById(id, userId, userRole);
    
    // Auto-fill requester name if empty
    if (!rfq.requester || rfq.requester.trim() === '') {
      rfq.requester = await this.getUserName(userId);
    }
    
    // Generate the RFQ PDF
    const pdfResult = await rfqPdfGenerator.generateRFQPDF(rfq);
    
    // Merge with attachment (or add headers/footers to single PDF)
    let finalPdfResult = pdfResult;
    try {
      if (attachmentPdf) {
        // Validate attachment
        const isValid = await rfqPdfGenerator.isValidPDF(attachmentPdf);
        if (!isValid) {
          throw new Error('Invalid PDF attachment');
        }
      }

      // Merge PDFs (pass language from pdfResult)
      const mergeResult = await rfqPdfGenerator.mergePDFs(
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
    
    // Update RFQ record with PDF info
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
}

module.exports = new RFQService();