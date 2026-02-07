// src/routes/receipts.routes.js - UPDATED WITH CUSTOM FILENAME PATTERN
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
 * CREATE receipt
 */
router.post('/', async (req, res, next) => {
  try {
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
      items: parsedItems,
      notes: req.body.notes,
      includeStaticFile: req.body.includeStaticFile === true || req.body.includeStaticFile === 'true'
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
 * GET all receipts
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
 * UPDATE receipt
 */
router.put('/:id', async (req, res, next) => {
  try {
    let parsedItems = undefined;
    if (req.body.items !== undefined) {
      if (Array.isArray(req.body.items)) {
        parsedItems = req.body.items;
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
      items: parsedItems,
      notes: req.body.notes,
      includeStaticFile: req.body.includeStaticFile !== undefined 
        ? (req.body.includeStaticFile === true || req.body.includeStaticFile === 'true')
        : undefined
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
 * DELETE RECEIPT
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const receipt = await receiptService.getReceiptById(
      req.params.id,
      req.user.id,
      req.user.role
    );

    if (req.user.role === 'super_admin') {
      await receiptService.deleteReceipt(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Receipt deleted successfully'
      });
    }

    if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (receipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this receipt'
        });
      }
      await receiptService.deleteReceipt(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Receipt deleted successfully'
      });
    }

    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete receipts'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GENERATE PDF
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
 * ✅ UPDATED: DOWNLOAD PDF - Uses custom filename pattern
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

    // ✅ Use the stored filename which already has pattern: DN0005_Tarek_2026-02-07.pdf
    const downloadFilename = receipt.pdfFilename;

    res.download(pdfPath, downloadFilename, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ SEND RECEIPT VIA EMAIL
 */
router.post('/:id/send-email', async (req, res, next) => {
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

    const result = await receiptService.sendReceiptByEmail(
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