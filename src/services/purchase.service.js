// src/services/purchase.service.js - COMPLETE PURCHASE ORDER SERVICE
const fs = require('fs').promises;
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const poPdfGenerator = require('../utils/pdf-generator-po.util');

const POS_FILE = path.join(__dirname, '../../data/purchases/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

class PurchaseService {
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
   * Get user name by user ID
   */
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
      return userId;
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
   * Create a new Purchase Order
   */
  async createPO(poData, userId, userRole) {
    const pos = await this.loadPOs();
    
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    
    const paddedCounter = String(newCounter).padStart(5, '0');
    const id = `PO-${paddedCounter}`;
    const poNumber = this.generatePONumber(newCounter);
    
    await this.saveCounter(newCounter);

    const today = new Date().toISOString().split('T')[0];
    const detectedLanguage = poData.forceLanguage || this.detectPOLanguage(poData);

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
      language: detectedLanguage,
      status: 'pending',
      createdBy: userId,
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    pos.push(newPO);
    await this.savePOs(pos);

    return newPO;
  }

  /**
   * Get all POs with filtering and pagination
   */
  async getAllPOs(filters = {}, userId, userRole) {
    let pos = await this.loadPOs();

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
        p.shipment.toLowerCase().includes(searchLower) ||
        p.notes.toLowerCase().includes(searchLower)
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

    return po;
  }

  /**
   * Update PO
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

    const detectedLanguage = updateData.forceLanguage || this.detectPOLanguage(po);
    po.language = detectedLanguage;

    po.updatedAt = new Date().toISOString();

    pos[poIndex] = po;
    await this.savePOs(pos);

    return po;
  }

  /**
   * Delete PO (super admin only)
   */
  async deletePO(id) {
    const pos = await this.loadPOs();
    const poIndex = pos.findIndex(p => p.id === id);

    if (poIndex === -1) {
      throw new Error('Purchase Order not found');
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
   * Generate PO PDF with optional attachment merge
   */
  async generatePOPDF(id, userId, userRole, attachmentPdf = null) {
    const po = await this.getPOById(id, userId, userRole);
    
    const pdfResult = await poPdfGenerator.generatePOPDF(po);
    
    let finalPdfResult = pdfResult;
    try {
      if (attachmentPdf) {
        const isValid = await poPdfGenerator.isValidPDF(attachmentPdf);
        if (!isValid) {
          throw new Error('Invalid PDF attachment');
        }
      }

      const mergeResult = await poPdfGenerator.mergePDFs(
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
    
    return {
      po,
      pdf: finalPdfResult
    };
  }
}

module.exports = new PurchaseService();