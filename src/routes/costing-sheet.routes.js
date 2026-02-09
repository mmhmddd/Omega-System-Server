// ============================================================
// COSTING SHEET ROUTES - FIXED WITH PROPER ACCESS CONTROL
// src/routes/costing-sheet.routes.js
// ============================================================
const express = require('express');
const router = express.Router();
const path = require('path');
const costingSheetService = require('../services/costing-sheet.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');
const multer = require('multer');

// Configure multer for file uploads (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// ✅ Apply authentication to all routes
router.use(protect);

/**
 * ✅ FIXED: Check route access instead of hardcoded role
 * Employees with 'costingSheet' in routeAccess can access
 */
const costingSheetAccess = checkRouteAccess('costingSheet');

/**
 * ✅ CREATE COSTING SHEET - WITH includeStaticFile SUPPORT
 * POST /api/costing-sheets
 */
router.post('/', costingSheetAccess, async (req, res, next) => {
  try {
    // Parse items - handle both JSON string and object
    let items = [];
    if (req.body.items) {
      if (typeof req.body.items === 'string') {
        try {
          items = JSON.parse(req.body.items);
        } catch (e) {
          return res.status(400).json({
            success: false,
            message: 'Invalid items format. Must be valid JSON array.'
          });
        }
      } else if (Array.isArray(req.body.items)) {
        items = req.body.items;
      } else {
        items = [req.body.items];
      }
    }

    const costingSheetData = {
      date: req.body.date,
      client: req.body.client,
      project: req.body.project,
      profitPercentage: req.body.profitPercentage,
      notes: req.body.notes,
      items: items,
      additionalNotes: req.body.additionalNotes,
      includeStaticFile: req.body.includeStaticFile === true || req.body.includeStaticFile === 'true' // ✅ NEW FIELD
    };

    const costingSheet = await costingSheetService.createCostingSheet(
      costingSheetData,
      req.user.id,
      req.user.role
    );

    res.status(201).json({
      success: true,
      message: `Costing Sheet created successfully (${costingSheet.language === 'ar' ? 'Arabic' : 'English'})`,
      data: costingSheet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GET ALL COSTING SHEETS - WITH EMPLOYEE FILTERING
 */
router.get('/', costingSheetAccess, async (req, res, next) => {
  try {
    const { 
      csNumber, 
      startDate, 
      endDate, 
      client,
      project,
      search, 
      page, 
      limit 
    } = req.query;

    const filters = {
      csNumber,
      startDate,
      endDate,
      client,
      project,
      search,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10
    };

    // ✅ CRITICAL: Employees only see their own costing sheets
    if (req.user.role === 'employee') {
      filters.createdBy = req.user.id;
      console.log(`✅ Employee ${req.user.id} - filtering costing sheets by createdBy`);
    }

    const result = await costingSheetService.getAllCostingSheets(
      filters,
      req.user.id,
      req.user.role
    );

    console.log(`✅ Retrieved ${result.costingSheets.length} costing sheets for user role: ${req.user.role}`);

    res.status(200).json({
      success: true,
      data: result.costingSheets,
      pagination: result.pagination,
      userRole: req.user.role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET COSTING SHEET STATISTICS
 */
router.get('/stats', costingSheetAccess, async (req, res, next) => {
  try {
    const stats = await costingSheetService.getCostingSheetStats(req.user.id, req.user.role);
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * RESET COUNTER - Super admin only
 */
router.post('/reset-counter', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const result = await costingSheetService.resetCostingSheetCounter();
    res.status(200).json({
      success: true,
      message: 'Costing Sheet counter reset successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GET SPECIFIC COSTING SHEET (By ID) - WITH PERMISSION CHECK
 */
router.get('/:id', costingSheetAccess, async (req, res, next) => {
  try {
    const costingSheet = await costingSheetService.getCostingSheetById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    // ✅ Employees can only view their own costing sheets
    if (req.user.role === 'employee' && costingSheet.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own costing sheets'
      });
    }

    res.status(200).json({
      success: true,
      data: costingSheet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ UPDATE COSTING SHEET - WITH includeStaticFile SUPPORT
 */
router.put('/:id', costingSheetAccess, async (req, res, next) => {
  try {
    // Check if costing sheet exists and user has permission
    const existingSheet = await costingSheetService.getCostingSheetById(
      req.params.id,
      req.user.id,
      req.user.role
    );

    // ✅ Employees can only update their own costing sheets
    if (req.user.role === 'employee' && existingSheet.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own costing sheets'
      });
    }

    // ✅ Parse items - handle both JSON string and object
    let items = undefined;
    if (req.body.items) {
      if (typeof req.body.items === 'string') {
        try {
          items = JSON.parse(req.body.items);
        } catch (e) {
          console.error('JSON Parse Error:', e);
          console.error('Received items:', req.body.items);
          return res.status(400).json({
            success: false,
            message: 'Invalid items format. Must be valid JSON array.',
            received: typeof req.body.items,
            error: e.message
          });
        }
      } else if (Array.isArray(req.body.items)) {
        items = req.body.items;
      } else {
        items = [req.body.items];
      }
    }

    const updateData = {
      date: req.body.date,
      client: req.body.client,
      project: req.body.project,
      profitPercentage: req.body.profitPercentage,
      notes: req.body.notes,
      items: items,
      additionalNotes: req.body.additionalNotes,
      status: req.body.status,
      includeStaticFile: req.body.includeStaticFile !== undefined 
        ? (req.body.includeStaticFile === true || req.body.includeStaticFile === 'true')
        : undefined // ✅ NEW FIELD
    };

    const costingSheet = await costingSheetService.updateCostingSheet(
      req.params.id,
      updateData,
      req.user.id,
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: `Costing Sheet updated successfully (${costingSheet.language === 'ar' ? 'Arabic' : 'English'})`,
      data: costingSheet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ DELETE COSTING SHEET - UPDATED
 * Super Admin: Can delete any costing sheet
 * Admin/Employee: Can delete only their own costing sheets
 */
router.delete('/:id', costingSheetAccess, async (req, res, next) => {
  try {
    // First, get the costing sheet to check ownership
    const costingSheet = await costingSheetService.getCostingSheetById(
      req.params.id,
      req.user.id,
      req.user.role
    );

    // Super admin can delete any costing sheet
    if (req.user.role === 'super_admin') {
      await costingSheetService.deleteCostingSheet(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Costing Sheet deleted successfully'
      });
    }

    // Admin and employee can only delete their own costing sheets
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (costingSheet.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete your own costing sheets'
        });
      }
      await costingSheetService.deleteCostingSheet(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Costing Sheet deleted successfully'
      });
    }

    // Other roles cannot delete
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete costing sheets'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GENERATE COSTING SHEET PDF (WITH OPTIONAL ATTACHMENT AND TERMS & CONDITIONS)
 * POST /api/costing-sheets/:id/generate-pdf
 * 
 * The includeStaticFile logic is handled in the service layer
 */
router.post('/:id/generate-pdf', costingSheetAccess, upload.single('attachment'), async (req, res, next) => {
  try {
    const costingSheet = await costingSheetService.getCostingSheetById(
      req.params.id,
      req.user.id,
      req.user.role
    );

    // ✅ Employees can only generate PDFs for their own costing sheets
    if (req.user.role === 'employee' && costingSheet.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only generate PDFs for your own costing sheets'
      });
    }

    const attachmentPdf = req.file ? req.file.buffer : null;

    const result = await costingSheetService.generateCostingSheetPDF(
      req.params.id,
      req.user.id,
      req.user.role,
      attachmentPdf
    );

    const responseData = {
      csId: result.costingSheet.id,
      csNumber: result.costingSheet.csNumber,
      pdfFilename: result.pdf.filename,
      language: result.pdf.language,
      downloadUrl: `/api/costing-sheets/${req.params.id}/download-pdf`,
      merged: result.pdf.merged || false
    };

    if (result.pdf.pageCount) {
      responseData.pageCount = result.pdf.pageCount;
    }

    if (result.pdf.mergeError) {
      responseData.mergeError = result.pdf.mergeError;
      responseData.warning = 'PDF generated but attachment merge failed. Using original PDF.';
    }

    const message = result.pdf.merged
      ? `PDF generated and merged successfully in ${result.pdf.language === 'ar' ? 'Arabic' : 'English'}`
      : `PDF generated successfully in ${result.pdf.language === 'ar' ? 'Arabic' : 'English'}`;

    res.status(200).json({
      success: true,
      message,
      data: responseData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ DOWNLOAD COSTING SHEET PDF
 * GET /api/costing-sheets/:id/download-pdf
 * ✅ UPDATED: Custom filename pattern CS0001_Client_DD-MM-YYYY.pdf
 */
router.get('/:id/download-pdf', costingSheetAccess, async (req, res, next) => {
  try {
    const costingSheet = await costingSheetService.getCostingSheetById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    // ✅ Employees can only download their own costing sheets
    if (req.user.role === 'employee' && costingSheet.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only download your own costing sheets'
      });
    }

    if (!costingSheet.pdfFilename) {
      return res.status(404).json({
        success: false,
        message: 'PDF not generated yet. Please generate PDF first.'
      });
    }

    const pdfPath = path.join(__dirname, '../../data/costing-sheets/pdfs', costingSheet.pdfFilename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    // ✅ Generate custom filename pattern: CS0001_Client_DD-MM-YYYY.pdf
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
    
    const csNumber = costingSheet.csNumber || 'CS0000';
    const clientName = sanitizeFilename(costingSheet.client);
    const dateFormatted = formatDate(costingSheet.date);
    const downloadFilename = `${csNumber}_${clientName}_${dateFormatted}.pdf`;

    res.download(pdfPath, downloadFilename, (err) => {
      if (err) next(err);
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ SEND COSTING SHEET VIA EMAIL
 * POST /api/costing-sheets/:id/send-email
 */
router.post('/:id/send-email', costingSheetAccess, async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address'
      });
    }

    const costingSheet = await costingSheetService.getCostingSheetById(
      req.params.id,
      req.user.id,
      req.user.role
    );

    // ✅ Employees can only email their own costing sheets
    if (req.user.role === 'employee' && costingSheet.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only email your own costing sheets'
      });
    }

    const result = await costingSheetService.sendCostingSheetByEmail(
      req.params.id,
      req.user.id,
      req.user.role,
      email
    );

    res.status(200).json({
      success: true,
      message: result.message || 'Email sent successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;