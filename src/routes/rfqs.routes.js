// src/routes/rfqs.routes.js - COMPLETE RFQ ROUTES WITH PDF AND ATTACHMENT
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const rfqService = require('../services/rfq.service');
const { protect,checkRouteAccess } = require('../middleware/auth.middleware');
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
 * 1. RESET COUNTER - Super admin only
 * POST /api/rfqs/reset-counter
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
 * 2. GET RFQ STATISTICS
 * GET /api/rfqs/stats
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
 * 3. CREATE RFQ (Auto-detect language from data)
 * POST /api/rfqs
 * Body: {
 *   date, time, requester, production, supplier, urgent, 
 *   items: [{ description, unit, quantity, unitPriceExternal, unitPriceInternal }],
 *   notes
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const rfqData = {
      date: req.body.date,
      time: req.body.time,
      requester: req.body.requester,
      production: req.body.production,
      supplier: req.body.supplier,
      urgent: req.body.urgent,
      items: req.body.items || [],
      notes: req.body.notes
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
 * 4. GET ALL RFQs
 * GET /api/rfqs
 * Query params: rfqNumber, startDate, endDate, supplier, production, status, urgent, search, page, limit
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
 * 5. GET SPECIFIC RFQ (By ID)
 * GET /api/rfqs/:id
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
 * 6. UPDATE RFQ (Auto-detect language from data)
 * PUT /api/rfqs/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    const updateData = {
      date: req.body.date,
      time: req.body.time,
      requester: req.body.requester,
      production: req.body.production,
      supplier: req.body.supplier,
      urgent: req.body.urgent,
      items: req.body.items,
      notes: req.body.notes,
      status: req.body.status
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
 * 7. DELETE RFQ (Super Admin Only)
 * DELETE /api/rfqs/:id
 */
router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    await rfqService.deleteRFQ(req.params.id);

    res.status(200).json({
      success: true,
      message: 'RFQ deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 8. GENERATE RFQ PDF (with optional attachment support)
 * POST /api/rfqs/:id/generate-pdf
 * Supports multipart/form-data with optional 'attachment' field
 */
router.post('/:id/generate-pdf', upload.single('attachment'), async (req, res, next) => {
  try {
    // Extract attachment buffer if provided
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

    // Include page count if merge was successful
    if (result.pdf.pageCount) {
      responseData.pageCount = result.pdf.pageCount;
    }

    // Include merge error if it occurred
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
 * 9. DOWNLOAD RFQ PDF
 * GET /api/rfqs/:id/download-pdf
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