// src/routes/purchases.routes.js - COMPLETE PURCHASE ORDER ROUTES
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const purchaseService = require('../services/purchase.service');
const { protect } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);

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
 * 1. RESET PO COUNTER - Super admin only
 * POST /api/purchases/reset-counter
 */
router.post('/reset-counter', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const result = await purchaseService.resetPOCounter();

    res.status(200).json({
      success: true,
      message: 'PO counter reset successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 2. GET PO STATISTICS
 * GET /api/purchases/stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await purchaseService.getPOStats(req.user.id, req.user.role);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 3. CREATE PURCHASE ORDER (Auto-detect language from data)
 * POST /api/purchases
 * Body: {
 *   date, supplier, supplierAddress, supplierPhone,
 *   receiver, receiverCity, receiverAddress, receiverPhone,
 *   tableHeaderText, taxRate, items: [{ description, unit, quantity, unitPrice }],
 *   notes
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const poData = {
      date: req.body.date,
      supplier: req.body.supplier,
      supplierAddress: req.body.supplierAddress,
      supplierPhone: req.body.supplierPhone,
      receiver: req.body.receiver,
      receiverCity: req.body.receiverCity,
      receiverAddress: req.body.receiverAddress,
      receiverPhone: req.body.receiverPhone,
      tableHeaderText: req.body.tableHeaderText,
      taxRate: req.body.taxRate,
      items: req.body.items || [],
      notes: req.body.notes
    };

    const po = await purchaseService.createPO(
      poData, 
      req.user.id,
      req.user.role
    );

    res.status(201).json({
      success: true,
      message: `Purchase Order created successfully (${po.language === 'ar' ? 'Arabic' : 'English'})`,
      data: po
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 4. GET ALL PURCHASE ORDERS
 * GET /api/purchases
 * Query params: poNumber, startDate, endDate, supplier, status, search, page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const { 
      poNumber, 
      startDate, 
      endDate, 
      supplier, 
      status,
      search, 
      page, 
      limit 
    } = req.query;

    const result = await purchaseService.getAllPOs(
      {
        poNumber,
        startDate,
        endDate,
        supplier,
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
      data: result.pos,
      pagination: result.pagination,
      userRole: req.user.role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 5. GET SPECIFIC PURCHASE ORDER (By ID)
 * GET /api/purchases/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const po = await purchaseService.getPOById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: po
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 6. UPDATE PURCHASE ORDER (Auto-detect language from data)
 * PUT /api/purchases/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    const updateData = {
      date: req.body.date,
      supplier: req.body.supplier,
      supplierAddress: req.body.supplierAddress,
      supplierPhone: req.body.supplierPhone,
      receiver: req.body.receiver,
      receiverCity: req.body.receiverCity,
      receiverAddress: req.body.receiverAddress,
      receiverPhone: req.body.receiverPhone,
      tableHeaderText: req.body.tableHeaderText,
      taxRate: req.body.taxRate,
      items: req.body.items,
      notes: req.body.notes,
      status: req.body.status
    };

    const po = await purchaseService.updatePO(
      req.params.id, 
      updateData, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: `Purchase Order updated successfully (${po.language === 'ar' ? 'Arabic' : 'English'})`,
      data: po
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 7. DELETE PURCHASE ORDER (Super Admin Only)
 * DELETE /api/purchases/:id
 */
router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    await purchaseService.deletePO(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Purchase Order deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 8. GENERATE PO PDF (with optional attachment support)
 * POST /api/purchases/:id/generate-pdf
 * Supports multipart/form-data with optional 'attachment' field
 */
router.post('/:id/generate-pdf', upload.single('attachment'), async (req, res, next) => {
  try {
    const attachmentPdf = req.file ? req.file.buffer : null;

    const result = await purchaseService.generatePOPDF(
      req.params.id, 
      req.user.id, 
      req.user.role,
      attachmentPdf
    );

    const responseData = {
      poId: result.po.id,
      poNumber: result.po.poNumber,
      pdfFilename: result.pdf.filename,
      language: result.pdf.language,
      downloadUrl: `/api/purchases/${req.params.id}/download-pdf`,
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
 * 9. DOWNLOAD PO PDF
 * GET /api/purchases/:id/download-pdf
 */
router.get('/:id/download-pdf', async (req, res, next) => {
  try {
    const po = await purchaseService.getPOById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    if (!po.pdfFilename) {
      return res.status(404).json({
        success: false,
        message: 'PDF not generated yet. Please generate PDF first.'
      });
    }

    const pdfPath = path.join(__dirname, '../../data/purchases/pdfs', po.pdfFilename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    res.download(pdfPath, `PO_${po.poNumber}.pdf`, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;