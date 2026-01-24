// src/services/cutting.service.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const atomicWrite = require('../utils/atomic-write.util');

const CUTTING_JOBS_FILE = path.join(__dirname, '../../data/cutting-jobs/index.json');
const CUTTING_JOBS_DIR = path.join(__dirname, '../../data/cutting-jobs');
const COUNTERS_FILE = path.join(__dirname, '../../data/counters.json');

// Status folders
const STATUS_FOLDERS = {
  معلق: 'pending',
  'قيد التنفيذ': 'in-progress',
  مكتمل: 'completed',
  جزئي: 'partial'
};

class CuttingService {
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

        const statusFolder = STATUS_FOLDERS['معلق']; // Default status is pending
        const filePath = path.join(CUTTING_JOBS_DIR, statusFolder, fileName);

        await fs.writeFile(filePath, file.buffer);
        savedFileName = fileName;
      }

      // Create job object
      const newJob = {
        id: jobId,
        projectName: jobData.projectName,
        pieceName: jobData.pieceName || '',
        quantity: parseInt(jobData.quantity),
        materialType: jobData.materialType,
        thickness: parseFloat(jobData.thickness),
        notes: jobData.notes || '',
        fileStatus: 'معلق', // Default status: pending
        fileName: savedFileName,
        filePath: savedFileName ? `data/cutting-jobs/${STATUS_FOLDERS['معلق']}/${savedFileName}` : null,
        uploadedBy: uploadedBy,
        cutBy: [], // Array to track all users who worked on this job
        dateFrom: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      jobs.push(newJob);
      await this.saveCuttingJobs(jobs);

      return newJob;
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

      return {
        jobs: paginatedJobs,
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

      return job;
    } catch (error) {
      console.error('Error getting cutting job:', error);
      throw error;
    }
  }

  /**
   * Update cutting job
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

      // Update basic fields
      if (updateData.projectName) job.projectName = updateData.projectName;
      if (updateData.pieceName !== undefined) job.pieceName = updateData.pieceName;
      if (updateData.quantity) job.quantity = parseInt(updateData.quantity);
      if (updateData.materialType) job.materialType = updateData.materialType;
      if (updateData.thickness) job.thickness = parseFloat(updateData.thickness);
      if (updateData.notes !== undefined) job.notes = updateData.notes;
      if (updateData.dateFrom !== undefined) job.dateFrom = updateData.dateFrom;

      // Handle file status change
      if (updateData.fileStatus && updateData.fileStatus !== oldStatus) {
        job.fileStatus = updateData.fileStatus;

        // Move file to new status folder if file exists
        if (job.fileName) {
          await this.moveFileToStatusFolder(job.fileName, oldStatus, updateData.fileStatus);
          job.filePath = `data/cutting-jobs/${STATUS_FOLDERS[updateData.fileStatus]}/${job.fileName}`;
        }
      }

      // Handle cutBy field - add user if not already in array
      if (updatedBy && !job.cutBy.includes(updatedBy)) {
        job.cutBy.push(updatedBy);
      }

      // Handle new file upload
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

        job.fileName = fileName;
        job.filePath = `data/cutting-jobs/${statusFolder}/${fileName}`;
      }

      job.updatedAt = new Date().toISOString();

      jobs[jobIndex] = job;
      await this.saveCuttingJobs(jobs);

      return job;
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
        byMaterial: {}
      };

      // Count by material type
      jobs.forEach(job => {
        if (!stats.byMaterial[job.materialType]) {
          stats.byMaterial[job.materialType] = 0;
        }
        stats.byMaterial[job.materialType]++;
      });

      return stats;
    } catch (error) {
      console.error('Error getting statistics:', error);
      throw error;
    }
  }
}

module.exports = new CuttingService();