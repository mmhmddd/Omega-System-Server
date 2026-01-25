// ============================================================
// MATERIAL SERVICE - UPDATED TO MATCH RECEIPT SYSTEM
// src/services/material.service.js
// ============================================================
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const materialPdfGenerator = require('../utils/pdf-generator-material.util');

const MATERIALS_FILE = path.join(__dirname, '../../data/materials-requests/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');

class MaterialService {
  async loadMaterialRequests() {
    try {
      const data = await fs.readFile(MATERIALS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async saveMaterialRequests(materials) {
    await atomicWrite(MATERIALS_FILE, JSON.stringify(materials, null, 2));
  }

  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.IMR || 0;
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
      counters.IMR = counter;
      await atomicWrite(COUNTER_FILE, JSON.stringify(counters, null, 2));
    } catch (error) {
      throw error;
    }
  }

  generateMRNumber(counter) {
    const paddedNumber = String(counter).padStart(4, '0');
    return `IMR${paddedNumber}`;
  }

  detectLanguage(text) {
    if (!text) return 'en';
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  detectMaterialLanguage(materialData) {
    const fieldsToCheck = [
      materialData.section,
      materialData.project,
      materialData.requestReason,
      materialData.additionalNotes
    ];

    if (materialData.items && materialData.items.length > 0) {
      materialData.items.forEach(item => {
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
   * CREATE MATERIAL REQUEST (NO PDF GENERATION)
   */
  async createMaterialRequest(materialData, userId, userRole) {
    const materials = await this.loadMaterialRequests();
    
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    
    const paddedCounter = String(newCounter).padStart(4, '0');
    const id = `IMR-${paddedCounter}`;
    const mrNumber = this.generateMRNumber(newCounter);
    
    await this.saveCounter(newCounter);

    const today = new Date().toISOString().split('T')[0];
    const detectedLanguage = materialData.forceLanguage || this.detectMaterialLanguage(materialData);

    const newMaterialRequest = {
      id,
      mrNumber,
      date: materialData.date || today,
      section: materialData.section || '',
      project: materialData.project || '',
      requestPriority: materialData.requestPriority || '',
      requestReason: materialData.requestReason || '',
      items: materialData.items || [],
      additionalNotes: materialData.additionalNotes || '',
      language: detectedLanguage,
      status: 'pending',
      createdBy: userId,
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
      // NO PDF fields here - will be added when PDF is generated
    };

    materials.push(newMaterialRequest);
    await this.saveMaterialRequests(materials);

    return newMaterialRequest;
  }

  /**
   * UPDATE MATERIAL REQUEST (NO PDF GENERATION)
   */
  async updateMaterialRequest(id, updateData, userId, userRole) {
    const materials = await this.loadMaterialRequests();
    const materialIndex = materials.findIndex(m => m.id === id);

    if (materialIndex === -1) {
      throw new Error('Material Request not found');
    }

    const material = materials[materialIndex];

    if (userRole === 'employee' || userRole === 'admin') {
      if (material.createdBy !== userId) {
        throw new Error('Access denied: You can only edit your own Material Requests');
      }
    }

    // Update fields
    if (updateData.date) material.date = updateData.date;
    if (updateData.section !== undefined) material.section = updateData.section;
    if (updateData.project !== undefined) material.project = updateData.project;
    if (updateData.requestPriority !== undefined) material.requestPriority = updateData.requestPriority;
    if (updateData.requestReason !== undefined) material.requestReason = updateData.requestReason;
    if (updateData.items) material.items = updateData.items;
    if (updateData.additionalNotes !== undefined) material.additionalNotes = updateData.additionalNotes;
    if (updateData.status) material.status = updateData.status;

    const detectedLanguage = updateData.forceLanguage || this.detectMaterialLanguage(material);
    material.language = detectedLanguage;
    material.updatedAt = new Date().toISOString();

    materials[materialIndex] = material;
    await this.saveMaterialRequests(materials);

    return material;
  }

  /**
   * GENERATE MATERIAL REQUEST PDF (WITH OPTIONAL ATTACHMENT)
   * This is now called manually via the generate-pdf endpoint
   */
  async generateMaterialPDF(id, userId, userRole, attachmentPdf = null) {
    // Get material data
    const material = await this.getMaterialRequestById(id, userId, userRole);

    // Delete old PDF if exists
    if (material.pdfFilename) {
      const oldPdfPath = path.join(__dirname, '../../data/materials-requests/pdfs', material.pdfFilename);
      if (fsSync.existsSync(oldPdfPath)) {
        try {
          fsSync.unlinkSync(oldPdfPath);
          console.log('✓ Old PDF deleted');
        } catch (err) {
          console.log('Could not delete old PDF:', err.message);
        }
      }
    }

    // Generate the material PDF
    const pdfResult = await materialPdfGenerator.generateMaterialPDF(material);

    // Merge with attachment (or add headers/footers to single PDF)
    let finalPdfResult = pdfResult;
    try {
      if (attachmentPdf) {
        // Validate attachment
        const isValid = await materialPdfGenerator.isValidPDF(attachmentPdf);
        if (!isValid) {
          throw new Error('Invalid PDF attachment');
        }
      }

      // Merge PDFs (pass language from pdfResult)
      const mergeResult = await materialPdfGenerator.mergePDFs(
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

    // Update material record with PDF info
    const materials = await this.loadMaterialRequests();
    const materialIndex = materials.findIndex(m => m.id === id);

    if (materialIndex !== -1) {
      materials[materialIndex].pdfFilename = finalPdfResult.filename;
      materials[materialIndex].pdfLanguage = finalPdfResult.language;
      materials[materialIndex].pdfGeneratedAt = new Date().toISOString();
      materials[materialIndex].pdfMerged = finalPdfResult.merged || false;
      if (finalPdfResult.pageCount) {
        materials[materialIndex].pdfPageCount = finalPdfResult.pageCount;
      }
      await this.saveMaterialRequests(materials);
    }

    return {
      material,
      pdf: finalPdfResult
    };
  }

  /**
   * GET ALL MATERIAL REQUESTS
   */
  async getAllMaterialRequests(filters = {}, userId, userRole) {
    let materials = await this.loadMaterialRequests();

    if (userRole === 'employee' || userRole === 'admin') {
      materials = materials.filter(m => m.createdBy === userId);
    }

    if (filters.mrNumber) {
      materials = materials.filter(m => 
        m.mrNumber.toLowerCase().includes(filters.mrNumber.toLowerCase())
      );
    }

    if (filters.startDate) materials = materials.filter(m => m.date >= filters.startDate);
    if (filters.endDate) materials = materials.filter(m => m.date <= filters.endDate);
    if (filters.section) materials = materials.filter(m => m.section.toLowerCase().includes(filters.section.toLowerCase()));
    if (filters.project) materials = materials.filter(m => m.project.toLowerCase().includes(filters.project.toLowerCase()));
    if (filters.priority) materials = materials.filter(m => m.requestPriority === filters.priority);
    if (filters.status) materials = materials.filter(m => m.status === filters.status);

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      materials = materials.filter(m =>
        m.mrNumber.toLowerCase().includes(searchLower) ||
        m.section.toLowerCase().includes(searchLower) ||
        m.project.toLowerCase().includes(searchLower) ||
        m.requestReason.toLowerCase().includes(searchLower)
      );
    }

    materials.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedMaterials = materials.slice(startIndex, endIndex);

    return {
      materials: paginatedMaterials,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(materials.length / limit),
        totalMaterials: materials.length,
        limit
      }
    };
  }

  /**
   * GET MATERIAL REQUEST BY ID
   */
  async getMaterialRequestById(id, userId, userRole) {
    const materials = await this.loadMaterialRequests();
    const material = materials.find(m => m.id === id);

    if (!material) throw new Error('Material Request not found');

    if (userRole === 'employee' || userRole === 'admin') {
      if (material.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own Material Requests');
      }
    }

    return material;
  }

  /**
   * DELETE MATERIAL REQUEST
   */
  async deleteMaterialRequest(id) {
    const materials = await this.loadMaterialRequests();
    const materialIndex = materials.findIndex(m => m.id === id);

    if (materialIndex === -1) throw new Error('Material Request not found');

    const material = materials[materialIndex];
    
    // Delete PDF if exists
    if (material.pdfFilename) {
      const pdfPath = path.join(__dirname, '../../data/materials-requests/pdfs', material.pdfFilename);
      if (fsSync.existsSync(pdfPath)) {
        try {
          fsSync.unlinkSync(pdfPath);
        } catch (err) {
          console.log('Could not delete PDF:', err.message);
        }
      }
    }

    materials.splice(materialIndex, 1);
    await this.saveMaterialRequests(materials);

    return { message: 'Material Request deleted successfully' };
  }

  /**
   * GET MATERIAL STATS
   */
  async getMaterialStats(userId, userRole) {
    let materials = await this.loadMaterialRequests();

    if (userRole === 'employee' || userRole === 'admin') {
      materials = materials.filter(m => m.createdBy === userId);
    }

    const stats = {
      totalMaterials: materials.length,
      pending: materials.filter(m => m.status === 'pending').length,
      approved: materials.filter(m => m.status === 'approved').length,
      rejected: materials.filter(m => m.status === 'rejected').length,
      thisMonth: 0,
      thisWeek: 0,
      today: 0
    };

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfDay = new Date(now.setHours(0, 0, 0, 0));

    materials.forEach(material => {
      const materialDate = new Date(material.createdAt);
      if (materialDate >= startOfMonth) stats.thisMonth++;
      if (materialDate >= startOfWeek) stats.thisWeek++;
      if (materialDate >= startOfDay) stats.today++;
    });

    return stats;
  }

  /**
   * RESET MATERIAL COUNTER
   */
  async resetMaterialCounter() {
    const oldCounter = await this.loadCounter();
    const materials = await this.loadMaterialRequests();
    const deletedCount = materials.length;
    
    // Delete all PDF files
    const pdfDir = path.join(__dirname, '../../data/materials-requests/pdfs');
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
    await this.saveMaterialRequests([]);

    return {
      oldCounter,
      newCounter: 0,
      deletedMaterials: deletedCount,
      nextIMRNumber: this.generateMRNumber(1),
      message: `Counter reset to 0 and ${deletedCount} Material Request(s) deleted`
    };
  }
}

module.exports = new MaterialService();