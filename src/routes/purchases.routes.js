// src/routes/purchases.routes.js - WITH includeStaticFile SUPPORT

const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const purchaseService = require('../services/purchase.service');
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
 * RESET PO COUNTER - Super admin only
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
 * GET PO STATISTICS
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
 * ✅ CREATE PURCHASE ORDER - Now accepts includeStaticFile
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
      notes: req.body.notes,
      includeStaticFile: req.body.includeStaticFile === true || req.body.includeStaticFile === 'true' // ✅ NEW FIELD
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
 * GET ALL PURCHASE ORDERS
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
 * GET SPECIFIC PURCHASE ORDER (By ID)
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
 * ✅ UPDATE PURCHASE ORDER - Now accepts includeStaticFile
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
      status: req.body.status,
      includeStaticFile: req.body.includeStaticFile !== undefined 
        ? (req.body.includeStaticFile === true || req.body.includeStaticFile === 'true')
        : undefined // ✅ NEW FIELD
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
 * ✅ DELETE PURCHASE ORDER - UPDATED
 * Super Admin: Can delete any purchase order
 * Admin/Employee: Can delete only their own purchase orders
 */
router.delete('/:id', async (req, res, next) => {
  try {
    // First, get the purchase order to check ownership
    const po = await purchaseService.getPOById(
      req.params.id,
      req.user.id,
      req.user.role
    );

    // Super admin can delete any purchase order
    if (req.user.role === 'super_admin') {
      await purchaseService.deletePO(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Purchase Order deleted successfully'
      });
    }

    // Admin and employee can only delete their own purchase orders
    if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (po.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this purchase order'
        });
      }
      await purchaseService.deletePO(req.params.id);
      return res.status(200).json({
        success: true,
        message: 'Purchase Order deleted successfully'
      });
    }

    // Other roles cannot delete
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to delete purchase orders'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GENERATE PO PDF (with optional attachment support)
 * ✅ The includeStaticFile logic is now handled in the service layer
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
 * DOWNLOAD PO PDF
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
/**
 * ✅ POST /api/purchases/:id/send-email
 * Send Purchase Order PDF by email
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
    const po = await purchaseService.getPOById(
      req.params.id,
      req.user.id,
      req.user.role
    );
    
    // Role-based access control
    if (req.user.role !== 'super_admin') {
      if (po.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to send this purchase order'
        });
      }
    }

    const result = await purchaseService.sendPOByEmail(
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
    console.error('❌ Error sending PO email:', error);
    next(error);
  }
});

module.exports = router;