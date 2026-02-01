// src/services/rfq.service.js - FIXED WITH includeStaticFile SUPPORT

const fs = require('fs').promises;
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const rfqPdfGenerator = require('../utils/pdf-generator-rfq.util');

const RFQS_FILE = path.join(__dirname, '../../data/rfqs/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// ✅ NEW: Path to your static PDF file
const STATIC_PDF_PATH = path.join(__dirname, '../../data/Terms And Conditions/terms-and-conditions.pdf');

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

  /**
   * Create a new RFQ - WITH includeStaticFile SUPPORT
   */
  async createRFQ(rfqData, userId, userRole) {
    console.log('\n=== CREATE RFQ DEBUG ===');
    console.log('includeStaticFile:', rfqData.includeStaticFile); // ✅ NEW LOG
    
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
      includeStaticFile: rfqData.includeStaticFile || false, // ✅ NEW FIELD
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

    console.log('RFQ created with includeStaticFile:', newRFQ.includeStaticFile); // ✅ NEW LOG
    return newRFQ;
  }

  /**
   * Get all RFQs
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

    if (!rfq.createdByName) {
      rfq.createdByName = await this.getUserName(rfq.createdBy);
    }

    return rfq;
  }

  /**
   * Update RFQ - WITH includeStaticFile SUPPORT
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
    if (updateData.supplierAddress !== undefined) rfq.supplierAddress = updateData.supplierAddress;
    if (updateData.urgent !== undefined) rfq.urgent = updateData.urgent;
    if (updateData.items) rfq.items = updateData.items;
    if (updateData.notes !== undefined) rfq.notes = updateData.notes;
    if (updateData.status) rfq.status = updateData.status;
    if (updateData.includeStaticFile !== undefined) rfq.includeStaticFile = updateData.includeStaticFile; // ✅ NEW FIELD

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

    if (rfqIndex === -1) {
      throw new Error('RFQ not found');
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
   * Generate RFQ PDF with optional attachment and static PDF merge
   * ✅ UPDATED: Now handles includeStaticFile option
   */
  async generateRFQPDF(id, userId, userRole, attachmentPdf = null) {
    const rfq = await this.getRFQById(id, userId, userRole);
    
    if (!rfq.requester || rfq.requester.trim() === '') {
      rfq.requester = await this.getUserName(userId);
    }
    
    console.log('🔵 Generating PDF for RFQ:', rfq.rfqNumber);
    console.log('🔵 Include static file:', rfq.includeStaticFile);
    
    const pdfResult = await rfqPdfGenerator.generateRFQPDF(rfq);
    
    // ✅ NEW: Prepare list of PDFs to merge
    const pdfsToMerge = [];
    
    // Add user-uploaded attachment if provided
    if (attachmentPdf) {
      const isValid = await rfqPdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        pdfsToMerge.push(attachmentPdf);
        console.log('✅ Added user attachment PDF to merge list');
      } else {
        console.warn('⚠️ Invalid user attachment PDF, skipping');
      }
    }
    
    // ✅ NEW: Add static PDF if includeStaticFile is true
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
    
    // Merge all PDFs
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
        // No PDFs to merge, just add headers/footers
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
}

module.exports = new RFQService();