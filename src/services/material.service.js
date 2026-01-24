// src/services/material.service.js - MATERIAL REQUEST SERVICE
const fs = require('fs').promises;
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const materialPdfGenerator = require('../utils/pdf-generator-material.util');

const MATERIALS_FILE = path.join(__dirname, '../../data/materials-requests/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

class MaterialService {
  /**
   * Load Material Requests from JSON file
   */
  async loadMaterialRequests() {
    try {
      const data = await fs.readFile(MATERIALS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Save Material Requests to JSON file
   */
  async saveMaterialRequests(materials) {
    await atomicWrite(MATERIALS_FILE, JSON.stringify(materials, null, 2));
  }

  /**
   * Load counter from counters.json file
   */
  async loadCounter() {
    try {
      const data = await fs.readFile(COUNTER_FILE, 'utf8');
      const counters = JSON.parse(data);
      return counters.IMR || 0;
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
      
      counters.IMR = counter;
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
   * Generate IMR number from counter (IMR0001, IMR0002, etc.)
   */
  generateMRNumber(counter) {
    const paddedNumber = String(counter).padStart(4, '0');
    return `IMR${paddedNumber}`;
  }

  /**
   * Reset Material Request counter to 0 AND delete all Material Requests (super admin only)
   */
  async resetMaterialCounter() {
    const oldCounter = await this.loadCounter();
    const materials = await this.loadMaterialRequests();
    const deletedCount = materials.length;
    
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

  /**
   * Detect language from text (Arabic or English)
   */
  detectLanguage(text) {
    if (!text) return 'en';
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text) ? 'ar' : 'en';
  }

  /**
   * Detect primary language from Material Request data
   */
  detectMaterialLanguage(materialData) {
    const fieldsToCheck = [
      materialData.section,
      materialData.project,
      materialData.requestReason,
      materialData.additionalNotes
    ];

    if (materialData.items && materialData.items.length > 0) {
      materialData.items.forEach(item => {
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
   * Create a new Material Request
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
    };

    materials.push(newMaterialRequest);
    await this.saveMaterialRequests(materials);

    return newMaterialRequest;
  }

  /**
   * Get all Material Requests with filtering and pagination
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

    if (filters.startDate) {
      materials = materials.filter(m => m.date >= filters.startDate);
    }
    if (filters.endDate) {
      materials = materials.filter(m => m.date <= filters.endDate);
    }

    if (filters.section) {
      materials = materials.filter(m => 
        m.section.toLowerCase().includes(filters.section.toLowerCase())
      );
    }

    if (filters.project) {
      materials = materials.filter(m => 
        m.project.toLowerCase().includes(filters.project.toLowerCase())
      );
    }

    if (filters.priority) {
      materials = materials.filter(m => m.requestPriority === filters.priority);
    }

    if (filters.status) {
      materials = materials.filter(m => m.status === filters.status);
    }

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
   * Get Material Request by ID
   */
  async getMaterialRequestById(id, userId, userRole) {
    const materials = await this.loadMaterialRequests();
    const material = materials.find(m => m.id === id);

    if (!material) {
      throw new Error('Material Request not found');
    }

    if (userRole === 'employee' || userRole === 'admin') {
      if (material.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own Material Requests');
      }
    }

    return material;
  }

  /**
   * Update Material Request
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
   * Delete Material Request (super admin only)
   */
  async deleteMaterialRequest(id) {
    const materials = await this.loadMaterialRequests();
    const materialIndex = materials.findIndex(m => m.id === id);

    if (materialIndex === -1) {
      throw new Error('Material Request not found');
    }

    materials.splice(materialIndex, 1);
    await this.saveMaterialRequests(materials);

    return { message: 'Material Request deleted successfully' };
  }

  /**
   * Get Material Request statistics
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
   * Generate Material Request PDF
   */
  async generateMaterialPDF(id, userId, userRole) {
    const material = await this.getMaterialRequestById(id, userId, userRole);
    
    const pdfResult = await materialPdfGenerator.generateMaterialPDF(material);
    
    const materials = await this.loadMaterialRequests();
    const materialIndex = materials.findIndex(m => m.id === id);
    
    if (materialIndex !== -1) {
      materials[materialIndex].pdfFilename = pdfResult.filename;
      materials[materialIndex].pdfLanguage = pdfResult.language;
      materials[materialIndex].pdfGeneratedAt = new Date().toISOString();
      await this.saveMaterialRequests(materials);
    }
    
    return {
      material,
      pdf: pdfResult
    };
  }
}

module.exports = new MaterialService();