// src/routes/rfqs.routes.js - FIXED WITH includeStaticFile SUPPORT

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const rfqService = require('../services/rfq.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.use(checkRouteAccess('purchaseManagement'));

// Configure multer for PDF uploads (memory storage)
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

/**
 * RESET COUNTER - Super admin only
 */
router.post('/reset-counter', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const result = await rfqService.resetRFQCounter();

    res.status(200).json({
      success: true,
      message: 'RFQ counter reset successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET RFQ STATISTICS
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await rfqService.getRFQStats(req.user.id, req.user.role);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ CREATE RFQ - Now accepts includeStaticFile
 */
router.post('/', async (req, res, next) => {
  try {
    const rfqData = {
      date: req.body.date,
      time: req.body.time,
      requester: req.body.requester,
      production: req.body.production,
      supplier: req.body.supplier,
      supplierAddress: req.body.supplierAddress,
      urgent: req.body.urgent === true || req.body.urgent === 'true',
      items: req.body.items || [],
      notes: req.body.notes,
      includeStaticFile: req.body.includeStaticFile === true || req.body.includeStaticFile === 'true' // ✅ NEW FIELD
    };

    const rfq = await rfqService.createRFQ(
      rfqData, 
      req.user.id,
      req.user.role
    );

    res.status(201).json({
      success: true,
      message: `RFQ created successfully (${rfq.language === 'ar' ? 'Arabic' : 'English'})`,
      data: rfq
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET ALL RFQs
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      rfqNumber, 
      startDate, 
      endDate, 
      supplier, 
      production,
      status,
      urgent,
      search, 
      page, 
      limit 
    } = req.query;

    const result = await rfqService.getAllRFQs(
      {
        rfqNumber,
        startDate,
        endDate,
        supplier,
        production,
        status,
        urgent,
        search,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      },
      req.user.id,
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: result.rfqs,
      pagination: result.pagination,
      userRole: req.user.role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET SPECIFIC RFQ (By ID)
 */
router.get('/:id', async (req, res, next) => {
  try {
    const rfq = await rfqService.getRFQById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: rfq
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ UPDATE RFQ - Now accepts includeStaticFile
 */
router.put('/:id', async (req, res, next) => {
  try {
    const updateData = {
      date: req.body.date,
      time: req.body.time,
      requester: req.body.requester,
      production: req.body.production,
      supplier: req.body.supplier,
      supplierAddress: req.body.supplierAddress,
      urgent: req.body.urgent !== undefined ? (req.body.urgent === true || req.body.urgent === 'true') : undefined,
      items: req.body.items,
      notes: req.body.notes,
      status: req.body.status,
      includeStaticFile: req.body.includeStaticFile !== undefined 
        ? (req.body.includeStaticFile === true || req.body.includeStaticFile === 'true')
        : undefined // ✅ NEW FIELD
    };

    const rfq = await rfqService.updateRFQ(
      req.params.id, 
      updateData, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: `RFQ updated successfully (${rfq.language === 'ar' ? 'Arabic' : 'English'})`,
      data: rfq
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ DELETE RFQ - UPDATED
 * Super Admin: Can delete any RFQ
 * Admin/Employee: Can delete only their own RFQs
 */
router.delete('/:id', async (req, res, next) => {
  try {
    // First, get the RFQ to check ownership
    const rfq = await rfqService.getRFQById(
      req.params.id,
      req.user.id,
      req.user.role
    );

    // Super admin can delete any RFQ
    if (req.user.role === 'super_admin') {
      await rfqService.deleteRFQ(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'RFQ deleted successfully'
      });
    }

    // Admin and employee can only delete their own RFQs
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (rfq.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this RFQ'
        });
      }
      await rfqService.deleteRFQ(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'RFQ deleted successfully'
      });
    }

    // Other roles cannot delete
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete RFQs'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GENERATE RFQ PDF (with optional attachment support)
 * ✅ The includeStaticFile logic is now handled in the service layer
 */
router.post('/:id/generate-pdf', upload.single('attachment'), async (req, res, next) => {
  try {
    const attachmentPdf = req.file ? req.file.buffer : null;

    const result = await rfqService.generateRFQPDF(
      req.params.id, 
      req.user.id, 
      req.user.role,
      attachmentPdf
    );

    const responseData = {
      rfqId: result.rfq.id,
      rfqNumber: result.rfq.rfqNumber,
      pdfFilename: result.pdf.filename,
      language: result.pdf.language,
      downloadUrl: `/api/rfqs/${req.params.id}/download-pdf`,
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
 * DOWNLOAD RFQ PDF
 */
router.get('/:id/download-pdf', async (req, res, next) => {
  try {
    const rfq = await rfqService.getRFQById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    if (!rfq.pdfFilename) {
      return res.status(404).json({
        success: false,
        message: 'PDF not generated yet. Please generate PDF first.'
      });
    }

    const pdfPath = path.join(__dirname, '../../data/rfqs/pdfs', rfq.pdfFilename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    res.download(pdfPath, `RFQ_${rfq.rfqNumber}.pdf`, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;