// src/services/file-management.service.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class FileManagementService {
  constructor() {
    // Define all directories to scan
    this.directories = {
      cuttingJobs: path.join(__dirname, '../../data/cutting-jobs'),
      quotations: path.join(__dirname, '../../data/quotations/pdfs'),
      quotationsAttachments: path.join(__dirname, '../../data/quotations/AR-Uploads'),
      receipts: path.join(__dirname, '../../data/receipts/pdfs'),
      secretariatForms: path.join(__dirname, '../../data/secretariat-forms/pdfs'),
      secretariatUserForms: path.join(__dirname, '../../data/secretariat-forms/user-pdfs'),
      rfqs: path.join(__dirname, '../../data/rfqs/pdfs'),
      purchases: path.join(__dirname, '../../data/purchases/pdfs'),
      materials: path.join(__dirname, '../../data/materials-requests/pdfs')
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
      materials: path.join(__dirname, '../../data/materials-requests/index.json')
    };
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
      image: ['jpg', 'jpeg', 'png', 'gif', 'bmp'],
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
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error loading metadata from ${metadataPath}:`, error);
      return [];
    }
  }

  /**
   * Get file metadata from record
   */
  getFileMetadataFromRecord(record, type) {
    const metadata = {
      createdBy: record.createdBy || record.uploadedBy || 'Unknown',
      createdByRole: record.createdByRole || 'Unknown',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
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
    }

    return metadata;
  }

  /**
   * Scan a specific directory and get all files with metadata
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
                // Find metadata from cutting jobs records
                const record = metadata.find(m => m.fileName === filename);

                files.push({
                  id: `${type}-${filename}`,
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
                  ...this.getFileMetadataFromRecord(record || {}, type),
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
              }
              return false;
            });

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
              ...this.getFileMetadataFromRecord(record || {}, type)
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
        (f.clientName && f.clientName.toLowerCase().includes(searchLower))
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
      
      if (file.createdBy) {
        stats.byCreator[file.createdBy] = (stats.byCreator[file.createdBy] || 0) + 1;
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
   * Delete file
   */
  async deleteFile(fileId) {
    const file = await this.getFileById(fileId);

    // Delete the physical file
    await fs.unlink(file.path);

    return { message: 'File deleted successfully', file };
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
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };

    return mimeTypes[extension] || 'application/octet-stream';
  }
}

module.exports = new FileManagementService();