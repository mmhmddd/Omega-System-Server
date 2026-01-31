// src/services/cutting.service.js (COMPLETE READY-TO-PASTE VERSION)
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');

const CUTTING_JOBS_FILE = path.join(__dirname, '../../data/cutting-jobs/index.json');
const CUTTING_JOBS_DIR = path.join(__dirname, '../../data/cutting-jobs');
const COUNTERS_FILE = path.join(__dirname, '../../data/counters.json');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// Status folders
const STATUS_FOLDERS = {
  معلق: 'pending',
  'قيد التنفيذ': 'in-progress',
  مكتمل: 'completed',
  جزئي: 'partial'
};

class CuttingService {
  /**
   * Load users from file
   */
  async loadUsers() {
    try {
      if (!fsSync.existsSync(USERS_FILE)) {
        return [];
      }
      const data = await fs.readFile(USERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  }

  /**
   * Get user info by ID
   */
  async getUserInfo(userId) {
    try {
      const users = await this.loadUsers();
      const user = users.find(u => u.id === userId);
      
      if (user) {
        return {
          id: user.id,
          name: user.name || user.username,
          username: user.username,
          email: user.email
        };
      }
      
      return {
        id: userId,
        name: 'Unknown User',
        username: userId,
        email: ''
      };
    } catch (error) {
      console.error('Error getting user info:', error);
      return {
        id: userId,
        name: 'Unknown User',
        username: userId,
        email: ''
      };
    }
  }

  /**
   * Enrich job with user information
   */
  async enrichJobWithUserInfo(job) {
    try {
      // Get uploaded by user info
      const uploadedByInfo = await this.getUserInfo(job.uploadedBy);
      
      // Get cutBy users info (all users who worked on this job)
      const cutByInfo = [];
      if (job.cutBy && Array.isArray(job.cutBy)) {
        for (const userId of job.cutBy) {
          const userInfo = await this.getUserInfo(userId);
          cutByInfo.push(userInfo);
        }
      }

      // Get last updated by user info
      let lastUpdatedByInfo = null;
      if (job.lastUpdatedBy) {
        lastUpdatedByInfo = await this.getUserInfo(job.lastUpdatedBy);
      }

      // Get update history with user info
      let updateHistoryWithUsers = [];
      if (job.updateHistory && Array.isArray(job.updateHistory)) {
        updateHistoryWithUsers = await Promise.all(
          job.updateHistory.map(async (update) => {
            const userInfo = await this.getUserInfo(update.updatedBy);
            return {
              ...update,
              updatedByInfo: userInfo
            };
          })
        );
      }

      return {
        ...job,
        uploadedByInfo: uploadedByInfo,
        cutByInfo: cutByInfo,
        lastUpdatedByInfo: lastUpdatedByInfo,
        updateHistory: updateHistoryWithUsers
      };
    } catch (error) {
      console.error('Error enriching job with user info:', error);
      return job;
    }
  }

  /**
   * Initialize cutting jobs directory structure
   */
  async initializeCuttingSystem() {
    try {
      // Create main cutting-jobs directory
      if (!fsSync.existsSync(CUTTING_JOBS_DIR)) {
        await fs.mkdir(CUTTING_JOBS_DIR, { recursive: true });
      }

      // Create status folders
      for (const folder of Object.values(STATUS_FOLDERS)) {
        const folderPath = path.join(CUTTING_JOBS_DIR, folder);
        if (!fsSync.existsSync(folderPath)) {
          await fs.mkdir(folderPath, { recursive: true });
        }
      }

      // Initialize index.json if doesn't exist
      if (!fsSync.existsSync(CUTTING_JOBS_FILE)) {
        await atomicWrite(CUTTING_JOBS_FILE, JSON.stringify([], null, 2));
      }

      // Initialize counters.json if doesn't exist
      if (!fsSync.existsSync(COUNTERS_FILE)) {
        await atomicWrite(COUNTERS_FILE, JSON.stringify({ cuttingJobs: 0 }, null, 2));
      }

      return { success: true, message: 'Cutting system initialized' };
    } catch (error) {
      console.error('Error initializing cutting system:', error);
      throw error;
    }
  }

  /**
   * Load cutting jobs from file
   */
  async loadCuttingJobs() {
    try {
      if (!fsSync.existsSync(CUTTING_JOBS_FILE)) {
        await this.initializeCuttingSystem();
        return [];
      }
      const data = await fs.readFile(CUTTING_JOBS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading cutting jobs:', error);
      return [];
    }
  }

  /**
   * Save cutting jobs to file
   */
  async saveCuttingJobs(jobs) {
    await atomicWrite(CUTTING_JOBS_FILE, JSON.stringify(jobs, null, 2));
  }

  /**
   * Get next cutting job ID
   */
  async getNextCuttingJobId() {
    try {
      let counters = { cuttingJobs: 0 };
      
      if (fsSync.existsSync(COUNTERS_FILE)) {
        const data = await fs.readFile(COUNTERS_FILE, 'utf8');
        counters = JSON.parse(data);
      }

      if (!counters.cuttingJobs) {
        counters.cuttingJobs = 0;
      }

      counters.cuttingJobs += 1;
      const newId = `LC${counters.cuttingJobs.toString().padStart(4, '0')}`;

      await atomicWrite(COUNTERS_FILE, JSON.stringify(counters, null, 2));

      return newId;
    } catch (error) {
      console.error('Error generating cutting job ID:', error);
      throw error;
    }
  }

  /**
   * Generate filename for uploaded file
   */
  generateFileName(originalName, thickness, quantity, date) {
    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);
    const formattedDate = new Date(date).toISOString().split('T')[0];
    return `${baseName}_TH${thickness}_QT${quantity}_${formattedDate}${ext}`;
  }

  /**
   * Move file between status folders
   */
  async moveFileToStatusFolder(fileName, oldStatus, newStatus) {
    try {
      const oldFolder = STATUS_FOLDERS[oldStatus];
      const newFolder = STATUS_FOLDERS[newStatus];

      const oldPath = path.join(CUTTING_JOBS_DIR, oldFolder, fileName);
      const newPath = path.join(CUTTING_JOBS_DIR, newFolder, fileName);

      if (fsSync.existsSync(oldPath)) {
        await fs.rename(oldPath, newPath);
      }
    } catch (error) {
      console.error('Error moving file:', error);
      throw error;
    }
  }

  /**
   * Download file
   */
  async downloadFile(filePath) {
    try {
      // Remove 'data/' prefix if present and construct absolute path
      const relativePath = filePath.replace(/^data\//, '');
      const absolutePath = path.join(__dirname, '../../data', relativePath);

      // Check if file exists
      if (!fsSync.existsSync(absolutePath)) {
        throw new Error('File not found');
      }

      // Read file
      const buffer = await fs.readFile(absolutePath);
      const stats = await fs.stat(absolutePath);

      return {
        buffer: buffer,
        size: stats.size
      };
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  /**
   * Create detailed update history entry
   */
  createUpdateHistoryEntry(updatedBy, changes) {
    return {
      updatedBy: updatedBy,
      timestamp: new Date().toISOString(),
      changes: changes
    };
  }

  /**
   * Build detailed change description for history - ENHANCED VERSION
   */
  buildChangeDescription(modifications) {
    const descriptions = [];

    modifications.forEach(mod => {
      switch (mod.field) {
        case 'currentlyCut':
          const progressPercent = mod.progressPercentage || 0;
          descriptions.push({
            field: 'currentlyCut',
            description: `Updated progress: cut ${mod.difference > 0 ? '+' : ''}${mod.difference} pieces (from ${mod.oldValue} to ${mod.newValue})`,
            descriptionAr: `تحديث التقدم: تم قص ${mod.difference > 0 ? '+' : ''}${mod.difference} قطعة (من ${mod.oldValue} إلى ${mod.newValue})`,
            oldValue: mod.oldValue,
            newValue: mod.newValue,
            difference: mod.difference,
            progress: mod.progress,
            progressPercentage: progressPercent,
            notes: mod.notes || null
          });
          break;

        case 'fileStatus':
          descriptions.push({
            field: 'fileStatus',
            description: `Changed status from "${mod.oldValue}" to "${mod.newValue}"`,
            descriptionAr: `تم تغيير الحالة من "${mod.oldValue}" إلى "${mod.newValue}"`,
            oldValue: mod.oldValue,
            newValue: mod.newValue,
            reason: mod.reason || 'Manual update',
            notes: mod.notes || null
          });
          break;

        case 'quantity':
          descriptions.push({
            field: 'quantity',
            description: `Updated total quantity from ${mod.oldValue} to ${mod.newValue}`,
            descriptionAr: `تم تحديث الكمية الإجمالية من ${mod.oldValue} إلى ${mod.newValue}`,
            oldValue: mod.oldValue,
            newValue: mod.newValue
          });
          break;

        case 'projectName':
          descriptions.push({
            field: 'projectName',
            description: `Changed project name from "${mod.oldValue}" to "${mod.newValue}"`,
            descriptionAr: `تم تغيير اسم المشروع من "${mod.oldValue}" إلى "${mod.newValue}"`,
            oldValue: mod.oldValue,
            newValue: mod.newValue
          });
          break;

        case 'materialType':
          descriptions.push({
            field: 'materialType',
            description: `Changed material from "${mod.oldValue}" to "${mod.newValue}"`,
            descriptionAr: `تم تغيير المادة من "${mod.oldValue}" إلى "${mod.newValue}"`,
            oldValue: mod.oldValue,
            newValue: mod.newValue
          });
          break;

        case 'thickness':
          descriptions.push({
            field: 'thickness',
            description: `Updated thickness from ${mod.oldValue}mm to ${mod.newValue}mm`,
            descriptionAr: `تم تحديث السماكة من ${mod.oldValue} مم إلى ${mod.newValue} مم`,
            oldValue: mod.oldValue,
            newValue: mod.newValue
          });
          break;

        case 'file':
          descriptions.push({
            field: 'file',
            description: `Replaced file "${mod.oldValue || 'none'}" with "${mod.newValue}"`,
            descriptionAr: `تم استبدال الملف "${mod.oldValue || 'لا يوجد'}" بـ "${mod.newValue}"`,
            oldValue: mod.oldValue,
            newValue: mod.newValue
          });
          break;

        default:
          descriptions.push({
            field: mod.field,
            description: `Updated ${mod.field} from "${mod.oldValue}" to "${mod.newValue}"`,
            descriptionAr: `تم تحديث ${mod.field} من "${mod.oldValue}" إلى "${mod.newValue}"`,
            oldValue: mod.oldValue,
            newValue: mod.newValue
          });
      }
    });

    return descriptions;
  }

  /**
   * Generate a human-readable summary of updates - ENHANCED VERSION
   */
  generateUpdateSummary(modifications, actionType, notes) {
    const summaryEn = [];
    const summaryAr = [];

    modifications.forEach(mod => {
      switch (mod.field) {
        case 'currentlyCut':
          summaryEn.push(`Cut ${mod.difference > 0 ? '+' : ''}${mod.difference} pieces (total: ${mod.newValue}/${mod.quantity || '?'})`);
          summaryAr.push(`تم قص ${mod.difference > 0 ? '+' : ''}${mod.difference} قطعة (الإجمالي: ${mod.newValue}/${mod.quantity || '؟'})`);
          break;
        case 'fileStatus':
          summaryEn.push(`Status: ${mod.oldValue} → ${mod.newValue}`);
          summaryAr.push(`الحالة: ${mod.oldValue} ← ${mod.newValue}`);
          break;
        case 'quantity':
          summaryEn.push(`Total quantity updated to ${mod.newValue}`);
          summaryAr.push(`تم تحديث الكمية الإجمالية إلى ${mod.newValue}`);
          break;
      }
    });

    // Add notes indicator to summary if provided
    if (notes) {
      summaryEn.push(`Note added`);
      summaryAr.push(`تمت إضافة ملاحظة`);
    }

    return {
      en: summaryEn.join(', ') || 'Job updated',
      ar: summaryAr.join('، ') || 'تم تحديث المهمة'
    };
  }

  /**
   * Create new cutting job
   */
  async createCuttingJob(jobData, file, uploadedBy) {
    try {
      await this.initializeCuttingSystem();

      const jobs = await this.loadCuttingJobs();
      const jobId = await this.getNextCuttingJobId();

      // Validate required fields
      if (!jobData.projectName || !jobData.quantity || !jobData.materialType || !jobData.thickness) {
        throw new Error('Missing required fields: projectName, quantity, materialType, thickness');
      }

      // Validate file extension
      if (file) {
        const allowedExtensions = ['.dwg', '.dxf', '.dwt', '.nc', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          throw new Error('Invalid file type. Only DWG, DXF, DWT, NC, TXT files are allowed');
        }
      }

      // Generate filename and save file
      let savedFileName = null;
      if (file) {
        const fileName = this.generateFileName(
          file.originalname,
          jobData.thickness,
          jobData.quantity,
          new Date()
        );

        const statusFolder = STATUS_FOLDERS['معلق'];
        const filePath = path.join(CUTTING_JOBS_DIR, statusFolder, fileName);

        await fs.writeFile(filePath, file.buffer);
        savedFileName = fileName;
      }

      // Create job object with enhanced tracking
      const newJob = {
        id: jobId,
        projectName: jobData.projectName,
        pieceName: jobData.pieceName || '',
        quantity: parseInt(jobData.quantity),
        currentlyCut: 0,
        materialType: jobData.materialType,
        thickness: parseFloat(jobData.thickness),
        notes: jobData.notes || '',
        fileStatus: 'معلق',
        fileName: savedFileName,
        filePath: savedFileName ? `data/cutting-jobs/${STATUS_FOLDERS['معلق']}/${savedFileName}` : null,
        uploadedBy: uploadedBy,
        cutBy: [],
        lastUpdatedBy: uploadedBy,
        updateHistory: [
          this.createUpdateHistoryEntry(uploadedBy, {
            action: 'created',
            actionType: 'job_created',
            description: 'Job created',
            descriptionAr: 'تم إنشاء مهمة القص',
            details: {
              projectName: jobData.projectName,
              pieceName: jobData.pieceName || '',
              quantity: parseInt(jobData.quantity),
              materialType: jobData.materialType,
              thickness: parseFloat(jobData.thickness),
              fileName: savedFileName
            }
          })
        ],
        dateFrom: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      jobs.push(newJob);
      await this.saveCuttingJobs(jobs);

      return await this.enrichJobWithUserInfo(newJob);
    } catch (error) {
      console.error('Error creating cutting job:', error);
      throw error;
    }
  }

  /**
   * Get all cutting jobs with filters
   */
  async getAllCuttingJobs(filters = {}) {
    try {
      let jobs = await this.loadCuttingJobs();

      // Filter by status
      if (filters.fileStatus) {
        jobs = jobs.filter(job => job.fileStatus === filters.fileStatus);
      }

      // Filter by material type
      if (filters.materialType) {
        jobs = jobs.filter(job => job.materialType === filters.materialType);
      }

      // Filter by date range
      if (filters.dateFrom) {
        jobs = jobs.filter(job => {
          if (!job.dateFrom) return false;
          return new Date(job.dateFrom) >= new Date(filters.dateFrom);
        });
      }

      if (filters.dateTo) {
        jobs = jobs.filter(job => {
          if (!job.dateFrom) return false;
          return new Date(job.dateFrom) <= new Date(filters.dateTo);
        });
      }

      // Search by project name or piece name
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        jobs = jobs.filter(job =>
          job.projectName.toLowerCase().includes(searchLower) ||
          (job.pieceName && job.pieceName.toLowerCase().includes(searchLower)) ||
          job.id.toLowerCase().includes(searchLower)
        );
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;

      const paginatedJobs = jobs.slice(startIndex, endIndex);

      // Enrich all jobs with user info
      const enrichedJobs = await Promise.all(
        paginatedJobs.map(job => this.enrichJobWithUserInfo(job))
      );

      return {
        jobs: enrichedJobs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(jobs.length / limit),
          totalJobs: jobs.length,
          limit
        }
      };
    } catch (error) {
      console.error('Error getting cutting jobs:', error);
      throw error;
    }
  }

  /**
   * Get cutting job by ID
   */
  async getCuttingJobById(id) {
    try {
      const jobs = await this.loadCuttingJobs();
      const job = jobs.find(j => j.id === id);

      if (!job) {
        throw new Error('Cutting job not found');
      }

      return await this.enrichJobWithUserInfo(job);
    } catch (error) {
      console.error('Error getting cutting job:', error);
      throw error;
    }
  }

  /**
   * Update cutting job - ✅ ENHANCED VERSION WITH DETAILED NOTES TRACKING
   */
  async updateCuttingJob(id, updateData, file, updatedBy) {
    try {
      const jobs = await this.loadCuttingJobs();
      const jobIndex = jobs.findIndex(j => j.id === id);

      if (jobIndex === -1) {
        throw new Error('Cutting job not found');
      }

      const job = jobs[jobIndex];
      const oldStatus = job.fileStatus;
      
      // Initialize updateHistory if it doesn't exist
      if (!job.updateHistory) {
        job.updateHistory = [];
      }

      // Track changes for history
      const modifications = [];
      let actionType = 'job_updated';
      let updateNotes = updateData.notes; // ✅ Capture notes from update

      // Update basic fields with tracking
      if (updateData.projectName && updateData.projectName !== job.projectName) {
        modifications.push({
          field: 'projectName',
          oldValue: job.projectName,
          newValue: updateData.projectName
        });
        job.projectName = updateData.projectName;
      }

      if (updateData.pieceName !== undefined && updateData.pieceName !== job.pieceName) {
        modifications.push({
          field: 'pieceName',
          oldValue: job.pieceName,
          newValue: updateData.pieceName
        });
        job.pieceName = updateData.pieceName;
      }

      if (updateData.quantity && parseInt(updateData.quantity) !== job.quantity) {
        modifications.push({
          field: 'quantity',
          oldValue: job.quantity,
          newValue: parseInt(updateData.quantity)
        });
        job.quantity = parseInt(updateData.quantity);
      }

      if (updateData.materialType && updateData.materialType !== job.materialType) {
        modifications.push({
          field: 'materialType',
          oldValue: job.materialType,
          newValue: updateData.materialType
        });
        job.materialType = updateData.materialType;
      }

      if (updateData.thickness && parseFloat(updateData.thickness) !== job.thickness) {
        modifications.push({
          field: 'thickness',
          oldValue: job.thickness,
          newValue: parseFloat(updateData.thickness)
        });
        job.thickness = parseFloat(updateData.thickness);
      }

      if (updateData.dateFrom !== undefined && updateData.dateFrom !== job.dateFrom) {
        modifications.push({
          field: 'dateFrom',
          oldValue: job.dateFrom,
          newValue: updateData.dateFrom
        });
        job.dateFrom = updateData.dateFrom;
      }

      // ✅ Handle currentlyCut update with detailed tracking and notes
      if (updateData.currentlyCut !== undefined) {
        const newCutAmount = parseInt(updateData.currentlyCut);
        
        // Validate the cut amount
        if (isNaN(newCutAmount)) {
          throw new Error('Cut amount must be a valid number');
        }
        
        if (newCutAmount < 0) {
          throw new Error('Cut amount cannot be negative');
        }
        
        if (newCutAmount > job.quantity) {
          throw new Error(`Cut amount (${newCutAmount}) cannot exceed total quantity (${job.quantity})`);
        }
        
        if (newCutAmount !== job.currentlyCut) {
          const difference = newCutAmount - job.currentlyCut;
          const progressPercentage = Math.round((newCutAmount / job.quantity) * 100);
          
          // ✅ ATTACH NOTES TO THE PROGRESS MODIFICATION
          modifications.push({
            field: 'currentlyCut',
            oldValue: job.currentlyCut,
            newValue: newCutAmount,
            difference: difference,
            progress: `${newCutAmount}/${job.quantity} (${progressPercentage}%)`,
            progressPercentage: progressPercentage,
            quantity: job.quantity,
            notes: updateNotes || null // ✅ Include notes here
          });
          
          job.currentlyCut = newCutAmount;
          actionType = 'progress_updated';
          
          // Auto-update status based on progress if status is not explicitly provided
          if (!updateData.fileStatus) {
            let autoStatus;
            if (newCutAmount === 0) {
              autoStatus = 'معلق';
            } else if (newCutAmount < job.quantity) {
              autoStatus = 'قيد التنفيذ';
            } else if (newCutAmount === job.quantity) {
              autoStatus = 'مكتمل';
            }
            
            if (autoStatus && autoStatus !== job.fileStatus) {
              modifications.push({
                field: 'fileStatus',
                oldValue: job.fileStatus,
                newValue: autoStatus,
                reason: 'Auto-updated based on progress',
                notes: updateNotes || null // ✅ Include notes with auto status change
              });
              job.fileStatus = autoStatus;
              actionType = 'status_changed';
            }
          }
        }
      }

      // ✅ Handle file status change with tracking
      if (updateData.fileStatus && updateData.fileStatus !== oldStatus) {
        modifications.push({
          field: 'fileStatus',
          oldValue: oldStatus,
          newValue: updateData.fileStatus,
          reason: 'Manual status update',
          notes: updateNotes || null // ✅ Include notes with manual status change
        });
        job.fileStatus = updateData.fileStatus;
        actionType = 'status_changed';

        // Move file to new status folder if file exists
        if (job.fileName) {
          await this.moveFileToStatusFolder(job.fileName, oldStatus, updateData.fileStatus);
          job.filePath = `data/cutting-jobs/${STATUS_FOLDERS[updateData.fileStatus]}/${job.fileName}`;
        }
      }

      // Handle cutBy field - add user if not already in array
      if (updatedBy && !job.cutBy.includes(updatedBy)) {
        job.cutBy.push(updatedBy);
        modifications.push({
          field: 'cutBy',
          action: 'added_user',
          userId: updatedBy
        });
      }

      // Handle new file upload with tracking
      if (file) {
        const allowedExtensions = ['.dwg', '.dxf', '.dwt', '.nc', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          throw new Error('Invalid file type. Only DWG, DXF, DWT, NC, TXT files are allowed');
        }

        // Delete old file if exists
        if (job.fileName) {
          const oldFilePath = path.join(CUTTING_JOBS_DIR, STATUS_FOLDERS[job.fileStatus], job.fileName);
          if (fsSync.existsSync(oldFilePath)) {
            await fs.unlink(oldFilePath);
          }
        }

        // Save new file
        const fileName = this.generateFileName(
          file.originalname,
          job.thickness,
          job.quantity,
          new Date()
        );

        const statusFolder = STATUS_FOLDERS[job.fileStatus];
        const filePath = path.join(CUTTING_JOBS_DIR, statusFolder, fileName);

        await fs.writeFile(filePath, file.buffer);

        modifications.push({
          field: 'file',
          oldValue: job.fileName,
          newValue: fileName
        });

        job.fileName = fileName;
        job.filePath = `data/cutting-jobs/${statusFolder}/${fileName}`;
        actionType = 'file_updated';
      }

      // Update tracking fields
      job.lastUpdatedBy = updatedBy;
      job.updatedAt = new Date().toISOString();

      // ✅ Add to update history with detailed information
      if (modifications.length > 0) {
        const detailedDescriptions = this.buildChangeDescription(modifications);
        
        job.updateHistory.push(
          this.createUpdateHistoryEntry(updatedBy, {
            action: 'updated',
            actionType: actionType,
            modifications: modifications,
            detailedDescriptions: detailedDescriptions,
            summary: this.generateUpdateSummary(modifications, actionType, updateNotes),
            notes: updateNotes || null // ✅ Store notes at top level too
          })
        );
      }

      jobs[jobIndex] = job;
      await this.saveCuttingJobs(jobs);

      return await this.enrichJobWithUserInfo(job);
    } catch (error) {
      console.error('Error updating cutting job:', error);
      throw error;
    }
  }

  /**
   * Delete cutting job
   */
  async deleteCuttingJob(id) {
    try {
      const jobs = await this.loadCuttingJobs();
      const jobIndex = jobs.findIndex(j => j.id === id);

      if (jobIndex === -1) {
        throw new Error('Cutting job not found');
      }

      const job = jobs[jobIndex];

      // Delete associated file if exists
      if (job.fileName) {
        const filePath = path.join(CUTTING_JOBS_DIR, STATUS_FOLDERS[job.fileStatus], job.fileName);
        if (fsSync.existsSync(filePath)) {
          await fs.unlink(filePath);
        }
      }

      jobs.splice(jobIndex, 1);
      await this.saveCuttingJobs(jobs);

      return { message: 'Cutting job deleted successfully' };
    } catch (error) {
      console.error('Error deleting cutting job:', error);
      throw error;
    }
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    try {
      const jobs = await this.loadCuttingJobs();

      const stats = {
        total: jobs.length,
        byStatus: {
          معلق: jobs.filter(j => j.fileStatus === 'معلق').length,
          'قيد التنفيذ': jobs.filter(j => j.fileStatus === 'قيد التنفيذ').length,
          مكتمل: jobs.filter(j => j.fileStatus === 'مكتمل').length,
          جزئي: jobs.filter(j => j.fileStatus === 'جزئي').length
        },
        byMaterial: {},
        totalProgress: {
          totalQuantity: 0,
          totalCut: 0,
          percentageComplete: 0
        }
      };

      // Count by material type and calculate total progress
      jobs.forEach(job => {
        // Material stats
        if (!stats.byMaterial[job.materialType]) {
          stats.byMaterial[job.materialType] = 0;
        }
        stats.byMaterial[job.materialType]++;

        // Progress stats
        stats.totalProgress.totalQuantity += job.quantity || 0;
        stats.totalProgress.totalCut += job.currentlyCut || 0;
      });

      // Calculate overall percentage
      if (stats.totalProgress.totalQuantity > 0) {
        stats.totalProgress.percentageComplete = Math.round(
          (stats.totalProgress.totalCut / stats.totalProgress.totalQuantity) * 100
        );
      }

      return stats;
    } catch (error) {
      console.error('Error getting statistics:', error);
      throw error;
    }
  }
}

module.exports = new CuttingService();