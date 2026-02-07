// src/services/material.service.js - WITH FILE MANAGEMENT INTEGRATION AND CUSTOM FILENAME
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');
const materialPdfGenerator = require('../utils/pdf-generator-material.util');
const nodemailer = require('nodemailer');
const MATERIALS_FILE = path.join(__dirname, '../../data/materials-requests/index.json');
const COUNTER_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');
const STATIC_PDF_PATH = path.join(__dirname, '../../data/Terms And Conditions/terms-and-conditions.pdf');

// ✅ Email configuration with proper credential checks
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// ✅ Log configuration on startup (without exposing password)
console.log('📧 Material Email Configuration:');
console.log('  - Host:', EMAIL_HOST);
console.log('  - Port:', EMAIL_PORT);
console.log('  - User:', EMAIL_USER ? '✅ Configured' : '❌ Missing');
console.log('  - Password:', EMAIL_PASS ? '✅ Configured' : '❌ Missing');
console.log('  - From:', EMAIL_FROM);

class MaterialService {
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
      
      let user = users.find(u => u.id === userId);
      
      if (!user && typeof userId !== 'string') {
        const userIdStr = String(userId);
        console.log('Trying string conversion:', userIdStr);
        user = users.find(u => u.id === userIdStr);
      }
      
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
    return `MR${paddedNumber}`;
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

  async enrichMaterialsWithCreatorNames(materials) {
    const users = await this.loadUsers();
    
    return Promise.all(materials.map(async material => {
      const user = users.find(u => u.id === material.createdBy);
      
      if (user && user.name) {
        return {
          ...material,
          createdByName: user.name
        };
      } else {
        return {
          ...material,
          createdByName: 'Unknown User'
        };
      }
    }));
  }

  async createMaterialRequest(materialData, userId, userRole) {
    console.log('\n=== CREATE MATERIAL REQUEST DEBUG ===');
    console.log('userId:', userId);
    console.log('userId type:', typeof userId);
    console.log('userRole:', userRole);
    console.log('Include Terms & Conditions PDF:', materialData.includeStaticFile);
    
    const materials = await this.loadMaterialRequests();
    
    const counter = await this.loadCounter();
    const newCounter = counter + 1;
    
    const paddedCounter = String(newCounter).padStart(4, '0');
    const id = `MR-${paddedCounter}`;
    const mrNumber = this.generateMRNumber(newCounter);
    
    await this.saveCounter(newCounter);

    const today = new Date().toISOString().split('T')[0];
    const detectedLanguage = materialData.forceLanguage || this.detectMaterialLanguage(materialData);

    console.log('Calling getUserNameById with:', userId);
    const createdByName = await this.getUserNameById(userId);
    console.log('getUserNameById returned:', createdByName);
    console.log('createdByName is null?', createdByName === null);
    console.log('createdByName is undefined?', createdByName === undefined);
    console.log('============================\n');

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
      includeStaticFile: materialData.includeStaticFile || false,
      language: detectedLanguage,
      status: 'pending',
      createdBy: userId,
      createdByName: createdByName || 'Unknown User',
      createdByRole: userRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    materials.push(newMaterialRequest);
    await this.saveMaterialRequests(materials);

    console.log('Material Request created with name:', newMaterialRequest.createdByName);
    console.log('Include Terms & Conditions:', newMaterialRequest.includeStaticFile);
    return newMaterialRequest;
  }

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
    if (updateData.includeStaticFile !== undefined) material.includeStaticFile = updateData.includeStaticFile;

    const detectedLanguage = updateData.forceLanguage || this.detectMaterialLanguage(material);
    material.language = detectedLanguage;
    material.updatedAt = new Date().toISOString();

    materials[materialIndex] = material;
    await this.saveMaterialRequests(materials);

    const createdByName = await this.getUserNameById(material.createdBy);

