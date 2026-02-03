// src/services/file-management.service.js - ENHANCED WITH DELETE BY FILENAME METHOD
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class FileManagementService {
  constructor() {
    // Define all directories to scan
    this.directories = {
      cuttingJobs: path.join(__dirname, '../../data/cutting-jobs'),
      quotations: path.join(__dirname, '../../data/quotations/pdfs'),
      quotationsAttachmentsAR: path.join(__dirname, '../../data/quotations/AR-Uploads'),
      quotationsAttachmentsEN: path.join(__dirname, '../../data/quotations/EN-Uploads'),
      receipts: path.join(__dirname, '../../data/receipts/pdfs'),
      secretariatForms: path.join(__dirname, '../../data/secretariat-forms/pdfs'),
      secretariatUserForms: path.join(__dirname, '../../data/secretariat-forms/user-pdfs'),
      rfqs: path.join(__dirname, '../../data/rfqs/pdfs'),
      purchases: path.join(__dirname, '../../data/purchases/pdfs'),
      materials: path.join(__dirname, '../../data/materials-requests/pdfs'),
      filesPhysical: path.join(__dirname, '../../data/files/physical'),
      emptyReceipts: path.join(__dirname, '../../data/empty-receipts/pdfs'),
      proformaInvoices: path.join(__dirname, '../../data/proforma-invoices/pdfs'),
      costingSheets: path.join(__dirname, '../../data/costing-sheets/pdfs')
    };

    // Metadata files
    this.metadataFiles = {
      cuttingJobs: path.join(__dirname, '../../data/cutting-jobs/index.json'),
      quotations: path.join(__dirname, '../../data/quotations/index.json'),
      receipts: path.join(__dirname, '../../data/receipts/index.json'),
      secretariatForms: path.join(__dirname, '../../data/secretariat-forms/index.json'),
      secretariatUserForms: path.join(__dirname, '../../data/secretariat-forms/user-forms.json'),
      rfqs: path.join(__dirname, '../../data/rfqs/index.json'),
      purchases: path.join(__dirname, '../../data/purchases/index.json'),
      materials: path.join(__dirname, '../../data/materials-requests/index.json'),
      items: path.join(__dirname, '../../data/items/index.json'),
      suppliers: path.join(__dirname, '../../data/suppliers/index.json'),
      users: path.join(__dirname, '../../data/users/users.json'),
      files: path.join(__dirname, '../../data/files/index.json'),
      emptyReceipts: path.join(__dirname, '../../data/empty-receipts/index.json'),
      proformaInvoices: path.join(__dirname, '../../data/proforma-invoices/index.json'),
      costingSheets: path.join(__dirname, '../../data/costing-sheets/index.json')
    };

    // Cache for users data
    this.usersCache = null;
  }

  /**
   * ✅ NEW METHOD: Delete file by filename from file management system
   * This method is called by individual module services when they delete documents
   */
  async deleteFileByFilename(filename) {
    try {
      console.log(`🔍 File Management: Searching for file "${filename}" to delete...`);
      
      // Get all files
      const { files } = await this.getAllFiles({ limit: 999999 });
      
      // Find the file by name
      const fileIndex = files.findIndex(f => f.name === filename);
      
      if (fileIndex === -1) {
        console.log(`⚠️  File Management: File "${filename}" not found in file management system`);
        return { success: false, message: 'File not found in file management' };
      }
      
      const file = files[fileIndex];
      
      // Update the corresponding metadata file
      await this.updateMetadataAfterDelete(file);
      
      console.log(`✅ File Management: File "${filename}" deleted successfully`);
      return { success: true, message: 'File deleted from file management' };
      
    } catch (error) {
      console.error(`❌ File Management: Error deleting file "${filename}":`, error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Load users data and cache it
   */
  async loadUsers() {
    if (this.usersCache) {
      return this.usersCache;
    }

    try {
      const usersPath = this.metadataFiles.users;
      if (!fsSync.existsSync(usersPath)) {
        return [];
      }
      const data = await fs.readFile(usersPath, 'utf8');
      const parsed = JSON.parse(data);
      this.usersCache = Array.isArray(parsed) ? parsed : [];
      return this.usersCache;
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  }

  /**
   * Get user name from username
   */
  async getUserNameFromUsername(username) {
    if (!username) return 'غير معروف';

    const users = await this.loadUsers();
    const user = users.find(u => u.username === username);

    if (user && user.name) {
      return user.name;
    }

    return username;
  }

  /**
   * Get file type category based on extension
   */
  getFileCategory(filename) {
    const ext = path.extname(filename).toLowerCase();
    
    const categories = {
      pdf: ['pdf'],
      cad: ['dwg', 'dxf', 'dwt'],
      cnc: ['nc', 'txt'],
      image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
      document: ['doc', 'docx', 'xls', 'xlsx'],
      other: []
    };

    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext.replace('.', ''))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Get file icon based on type
   */
  getFileIcon(filename) {
    const ext = path.extname(filename).toLowerCase();
    const icons = {
      '.pdf': '📄',
      '.dwg': '📐',
      '.dxf': '📐',
      '.dwt': '📐',
      '.nc': '⚙️',
      '.txt': '📝',
      '.jpg': '🖼️',
      '.jpeg': '🖼️',
      '.png': '🖼️',
      '.webp': '🖼️',
      '.doc': '📃',
      '.docx': '📃',
      '.xls': '📊',
      '.xlsx': '📊'
    };

    return icons[ext] || '📎';
  }

  /**
   * Load metadata from JSON file
   */
  async loadMetadata(metadataPath) {
    try {
      if (!fsSync.existsSync(metadataPath)) {
        return [];
      }
      const data = await fs.readFile(metadataPath, 'utf8');
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(`Error loading metadata from ${metadataPath}:`, error);
      return [];
    }
  }

  /**
   * Get file metadata from record with database ID
   */
  async getFileMetadataFromRecord(record, type) {
    const username = record.createdBy || record.uploadedBy || 'Unknown';
    const userRealName = await this.getUserNameFromUsername(username);

    const metadata = {
      createdBy: username,
      createdByName: userRealName,
      createdByRole: record.createdByRole || 'Unknown',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      databaseId: record._id || record.id || null
    };

    // Add type-specific information
    switch (type) {
      case 'cuttingJobs':
        metadata.documentNumber = record.id;
        metadata.projectName = record.projectName;
        metadata.fileStatus = record.fileStatus;
        break;
      case 'quotations':
        metadata.documentNumber = record.quoteNumber;
        metadata.clientName = record.clientName;
        break;
      case 'quotationsAttachmentsAR':
      case 'quotationsAttachmentsEN':
        metadata.documentNumber = record.quoteNumber || 'N/A';
        metadata.clientName = record.clientName;
        metadata.attachmentType = type === 'quotationsAttachmentsAR' ? 'Arabic' : 'English';
        break;
      case 'receipts':
        metadata.documentNumber = record.receiptNumber;
        metadata.recipientName = record.to;
        break;
      case 'secretariatForms':
      case 'secretariatUserForms':
        metadata.documentNumber = record.formNumber;
        metadata.employeeName = record.employeeName;
        metadata.formType = record.formType;
        break;
      case 'rfqs':
        metadata.documentNumber = record.rfqNumber;
        metadata.supplier = record.supplier;
        break;
      case 'purchases':
        metadata.documentNumber = record.poNumber;
        metadata.supplier = record.supplier;
        break;
      case 'materials':
        metadata.documentNumber = record.requestNumber;
        metadata.requester = record.requester;
        break;
      case 'filesPhysical':
        metadata.documentNumber = record.fileId || record.id;
        metadata.description = record.description;
        break;
      case 'emptyReceipts':
        metadata.documentNumber = record.receiptNumber || 'N/A';
        metadata.recipientName = record.to || 'N/A';
        metadata.notes = record.notes;
        break;
      case 'proformaInvoices':
        metadata.documentNumber = record.invoiceNumber;
        metadata.projectName = record.projectName;
        metadata.clientName = record.clientName;
        break;
      case 'costingSheets':
        metadata.documentNumber = record.csNumber;
        metadata.projectName = record.project;
        metadata.clientName = record.client;
        break;
    }

    return metadata;
  }

  /**
   * Scan directory with database IDs
   */
  async scanDirectory(dirPath, type, metadata) {
    const files = [];

    try {
      if (!fsSync.existsSync(dirPath)) {
        return files;
      }

      // For cutting jobs, scan subdirectories
      if (type === 'cuttingJobs') {
        const statusFolders = ['pending', 'in-progress', 'completed', 'partial'];
        
        for (const folder of statusFolders) {
          const folderPath = path.join(dirPath, folder);
          if (fsSync.existsSync(folderPath)) {
            const folderFiles = await fs.readdir(folderPath);
            
            for (const filename of folderFiles) {
              const filePath = path.join(folderPath, filename);
              const stats = await fs.stat(filePath);

              if (stats.isFile()) {
                const record = metadata.find(m => m.fileName === filename);
                const fileMetadata = await this.getFileMetadataFromRecord(record || {}, type);

                files.push({
                  id: `${type}-${folder}-${filename}`,
                  name: filename,
                  path: filePath,
                  relativePath: path.join('cutting-jobs', folder, filename),
                  type,
                  category: this.getFileCategory(filename),
                  extension: path.extname(filename).toLowerCase(),
                  icon: this.getFileIcon(filename),
                  size: stats.size,
                  sizeFormatted: this.formatFileSize(stats.size),
                  createdAt: record?.createdAt || stats.birthtime.toISOString(),
                  modifiedAt: stats.mtime.toISOString(),
                  ...fileMetadata,
                  subFolder: folder
                });
              }
            }
          }
        }
      } else {
        // Regular directory scan
        const dirFiles = await fs.readdir(dirPath);

        for (const filename of dirFiles) {
          const filePath = path.join(dirPath, filename);
          const stats = await fs.stat(filePath);

          if (stats.isFile()) {
            // Find associated metadata
            const record = metadata.find(m => {
              if (type === 'quotations') {
                return m.pdfPath && m.pdfPath.includes(filename);
              } else if (type === 'quotationsAttachmentsAR' || type === 'quotationsAttachmentsEN') {
                return m.attachments && m.attachments.some(att => att.includes(filename));
              } else if (type === 'receipts') {
                return m.pdfFilename === filename;
              } else if (type === 'secretariatForms' || type === 'secretariatUserForms') {
                return m.pdfPath && m.pdfPath.includes(filename);
              } else if (type === 'rfqs') {
                return m.pdfFilename === filename;
              } else if (type === 'purchases') {
                return m.pdfFilename === filename;
              } else if (type === 'materials') {
                return m.pdfFilename === filename;
              } else if (type === 'filesPhysical') {
                return m.filePath && m.filePath.includes(filename);
              } else if (type === 'emptyReceipts') {
                return m.pdfFilename === filename;
              } else if (type === 'proformaInvoices') {
                return m.pdfFilename === filename;
              } else if (type === 'costingSheets') {
                return m.pdfFilename === filename;
              }
              return false;
            });

            const fileMetadata = await this.getFileMetadataFromRecord(record || {}, type);

            files.push({
              id: `${type}-${filename}`,
              name: filename,
              path: filePath,
              relativePath: path.relative(path.join(__dirname, '../../'), filePath),
              type,
              category: this.getFileCategory(filename),
              extension: path.extname(filename).toLowerCase(),
              icon: this.getFileIcon(filename),
              size: stats.size,
              sizeFormatted: this.formatFileSize(stats.size),
              createdAt: record?.createdAt || stats.birthtime.toISOString(),
              modifiedAt: stats.mtime.toISOString(),
              ...fileMetadata
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * Format file size to human-readable format
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Get all files from all directories
   */
  async getAllFiles(filters = {}) {
    let allFiles = [];

    // Load all metadata
    const metadataPromises = Object.entries(this.metadataFiles).map(async ([key, path]) => {
      return { key, data: await this.loadMetadata(path) };
    });

    const metadataResults = await Promise.all(metadataPromises);
    const metadataMap = {};
    metadataResults.forEach(({ key, data }) => {
      metadataMap[key] = data;
    });

    // Scan all directories
    const scanPromises = Object.entries(this.directories).map(async ([type, dirPath]) => {
      return await this.scanDirectory(dirPath, type, metadataMap[type] || []);
    });

    const results = await Promise.all(scanPromises);
    allFiles = results.flat();

    // Apply filters
    if (filters.type) {
      allFiles = allFiles.filter(f => f.type === filters.type);
    }

    if (filters.category) {
      allFiles = allFiles.filter(f => f.category === filters.category);
    }

    if (filters.extension) {
      allFiles = allFiles.filter(f => f.extension === filters.extension.toLowerCase());
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      allFiles = allFiles.filter(f =>
        f.name.toLowerCase().includes(searchLower) ||
        (f.documentNumber && f.documentNumber.toLowerCase().includes(searchLower)) ||
        (f.projectName && f.projectName.toLowerCase().includes(searchLower)) ||
        (f.clientName && f.clientName.toLowerCase().includes(searchLower)) ||
        (f.supplier && f.supplier.toLowerCase().includes(searchLower)) ||
        (f.requester && f.requester.toLowerCase().includes(searchLower)) ||
        (f.createdByName && f.createdByName.toLowerCase().includes(searchLower))
      );
    }

    if (filters.createdBy) {
      allFiles = allFiles.filter(f => f.createdBy === filters.createdBy);
    }

    if (filters.startDate) {
      allFiles = allFiles.filter(f => 
        new Date(f.createdAt) >= new Date(filters.startDate)
      );
    }

    if (filters.endDate) {
      allFiles = allFiles.filter(f => 
        new Date(f.createdAt) <= new Date(filters.endDate)
      );
    }

    // Sort files
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';

    allFiles.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      if (sortBy === 'size') {
        aVal = a.size;
        bVal = b.size;
      } else if (sortBy === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortBy === 'createdAt' || sortBy === 'modifiedAt') {
        aVal = new Date(aVal);
        bVal = new Date(bVal);
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Pagination
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedFiles = allFiles.slice(startIndex, endIndex);

    return {
      files: paginatedFiles,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(allFiles.length / limit),
        totalFiles: allFiles.length,
        limit
      }
    };
  }

  /**
   * Get file statistics
   */
  async getFileStatistics() {
    const { files } = await this.getAllFiles({ limit: 999999 });

    const stats = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      totalSizeFormatted: '',
      byType: {},
      byCategory: {},
      byExtension: {},
      byCreator: {},
      recentFiles: files.slice(0, 10)
    };

    stats.totalSizeFormatted = this.formatFileSize(stats.totalSize);

    // Group by type
    files.forEach(file => {
      stats.byType[file.type] = (stats.byType[file.type] || 0) + 1;
      stats.byCategory[file.category] = (stats.byCategory[file.category] || 0) + 1;
      stats.byExtension[file.extension] = (stats.byExtension[file.extension] || 0) + 1;
      
      if (file.createdByName) {
        stats.byCreator[file.createdByName] = (stats.byCreator[file.createdByName] || 0) + 1;
      }
    });

    return stats;
  }

  /**
   * Get file by ID
   */
  async getFileById(fileId) {
    const { files } = await this.getAllFiles({ limit: 999999 });
    const file = files.find(f => f.id === fileId);

    if (!file) {
      throw new Error('File not found');
    }

    return file;
  }

  /**
   * Delete file with proper database ID handling
   */
  async deleteFile(fileId) {
    const file = await this.getFileById(fileId);

    // Delete the physical file
    await fs.unlink(file.path);

    // Update metadata by removing the record
    await this.updateMetadataAfterDelete(file);

    return { message: 'File deleted successfully', file };
  }

  /**
   * Update metadata after file deletion using database ID
   */
  async updateMetadataAfterDelete(file) {
    try {
      const metadataPath = this.metadataFiles[file.type];
      if (!metadataPath || !fsSync.existsSync(metadataPath)) {
        return;
      }

      const metadata = await this.loadMetadata(metadataPath);
      
      // Filter using database ID if available, otherwise use filename
      let updatedMetadata;
      
      if (file.databaseId) {
        // Use database ID for deletion (most reliable)
        updatedMetadata = metadata.filter(record => {
          const recordId = record._id || record.id;
          return recordId !== file.databaseId;
        });
      } else {
        // Fallback to filename matching
        updatedMetadata = metadata.filter(record => {
          if (file.type === 'quotations') {
            return !(record.pdfPath && record.pdfPath.includes(file.name));
          } else if (file.type === 'receipts') {
            return record.pdfFilename !== file.name;
          } else if (file.type === 'secretariatForms' || file.type === 'secretariatUserForms') {
            return !(record.pdfPath && record.pdfPath.includes(file.name));
          } else if (file.type === 'rfqs') {
            return record.pdfFilename !== file.name;
          } else if (file.type === 'purchases') {
            return record.pdfFilename !== file.name;
          } else if (file.type === 'materials') {
            return record.pdfFilename !== file.name;
          } else if (file.type === 'cuttingJobs') {
            return record.fileName !== file.name;
          } else if (file.type === 'emptyReceipts') {
            return record.pdfFilename !== file.name;
          } else if (file.type === 'proformaInvoices') {
            return record.pdfFilename !== file.name;
          } else if (file.type === 'costingSheets') {
            return record.pdfFilename !== file.name;
          }
          return true;
        });
      }

      // Write updated metadata back
      await fs.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2), 'utf8');
    } catch (error) {
      console.error(`Error updating metadata after deletion:`, error);
    }
  }

  /**
   * Get file content for download
   */
  async getFileForDownload(fileId) {
    const file = await this.getFileById(fileId);

    if (!fsSync.existsSync(file.path)) {
      throw new Error('File not found on disk');
    }

    return {
      path: file.path,
      name: file.name,
      mimeType: this.getMimeType(file.extension)
    };
  }

  /**
   * Get MIME type based on extension
   */
  getMimeType(extension) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.dwg': 'application/acad',
      '.dxf': 'application/dxf',
      '.nc': 'text/plain',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Get orphaned files (files without metadata records)
   */
  async getOrphanedFiles() {
    const { files } = await this.getAllFiles({ limit: 999999 });
    
    const orphanedFiles = files.filter(f => 
      !f.documentNumber || f.documentNumber === 'N/A' || f.createdBy === 'Unknown'
    );

    return {
      files: orphanedFiles,
      count: orphanedFiles.length,
      totalSize: orphanedFiles.reduce((sum, f) => sum + f.size, 0)
    };
  }

  /**
   * Clean up orphaned files
   */
  async cleanupOrphanedFiles() {
    const { files } = await this.getOrphanedFiles();
    const deleted = [];
    const errors = [];

    for (const file of files) {
      try {
        await fs.unlink(file.path);
        deleted.push(file);
      } catch (error) {
        errors.push({ file: file.name, error: error.message });
      }
    }

    return {
      deletedCount: deleted.length,
      errorCount: errors.length,
      deleted,
      errors
    };
  }

  /**
   * Get duplicate files (same name, different locations)
   */
  async getDuplicateFiles() {
    const { files } = await this.getAllFiles({ limit: 999999 });
    
    const fileMap = {};
    files.forEach(file => {
      if (!fileMap[file.name]) {
        fileMap[file.name] = [];
      }
      fileMap[file.name].push(file);
    });

    const duplicates = Object.values(fileMap).filter(group => group.length > 1);

    return {
      groups: duplicates,
      count: duplicates.length,
      totalFiles: duplicates.reduce((sum, group) => sum + group.length, 0)
    };
  }

  /**
   * Get storage usage by type
   */
  async getStorageUsageByType() {
    const { files } = await this.getAllFiles({ limit: 999999 });
    
    const usage = {};
    
    files.forEach(file => {
      if (!usage[file.type]) {
        usage[file.type] = {
          count: 0,
          size: 0,
          sizeFormatted: ''
        };
      }
      usage[file.type].count++;
      usage[file.type].size += file.size;
    });

    // Format sizes
    Object.keys(usage).forEach(type => {
      usage[type].sizeFormatted = this.formatFileSize(usage[type].size);
    });

    return usage;
  }
}

module.exports = new FileManagementService();