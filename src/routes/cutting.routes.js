// src/routes/cutting.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cuttingService = require('../services/cutting.service');
const { protect, checkSystemAccess } = require('../middleware/auth.middleware');

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

/**
 * @route   POST /api/cutting
 * @desc    Create new cutting job
 * @access  Private (Super Admin or users with laserCuttingManagement access)
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

    const uploadedBy = req.user.id; // Get user ID from JWT token
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
 * @access  Private (Super Admin or users with laserCuttingManagement access)
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
 * @access  Private (Super Admin or users with laserCuttingManagement access)
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
 * @route   GET /api/cutting/:id
 * @desc    Get specific cutting job by ID
 * @access  Private (Super Admin or users with laserCuttingManagement access)
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
 * @access  Private (Super Admin or users with laserCuttingManagement access)
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
      dateFrom
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

    const updateData = {
      projectName,
      pieceName,
      quantity,
      materialType,
      thickness,
      notes,
      fileStatus,
      dateFrom
    };

    const updatedBy = req.user.id; // Get user ID from JWT token
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
 * @route   DELETE /api/cutting/:id
 * @desc    Delete cutting job
 * @access  Private (Super Admin or users with laserCuttingManagement access)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await cuttingService.deleteCuttingJob(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Cutting job deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/cutting/:id/status
 * @desc    Update only the file status of a cutting job
 * @access  Private (Super Admin or users with laserCuttingManagement access)
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

module.exports = router;