    return {
      ...material,
      createdByName: createdByName || material.createdByName || 'Unknown User'
    };
  }

  /**
   * ✅ GENERATE MATERIAL PDF WITH CUSTOM FILENAME PATTERN: MR0001_ProjectName_DD-MM-YYYY.pdf
   */
  async generateMaterialPDF(id, userId, userRole, attachmentPdf = null) {
    const material = await this.getMaterialRequestById(id, userId, userRole);

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║       GENERATING MATERIAL REQUEST PDF                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('📄 MR Number:', material.mrNumber);
    console.log('📎 Include Terms & Conditions:', material.includeStaticFile);
    console.log('📎 User Attachment:', attachmentPdf ? 'Yes' : 'No');
    console.log('════════════════════════════════════════════════════════════');

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

    // ✅ Create filename pattern: MR0001_ProjectName_DD-MM-YYYY.pdf
    const sanitizeFilename = (str) => {
      if (!str) return 'Unknown';
      // Remove special characters, keep alphanumeric, Arabic characters, and spaces
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
    
    const mrNumber = material.mrNumber || 'MR0000';
    const projectName = sanitizeFilename(material.project); // ✅ Changed from section to project
    const dateFormatted = formatDate(material.date);
    const customFilename = `${mrNumber}_${projectName}_${dateFormatted}`;

    console.log('📝 Custom filename:', customFilename);

    const pdfResult = await materialPdfGenerator.generateMaterialPDF(material, customFilename);

    const pdfsToMerge = [];
    
    if (attachmentPdf) {
      const isValid = await materialPdfGenerator.isValidPDF(attachmentPdf);
      if (isValid) {
        pdfsToMerge.push(attachmentPdf);
        console.log('✅ Added user attachment PDF to merge list');
      } else {
        console.warn('⚠️ Invalid user attachment PDF, skipping');
      }
    }
    
    if (material.includeStaticFile === true) {
      try {
        if (fsSync.existsSync(STATIC_PDF_PATH)) {
          const staticPdfBytes = fsSync.readFileSync(STATIC_PDF_PATH);
          pdfsToMerge.push(staticPdfBytes);
          console.log('✅ Added Terms & Conditions PDF to merge list');
        } else {
          console.warn('⚠️ Terms & Conditions PDF not found at:', STATIC_PDF_PATH);
        }
      } catch (error) {
        console.error('❌ Error reading Terms & Conditions PDF:', error.message);
      }
    }

    let finalPdfResult = pdfResult;
    try {
      if (pdfsToMerge.length > 0) {
        console.log(`🔄 Merging ${pdfsToMerge.length} additional PDF(s) with Material Request...`);
        
        let currentPath = pdfResult.filepath;
        
        for (let i = 0; i < pdfsToMerge.length; i++) {
          console.log(`   Merging PDF ${i + 1} of ${pdfsToMerge.length}...`);
          const mergeResult = await materialPdfGenerator.mergePDFs(
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
        console.log('   Total pages:', finalPdfResult.pageCount.total);
      } else {
        console.log('ℹ️  No additional PDFs to merge, adding headers/footers only...');
        const headerResult = await materialPdfGenerator.mergePDFs(
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

    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ PDF generation complete!');
    console.log('════════════════════════════════════════════════════════════\n');

    return {
      material,
      pdf: finalPdfResult
    };
  }

  async getAllMaterialRequests(filters = {}, userId, userRole) {
    let materials = await this.loadMaterialRequests();

    materials = await this.enrichMaterialsWithCreatorNames(materials);

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
        m.requestReason.toLowerCase().includes(searchLower) ||
        (m.createdByName && m.createdByName.toLowerCase().includes(searchLower))
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

  async getMaterialRequestById(id, userId, userRole) {
    const materials = await this.loadMaterialRequests();
    const material = materials.find(m => m.id === id);

    if (!material) throw new Error('Material Request not found');

    if (userRole === 'employee' || userRole === 'admin') {
      if (material.createdBy !== userId) {
        throw new Error('Access denied: You can only view your own Material Requests');
      }
    }

    const createdByName = await this.getUserNameById(material.createdBy);

    return {
      ...material,
      createdByName: createdByName || material.createdByName || 'Unknown User'
    };
  }

  /**
   * ✅ DELETE MATERIAL REQUEST - WITH FILE MANAGEMENT INTEGRATION (like price-quote)
   */
  async deleteMaterialRequest(id) {
    const materials = await this.loadMaterialRequests();
    const materialIndex = materials.findIndex(m => m.id === id);

    if (materialIndex === -1) throw new Error('Material Request not found');

    const material = materials[materialIndex];
    
    // ✅ DELETE FROM FILE MANAGEMENT (like price-quote)
    if (material.pdfFilename) {
      const fileManagementService = require('./File-management.service');
      try {
        await fileManagementService.deleteFileByFilename(material.pdfFilename);
        console.log('✅ Material: File removed from File Management');
      } catch (error) {
        console.log('⚠️ Material: File Management deletion warning:', error.message);
      }
      
      // Delete physical PDF file
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

  async resetMaterialCounter() {
    const oldCounter = await this.loadCounter();
    const materials = await this.loadMaterialRequests();
    const deletedCount = materials.length;
    
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

  /**
 * ✅ Send material request PDF by email - WITH CUSTOM FILENAME DD-MM-YYYY and Project Name
 */
async sendMaterialByEmail(materialId, userId, userRole, recipientEmail) {
  try {
    console.log('\n📧 === SEND MATERIAL EMAIL DEBUG ===');
    console.log('Material ID:', materialId);
    console.log('User ID:', userId);
    console.log('Recipient:', recipientEmail);
    
    if (!EMAIL_USER || !EMAIL_PASS) {
      console.error('❌ Email credentials missing!');
      throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
    }

    const material = await this.getMaterialRequestById(materialId, userId, userRole);
    console.log('✅ Material Request found:', material.mrNumber);

    if (!material.pdfFilename) {
      throw new Error('PDF not generated yet. Please generate PDF first.');
    }

    const pdfPath = path.join(__dirname, '../../data/materials-requests/pdfs', material.pdfFilename);

    if (!fsSync.existsSync(pdfPath)) {
      throw new Error('PDF file not found');
    }
    console.log('✅ PDF file found');

    const users = await this.loadUsers();
    const creator = users.find(u => u.id === material.createdBy);
    
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

    const subject = `Material Request ${material.mrNumber}`;
    const text = `Please find attached the Material Request ${material.mrNumber}.\n\nSection: ${material.section || 'N/A'}\nProject: ${material.project || 'N/A'}\nDate: ${material.date}\nPriority: ${material.requestPriority || 'N/A'}\n\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
          <h2 style="margin: 0; font-size: 24px;">Material Request ${material.mrNumber}</h2>
        </div>
        <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 10px 10px;">
          <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">Please find attached the material request document.</p>
          <table style="border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <tr style="background: #f8fafc;">
              <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">MR Number:</td>
              <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1565C0; font-weight: 600;">${material.mrNumber}</td>
            </tr>
            <tr style="background: #f8fafc;">
              <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Date:</td>
              <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${material.date}</td>
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

    // ✅ Create custom email attachment filename: MR0001_ProjectName_DD-MM-YYYY.pdf
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
    
    const mrNumber = material.mrNumber || 'MR0000';
    const projectName = sanitizeFilename(material.project); // ✅ Changed from section to project
    const dateFormatted = formatDate(material.date);
    const emailAttachmentName = `${mrNumber}_${projectName}_${dateFormatted}.pdf`;

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

module.exports = new MaterialService();