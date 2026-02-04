// src/routes/empty-receipts.routes.js - ENHANCED WITH EMAIL ENDPOINT (MATCHING RECEIPTS PATTERN)
const express = require('express');
const router = express.Router();
const path = require('path');
const emptyReceiptService = require('../services/empty-receipt.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// All routes require authentication
router.use(protect);
router.use(checkRouteAccess('empty-receipts'));

/**
 * GET /api/empty-receipts/stats
 * Get empty receipts statistics (role-based)
 */
router.get('/stats', async (req, res, next) => {
  try {
    console.log('📊 GET /api/empty-receipts/stats');
    
    // Role-based filtering
    let userId = undefined;
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      userId = req.user.id;
    }
    
    const stats = await emptyReceiptService.getStats(userId);
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error in GET /api/empty-receipts/stats:', error);
    next(error);
  }
});

/**
 * POST /api/empty-receipts/reset-counter
 * Reset empty receipt counter (super admin only)
 */
router.post('/reset-counter', restrictTo('super_admin'), async (req, res, next) => {
  try {
    console.log('🔄 POST /api/empty-receipts/reset-counter');
    const result = await emptyReceiptService.resetCounter();
    res.status(200).json({
      success: true,
      message: 'معلومات العداد',
      data: result
    });
  } catch (error) {
    console.error('❌ Error in POST /api/empty-receipts/reset-counter:', error);
    next(error);
  }
});

/**
 * GET /api/empty-receipts/number/:receiptNumber
 * Get empty receipt by receipt number (role-based access)
 */
