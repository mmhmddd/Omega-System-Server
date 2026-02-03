// src/routes/cutting.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cuttingService = require('../services/cutting.service');
const { protect, checkRouteAccess ,checkSystemAccess  } = require('../middleware/auth.middleware');

// Configure multer for file upload (memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.dwg', '.dxf', '.dwt', '.nc', '.txt'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only DWG, DXF, DWT, NC, TXT files are allowed'));
    }
  }
});

// Apply authentication to all routes
router.use(protect);

// Check system access for laser cutting management
// Super admins automatically have access, others need laserCuttingManagement permission
router.use(checkSystemAccess('laserCuttingManagement'));
router.use(checkRouteAccess('cutting'));

/**
 * @route   POST /api/cutting
 * @desc    Create new cutting job
 * @access  Private (Super Admin or users with cutting access)
 */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const {
      projectName,
      pieceName,
      quantity,
      materialType,
      thickness,
      notes
    } = req.body;

    // Validate required fields
    if (!projectName || !quantity || !materialType || !thickness) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: projectName, quantity, materialType, thickness are required'
      });
    }

    // Validate quantity and thickness are numbers
    if (isNaN(quantity) || parseInt(quantity) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number'
      });
    }

    if (isNaN(thickness) || parseFloat(thickness) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Thickness must be a positive number'
      });
    }

    const jobData = {
      projectName,
      pieceName,
      quantity,
      materialType,
      thickness,
      notes
    };

    const uploadedBy = req.user.id;
    const job = await cuttingService.createCuttingJob(jobData, req.file, uploadedBy);

    res.status(201).json({
      success: true,
      message: 'Cutting job created successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/cutting
 * @desc    Get all cutting jobs with filters and pagination
 * @access  Private
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      fileStatus,
      materialType,
      dateFrom,
      dateTo,
      search,
      page = 1,
      limit = 10
    } = req.query;

    const filters = {
      fileStatus,
      materialType,
      dateFrom,
      dateTo,
      search,
      page: parseInt(page),
      limit: parseInt(limit)
    };

    const result = await cuttingService.getAllCuttingJobs(filters);

    res.status(200).json({
      success: true,
      data: result.jobs,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/cutting/statistics
 * @desc    Get cutting jobs statistics
 * @access  Private
 */
router.get('/statistics', async (req, res, next) => {
  try {
    const stats = await cuttingService.getStatistics();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/cutting/download/:id
 * @desc    Download cutting job file
 * @access  Private
 */
router.get('/download/:id', async (req, res, next) => {
  try {
    const job = await cuttingService.getCuttingJobById(req.params.id);

    if (!job.fileName || !job.filePath) {
      return res.status(404).json({
        success: false,
        message: 'No file associated with this cutting job'
      });
    }

    const fileResult = await cuttingService.downloadFile(job.filePath);

    // Set headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${job.fileName}"`);
    res.setHeader('Content-Length', fileResult.size);

    res.send(fileResult.buffer);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/cutting/:id
 * @desc    Get specific cutting job by ID
 * @access  Private
 */
router.get('/:id', async (req, res, next) => {
  try {
    const job = await cuttingService.getCuttingJobById(req.params.id);

    res.status(200).json({
      success: true,
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/cutting/:id
 * @desc    Update cutting job
 * @access  Private
 */
router.put('/:id', upload.single('file'), async (req, res, next) => {
  try {
    const {
      projectName,
      pieceName,
      quantity,
      materialType,
      thickness,
      notes,
      fileStatus,
      dateFrom,
      currentlyCut  // ✅ NEW: Accept currentlyCut from request
    } = req.body;

    // Validate fileStatus if provided
    if (fileStatus) {
      const validStatuses = ['معلق', 'قيد التنفيذ', 'مكتمل', 'جزئي'];
      if (!validStatuses.includes(fileStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file status. Valid values: معلق, قيد التنفيذ, مكتمل, جزئي'
        });
      }
    }

    // Validate quantity if provided
    if (quantity && (isNaN(quantity) || parseInt(quantity) <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a positive number'
      });
    }

    // Validate thickness if provided
    if (thickness && (isNaN(thickness) || parseFloat(thickness) <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Thickness must be a positive number'
      });
    }

    // ✅ NEW: Validate currentlyCut if provided
    if (currentlyCut !== undefined) {
      const cutAmount = parseInt(currentlyCut);
      if (isNaN(cutAmount) || cutAmount < 0) {
        return res.status(400).json({
          success: false,
          message: 'Currently cut amount must be a non-negative number'
        });
      }
    }

    const updateData = {
      projectName,
      pieceName,
      quantity,
      materialType,
      thickness,
      notes,
      fileStatus,
      dateFrom,
      currentlyCut  // ✅ NEW: Include currentlyCut in update data
    };

    const updatedBy = req.user.id;
    const job = await cuttingService.updateCuttingJob(
      req.params.id,
      updateData,
      req.file,
      updatedBy
    );

    res.status(200).json({
      success: true,
      message: 'Cutting job updated successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ DELETE CUTTING JOB - UPDATED
 * Super Admin: Can delete any cutting job
 * Admin/Employee: Can delete only their own cutting jobs
 */
router.delete('/:id', async (req, res, next) => {
  try {
    // First, get the cutting job to check ownership
    const job = await cuttingService.getCuttingJobById(req.params.id);

    // Super admin can delete any cutting job
    if (req.user.role === 'super_admin') {
      await cuttingService.deleteCuttingJob(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Cutting job deleted successfully'
      });
    }

    // Admin and employee can only delete their own cutting jobs
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (job.uploadedBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this cutting job'
        });
      }
      await cuttingService.deleteCuttingJob(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Cutting job deleted successfully'
      });
    }

    // Other roles cannot delete
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete cutting jobs'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/cutting/:id/status
 * @desc    Update only the file status of a cutting job
 * @access  Private
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { fileStatus } = req.body;

    if (!fileStatus) {
      return res.status(400).json({
        success: false,
        message: 'File status is required'
      });
    }

    const validStatuses = ['معلق', 'قيد التنفيذ', 'مكتمل', 'جزئي'];
    if (!validStatuses.includes(fileStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file status. Valid values: معلق, قيد التنفيذ, مكتمل, جزئي'
      });
    }

    const updatedBy = req.user.id;
    const job = await cuttingService.updateCuttingJob(
      req.params.id,
      { fileStatus },
      null,
      updatedBy
    );

    res.status(200).json({
      success: true,
      message: 'File status updated successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/cutting/:id/track
 * @desc    Update cutting progress (currentlyCut) for a job
 * @access  Private
 */
router.patch('/:id/track', async (req, res, next) => {
  try {
    const { currentlyCut, fileStatus, notes } = req.body;

    if (currentlyCut === undefined) {
      return res.status(400).json({
        success: false,
        message: 'currentlyCut is required'
      });
    }

    const cutAmount = parseInt(currentlyCut);
    if (isNaN(cutAmount) || cutAmount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Currently cut amount must be a non-negative number'
      });
    }

    // Validate fileStatus if provided
    if (fileStatus) {
      const validStatuses = ['معلق', 'قيد التنفيذ', 'مكتمل', 'جزئي'];
      if (!validStatuses.includes(fileStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid file status. Valid values: معلق, قيد التنفيذ, مكتمل, جزئي'
        });
      }
    }

    const updatedBy = req.user.id;
    const updateData = {
      currentlyCut: cutAmount,
      fileStatus,
      notes
    };

    const job = await cuttingService.updateCuttingJob(
      req.params.id,
      updateData,
      null,
      updatedBy
    );

    res.status(200).json({
      success: true,
      message: 'Cutting progress updated successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;