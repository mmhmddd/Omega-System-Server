// src/routes/receipts.routes.js - UPDATED WITH OPTIONAL ITEMS
const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const receiptService = require('../services/receipt.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware'); 
const { restrictTo } = require('../middleware/role.middleware');

router.use(protect);
router.use(checkRouteAccess('receipts')); 

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
 * ✅ UPDATED: CREATE receipt - Items are now OPTIONAL
 */
router.post('/', async (req, res, next) => {
  try {
    // ✅ Parse items - can be empty array
    let parsedItems = [];
    if (req.body.items && Array.isArray(req.body.items)) {
      parsedItems = req.body.items;
    }
    
    const receiptData = {
      to: req.body.to,
      date: req.body.date,
      address: req.body.address,
      addressTitle: req.body.addressTitle,
      attention: req.body.attention,
      projectCode: req.body.projectCode,
      workLocation: req.body.workLocation,
      companyNumber: req.body.companyNumber,
      additionalText: req.body.additionalText,
      items: parsedItems, // ✅ Can be empty array
      notes: req.body.notes
    };

    const receipt = await receiptService.createReceipt(
      receiptData, 
      req.user.id,
      req.user.role
    );

    res.status(201).json({
      success: true,
      message: 'Receipt created successfully',
      data: receipt
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET all receipts - Role-based filtering applied
 */
router.get('/', async (req, res, next) => {
  try {
    const { receiptNumber, startDate, endDate, to, search, page, limit } = req.query;

    const result = await receiptService.getAllReceipts(
      {
        receiptNumber,
        startDate,
        endDate,
        to,
        search,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      },
      req.user.id,
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: result.receipts,
      pagination: result.pagination,
      userRole: req.user.role
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await receiptService.getReceiptStats(req.user.id, req.user.role);

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
    const newCounter = req.body && req.body.newCounter !== undefined 
      ? req.body.newCounter 
      : 0;
    
    const result = await receiptService.resetReceiptCounter(newCounter);

    res.status(200).json({
      success: true,
      message: 'Receipt counter reset successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET receipt by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const receipt = await receiptService.getReceiptById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET receipt by number
 */
router.get('/number/:receiptNumber', async (req, res, next) => {
  try {
    const receipt = await receiptService.getReceiptByNumber(
      req.params.receiptNumber, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ UPDATED: UPDATE receipt - Items are now OPTIONAL
 */
router.put('/:id', async (req, res, next) => {
  try {
    // ✅ Parse items - can be empty array
    let parsedItems = undefined;
    if (req.body.items !== undefined) {
      if (Array.isArray(req.body.items)) {
        parsedItems = req.body.items; // Can be empty array
      }
    }
    
    const updateData = {
      to: req.body.to,
      date: req.body.date,
      address: req.body.address,
      addressTitle: req.body.addressTitle,
      attention: req.body.attention,
      projectCode: req.body.projectCode,
      workLocation: req.body.workLocation,
      companyNumber: req.body.companyNumber,
      additionalText: req.body.additionalText,
      items: parsedItems, // ✅ Can be empty array or undefined
      notes: req.body.notes
    };

    const receipt = await receiptService.updateReceipt(
      req.params.id, 
      updateData, 
      req.user.id, 
      req.user.role
    );

    res.status(200).json({
      success: true,
      message: 'Receipt updated successfully',
      data: receipt
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE receipt - Super admin only
 */
router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    await receiptService.deleteReceipt(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Receipt deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GENERATE PDF (with optional attachment support)
 */
router.post('/:id/generate-pdf', upload.single('attachment'), async (req, res, next) => {
  try {
    const attachmentPdf = req.file ? req.file.buffer : null;

    const result = await receiptService.generateReceiptPDF(
      req.params.id, 
      req.user.id, 
      req.user.role,
      attachmentPdf
    );

    const responseData = {
      receiptId: result.receipt.id,
      receiptNumber: result.receipt.receiptNumber,
      pdfFilename: result.pdf.filename,
      language: result.pdf.language,
      downloadUrl: `/api/receipts/${req.params.id}/download-pdf`,
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
 * DOWNLOAD PDF
 */
router.get('/:id/download-pdf', async (req, res, next) => {
  try {
    const receipt = await receiptService.getReceiptById(
      req.params.id, 
      req.user.id, 
      req.user.role
    );

    if (!receipt.pdfFilename) {
      return res.status(404).json({
        success: false,
        message: 'PDF not generated yet. Please generate PDF first.'
      });
    }

    const pdfPath = path.join(__dirname, '../../data/receipts/pdfs', receipt.pdfFilename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    res.download(pdfPath, `Receipt_${receipt.receiptNumber}.pdf`, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;