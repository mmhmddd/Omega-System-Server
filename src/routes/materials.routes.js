// ============================================================
// MATERIAL ROUTES - WITH TERMS AND CONDITIONS PDF SUPPORT
// src/routes/materials.routes.js
// ============================================================
const express = require('express');
const router = express.Router();
const path = require('path');
const materialService = require('../services/material.service');
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

router.use(protect);
router.use(checkRouteAccess('materialManagement'));

/**
 * ✅ CREATE MATERIAL REQUEST - WITH includeStaticFile SUPPORT
 * POST /api/materials
 */
router.post('/', async (req, res, next) => {
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

    const materialData = {
      date: req.body.date,
      section: req.body.section,
      project: req.body.project,
      requestPriority: req.body.requestPriority,
      requestReason: req.body.requestReason,
      items: items,
      additionalNotes: req.body.additionalNotes,
      includeStaticFile: req.body.includeStaticFile === true || req.body.includeStaticFile === 'true' // ✅ NEW FIELD
    };

    const material = await materialService.createMaterialRequest(
      materialData,
      req.user.id,
      req.user.role
    );

    res.status(201).json({
      success: true,
      message: `Material Request created successfully (${material.language === 'ar' ? 'Arabic' : 'English'})`,
      data: material
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET ALL MATERIAL REQUESTS
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      mrNumber, 
      startDate, 
      endDate, 
      section,
      project,
      priority,
      status,
      search, 
      page, 
      limit 
    } = req.query;

    const result = await materialService.getAllMaterialRequests(
      {
        mrNumber,
        startDate,
        endDate,
        section,
        project,
        priority,
        status,
        search,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      },
      req.user.id,
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: result.materials,
      pagination: result.pagination,
      userRole: req.user.role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET MATERIAL REQUEST STATISTICS
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await materialService.getMaterialStats(req.user.id, req.user.role);
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
    const result = await materialService.resetMaterialCounter();
    res.status(200).json({
      success: true,
      message: 'Material Request counter reset successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET SPECIFIC MATERIAL REQUEST (By ID)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const material = await materialService.getMaterialRequestById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: material
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ UPDATE MATERIAL REQUEST - WITH includeStaticFile SUPPORT
 */
router.put('/:id', async (req, res, next) => {
  try {
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
      section: req.body.section,
      project: req.body.project,
      requestPriority: req.body.requestPriority,
      requestReason: req.body.requestReason,
      items: items,
      additionalNotes: req.body.additionalNotes,
      status: req.body.status,
      includeStaticFile: req.body.includeStaticFile !== undefined 
        ? (req.body.includeStaticFile === true || req.body.includeStaticFile === 'true')
        : undefined // ✅ NEW FIELD
    };

    const material = await materialService.updateMaterialRequest(
      req.params.id,
      updateData,
      req.user.id,
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: `Material Request updated successfully (${material.language === 'ar' ? 'Arabic' : 'English'})`,
      data: material
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE MATERIAL REQUEST (Super Admin Only)
 */
router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    await materialService.deleteMaterialRequest(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Material Request deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ GENERATE MATERIAL REQUEST PDF (WITH OPTIONAL ATTACHMENT AND TERMS & CONDITIONS)
 * POST /api/materials/:id/generate-pdf
 * 
 * The includeStaticFile logic is handled in the service layer
 */
router.post('/:id/generate-pdf', upload.single('attachment'), async (req, res, next) => {
  try {
    const attachmentPdf = req.file ? req.file.buffer : null;

    const result = await materialService.generateMaterialPDF(
      req.params.id,
      req.user.id,
      req.user.role,
      attachmentPdf
    );

    const responseData = {
      mrId: result.material.id,
      mrNumber: result.material.mrNumber,
      pdfFilename: result.pdf.filename,
      language: result.pdf.language,
      downloadUrl: `/api/materials/${req.params.id}/download-pdf`,
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
 * DOWNLOAD MATERIAL REQUEST PDF
 * GET /api/materials/:id/download-pdf
 */
router.get('/:id/download-pdf', async (req, res, next) => {
  try {
    const material = await materialService.getMaterialRequestById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    if (!material.pdfFilename) {
      return res.status(404).json({
        success: false,
        message: 'PDF not generated yet. Please generate PDF first.'
      });
    }

    const pdfPath = path.join(__dirname, '../../data/materials-requests/pdfs', material.pdfFilename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    res.download(pdfPath, `MR_${material.mrNumber}.pdf`, (err) => {
      if (err) next(err);
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;