router.get('/number/:receiptNumber', async (req, res, next) => {
  try {
    console.log('🔍 GET /api/empty-receipts/number/' + req.params.receiptNumber);
    const receipt = await emptyReceiptService.getByReceiptNumber(req.params.receiptNumber);
    
    // Role-based access control
    if (req.user.role !== 'super_admin') {
      if (receipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this empty receipt'
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    console.error('❌ Error in GET /api/empty-receipts/number:', error);
    next(error);
  }
});

/**
 * GET /api/empty-receipts/:id/download-pdf
 * Download empty receipt PDF by ID (role-based access)
 */
router.get('/:id/download-pdf', async (req, res, next) => {
  try {
    console.log('⬇️ GET /api/empty-receipts/:id/download-pdf - ID:', req.params.id);
    
    // Check ownership
    const receipt = await emptyReceiptService.getById(req.params.id);
    
    // Role-based access control
    if (req.user.role !== 'super_admin') {
      if (receipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to download this PDF'
        });
      }
    }
    
    const pdfPath = await emptyReceiptService.getPdfPath(req.params.id);
    const filename = path.basename(pdfPath);
    
    res.download(pdfPath, filename, (err) => {
      if (err) {
        console.error('❌ Error downloading PDF:', err);
        next(err);
      }
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('not generated')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    console.error('❌ Error in GET /api/empty-receipts/:id/download-pdf:', error);
    next(error);
  }
});

/**
 * POST /api/empty-receipts/:id/generate-pdf
 * Generate PDF for empty receipt (role-based access)
 */
router.post('/:id/generate-pdf', async (req, res, next) => {
  try {
    console.log('📄 POST /api/empty-receipts/:id/generate-pdf - ID:', req.params.id);
    
    // Check ownership
    const existingReceipt = await emptyReceiptService.getById(req.params.id);
    
    // Role-based access control
    if (req.user.role !== 'super_admin') {
      if (existingReceipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to generate PDF for this receipt'
        });
      }
    }
    
    const receipt = await emptyReceiptService.generatePdf(req.params.id);
    res.status(200).json({
      success: true,
      message: 'تم إنشاء ملف PDF بنجاح',
      data: receipt
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    console.error('❌ Error in POST /api/empty-receipts/:id/generate-pdf:', error);
    next(error);
  }
});

/**
 * ✅ POST /api/empty-receipts/:id/send-email
 * Send empty receipt PDF by email (MATCHING RECEIPTS PATTERN)
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

    // Check ownership first
    const receipt = await emptyReceiptService.getById(req.params.id);
    
    // Role-based access control
    if (req.user.role !== 'super_admin') {
      if (receipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to send this empty receipt'
        });
      }
    }

    const result = await emptyReceiptService.sendReceiptByEmail(
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
    console.error('❌ Error sending email:', error);
    next(error);
  }
});

/**
 * POST /api/empty-receipts/generate
 * Generate empty receipt with header only
 */
router.post('/generate', async (req, res, next) => {
  try {
    const language = req.body.language || 'ar';
    
    if (!['ar', 'en'].includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid language. Must be "ar" or "en".'
      });
    }

    const userId = req.user.id;
    const userRole = req.user.role;
    
    console.log('📝 User info from middleware:', { userId, userRole });

    const result = await emptyReceiptService.generateEmptyReceiptPDF(
      language,
      userId,
      userRole
    );

    res.status(200).json({
      success: true,
      message: `Empty receipt generated successfully in ${language === 'ar' ? 'Arabic' : 'English'}`,
      data: {
        id: result.id,
        receiptNumber: result.receiptNumber,
        filename: result.filename,
        language: result.language,
        downloadUrl: `/api/empty-receipts/download/${result.filename}`
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/empty-receipts
 * Get all empty receipts with pagination and search (ROLE-BASED FILTERING)
 */
router.get('/', async (req, res, next) => {
  try {
    console.log('📥 GET /api/empty-receipts - Request received');
    console.log('👤 User:', req.user);
    console.log('🔍 Query params:', req.query);

    const { search, page, limit, sortBy, sortOrder, startDate, endDate, createdBy } = req.query;
    
    const params = {
      search: search || undefined,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc',
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      createdBy: createdBy || undefined
    };

    // ROLE-BASED FILTERING
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      params.createdBy = req.user.id;
      console.log('🔒 Filtering for user:', req.user.id);
    }

    const result = await emptyReceiptService.getAllEmptyReceipts(params);

    console.log('✅ Found receipts:', result.data.length);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
      userRole: req.user.role
    });
  } catch (error) {
    console.error('❌ Error in GET /api/empty-receipts:', error);
    next(error);
  }
});

/**
 * GET /api/empty-receipts/:id
 * Get empty receipt by ID (role-based access)
 */
router.get('/:id', async (req, res, next) => {
  try {
    if (req.params.id === 'download' || req.params.id === 'view') {
      return next();
    }

    console.log('🔍 GET /api/empty-receipts/:id - ID:', req.params.id);
    const receipt = await emptyReceiptService.getById(req.params.id);
    
    // Role-based access control
    if (req.user.role !== 'super_admin') {
      if (receipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this empty receipt'
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: receipt
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    console.error('❌ Error in GET /api/empty-receipts/:id:', error);
    next(error);
  }
});

/**
 * POST /api/empty-receipts
 * Create new empty receipt (without immediate PDF generation)
 */
router.post('/', async (req, res, next) => {
  try {
    console.log('➕ POST /api/empty-receipts - Create new receipt');
    
    const receiptData = {
      ...req.body,
      createdBy: req.user.id,
      createdByRole: req.user.role
    };

    const receipt = await emptyReceiptService.create(receiptData);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الإيصال الفارغ بنجاح',
      data: receipt
    });
  } catch (error) {
    console.error('❌ Error in POST /api/empty-receipts:', error);
    next(error);
  }
});

/**
 * PUT /api/empty-receipts/:id
 * Update empty receipt (role-based access)
 */
router.put('/:id', async (req, res, next) => {
  try {
    console.log('✏️ PUT /api/empty-receipts/:id - ID:', req.params.id);
    
    // Check ownership
    const existingReceipt = await emptyReceiptService.getById(req.params.id);
    
    // Role-based access control
    if (req.user.role !== 'super_admin') {
      if (existingReceipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this empty receipt'
        });
      }
    }
    
    const receipt = await emptyReceiptService.update(req.params.id, req.body);

    res.status(200).json({
      success: true,
      message: 'تم تحديث الإيصال الفارغ بنجاح',
      data: receipt
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    console.error('❌ Error in PUT /api/empty-receipts/:id:', error);
    next(error);
  }
});

/**
 * GET /api/empty-receipts/download/:filename
 * Download empty receipt PDF by filename (BACKWARD COMPATIBILITY)
 */
router.get('/download/:filename', async (req, res, next) => {
  try {
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.pdf')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    const pdfPath = emptyReceiptService.getPDFPath(filename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }
    
    res.download(pdfPath, filename, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/empty-receipts/view/:filename
 * View empty receipt PDF in browser (BACKWARD COMPATIBILITY)
 */
router.get('/view/:filename', async (req, res, next) => {
  try {
    const filename = req.params.filename;
    
    if (!filename || !filename.endsWith('.pdf')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    const pdfPath = emptyReceiptService.getPDFPath(filename);

    const fs = require('fs');
    if (!fs.existsSync(pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=' + filename);
    
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/empty-receipts/:id
 * Delete empty receipt (role-based permissions)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid receipt ID'
      });
    }

    // Check ownership
    const receipt = await emptyReceiptService.getById(id);

    // Super admin can delete any empty receipt
    if (req.user.role === 'super_admin') {
      await emptyReceiptService.deleteEmptyReceipt(id);
      return res.status(200).json({
        success: true,
        message: 'Empty receipt deleted successfully'
      });
    }

    // Admin and employee can only delete their own empty receipts
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (receipt.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this empty receipt'
        });
      }
      await emptyReceiptService.deleteEmptyReceipt(id);
      return res.status(200).json({
        success: true,
        message: 'Empty receipt deleted successfully'
      });
    }

    // Other roles cannot delete
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete empty receipts'
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
});

module.exports = router;