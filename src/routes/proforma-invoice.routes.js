// src/routes/proforma-invoice.routes.js - UPDATED WITH includeStaticFile SUPPORT
const express = require('express');
const router = express.Router();
const multer = require('multer');
const proformaInvoiceService = require('../services/proforma-invoice.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
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

// All routes require authentication
router.use(protect);
router.use(checkRouteAccess('proformaInvoices'));

/**
 * @route   POST /api/proforma-invoices
 * @desc    Create a new proforma invoice
 * @access  Private (Admin, Employee with permission, Super Admin)
 * ✅ UPDATED: Now accepts includeStaticFile parameter
 */
router.post('/', upload.single('attachment'), async (req, res, next) => {
  try {
    const {
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      projectName,
      date,
      revNumber,
      validForDays,
      language,
      includeTax,
      taxRate,
      items,
      customNotes,
      includeStaticFile // ✅ NEW FIELD
    } = req.body;

    // Validate required fields
    if (!clientName || !date || !clientPhone) {
      return res.status(400).json({
        success: false,
        message: 'Client name, date, and phone are required'
      });
    }

    // Parse items if it's a string (from form-data)
    let parsedItems = items;
    if (typeof items === 'string') {
      try {
        parsedItems = JSON.parse(items);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Items must be a valid JSON array'
        });
      }
    }

    if (parsedItems && Array.isArray(parsedItems) && parsedItems.length > 0) {
      for (const item of parsedItems) {
        if (!item.description || item.quantity === undefined || item.unitPrice === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Each item must have description, quantity, and unit price'
          });
        }
      }
    } else {
      parsedItems = [];
    }

    const includeTaxBool = includeTax === 'true' || includeTax === true;
    
    if (includeTaxBool === true) {
      const parsedTaxRate = parseFloat(taxRate);
      if (!parsedTaxRate || parsedTaxRate <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Tax rate is required when tax is included'
        });
      }
    }

    if (language && !['arabic', 'english'].includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Language must be either "arabic" or "english"'
      });
    }

    const invoiceData = {
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      projectName,
      date,
      revNumber,
      validForDays,
      language: language || 'arabic',
      includeTax: includeTaxBool,
      taxRate: includeTaxBool ? parseFloat(taxRate) : 0,
      items: parsedItems,
      customNotes,
      includeStaticFile: includeStaticFile === true || includeStaticFile === 'true' // ✅ NEW FIELD
    };

    const invoice = await proformaInvoiceService.createInvoice(
      invoiceData,
      req.user,
      req.file
    );

    res.status(201).json({
      success: true,
      message: 'Proforma invoice created successfully',
      data: invoice
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/proforma-invoices
 * @desc    Get all proforma invoices
 * @access  Private (Super Admin sees all, Admin/Employee see only their own)
 */
router.get('/', async (req, res, next) => {
  try {
    const { search, page, limit, createdBy } = req.query;

    let filterCreatedBy = createdBy;

    if (req.user.role === 'super_admin') {
      filterCreatedBy = createdBy;
    } else if (req.user.role === 'admin' || req.user.role === 'employee') {
      filterCreatedBy = req.user.id;
    } else {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access proforma invoices'
      });
    }

    const result = await proformaInvoiceService.getAllInvoices({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      createdBy: filterCreatedBy
    });

    res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/proforma-invoices/my-invoices
 * @desc    Get all invoices by current user with pagination
 * @access  Private (Admin/Employee)
 */
router.get('/my-invoices', async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;

    const result = await proformaInvoiceService.getAllInvoices({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      createdBy: req.user.id
    });

    res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/proforma-invoices/my-latest
 * @desc    Get latest invoice by current user (Admin/Employee)
 * @access  Private
 */
router.get('/my-latest', async (req, res, next) => {
  try {
    const invoice = await proformaInvoiceService.getLatestInvoiceByUser(req.user.id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'No invoices found'
      });
    }

    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/proforma-invoices/:id/pdf
 * @desc    Download PDF of proforma invoice
 * @access  Private (Owner or Super Admin)
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await proformaInvoiceService.getInvoiceById(req.params.id);

    if (req.user.role !== 'super_admin' && invoice.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to download this PDF'
      });
    }

    // ✅ Generate custom filename for download
    const sanitizeFilename = (str) => {
      if (!str) return 'Unknown';
      return str.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, '_').substring(0, 30);
    };
    
    const formatDate = (dateStr) => {
      if (!dateStr) {
        const today = new Date().toISOString().split('T')[0];
        const [year, month, day] = today.split('-');
        return `${day}-${month}-${year}`;
      }
      const [year, month, day] = dateStr.split('-');
      return `${day}-${month}-${year}`;
    };
    
    const invoiceNumber = invoice.invoiceNumber || 'PI0000';
    const clientName = sanitizeFilename(invoice.clientName);
    const dateFormatted = formatDate(invoice.date);
    const downloadFilename = `${invoiceNumber}_${clientName}_${dateFormatted}.pdf`;

    console.log('📥 Download filename:', downloadFilename);
    console.log('📁 File path:', invoice.pdfPath);

    res.download(invoice.pdfPath, downloadFilename, (err) => {
      if (err) {
        console.error('Download error:', err);
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/proforma-invoices/:id
 * @desc    Update proforma invoice
 * @access  Private (Owner or Super Admin)
 * ✅ UPDATED: Now accepts includeStaticFile parameter
 */
router.put('/:id', upload.single('attachment'), async (req, res, next) => {
  try {
    const invoice = await proformaInvoiceService.getInvoiceById(req.params.id);

    if (req.user.role !== 'super_admin' && invoice.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this invoice'
      });
    }

    const {
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      projectName,
      date,
      revNumber,
      validForDays,
      language,
      includeTax,
      taxRate,
      items,
      customNotes,
      includeStaticFile // ✅ NEW FIELD
    } = req.body;

    let parsedItems = items;
    if (items && typeof items === 'string') {
      try {
        parsedItems = JSON.parse(items);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Items must be a valid JSON array'
        });
      }
    }

    if (parsedItems) {
      if (!Array.isArray(parsedItems)) {
        return res.status(400).json({
          success: false,
          message: 'Items must be an array'
        });
      }

      if (parsedItems.length > 0) {
        for (const item of parsedItems) {
          if (!item.description || item.quantity === undefined || item.unitPrice === undefined) {
            return res.status(400).json({
              success: false,
              message: 'Each item must have description, quantity, and unit price'
            });
          }
        }
      }
    }

    const includeTaxBool = includeTax === 'true' || includeTax === true;

    const updateData = {
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      projectName,
      date,
      revNumber,
      validForDays,
      language,
      includeTax: includeTaxBool,
      taxRate: includeTaxBool ? parseFloat(taxRate) : 0,
      items: parsedItems,
      customNotes,
      includeStaticFile: includeStaticFile !== undefined 
        ? (includeStaticFile === true || includeStaticFile === 'true')
        : undefined // ✅ NEW FIELD
    };

    const updatedInvoice = await proformaInvoiceService.updateInvoice(req.params.id, updateData, req.file);

    res.status(200).json({
      success: true,
      message: 'Proforma invoice updated successfully',
      data: updatedInvoice
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/proforma-invoices/:id
 * @desc    Delete proforma invoice
 * @access  Private (Super Admin can delete all, Admin/Employee can delete their own)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const invoice = await proformaInvoiceService.getInvoiceById(req.params.id);

    if (req.user.role === 'super_admin') {
      await proformaInvoiceService.deleteInvoice(req.params.id);
    } else if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (invoice.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this invoice'
        });
      }
      await proformaInvoiceService.deleteInvoice(req.params.id);
    } else {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete invoices'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Proforma invoice deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/proforma-invoices/:id/pdf
 * @desc    Download PDF of proforma invoice
 * @access  Private (Owner or Super Admin)
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const invoice = await proformaInvoiceService.getInvoiceById(req.params.id);

    if (req.user.role !== 'super_admin' && invoice.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to download this PDF'
      });
    }

    const filename = invoice.pdfPath.split('/').pop();

    res.download(invoice.pdfPath, filename, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/proforma-invoices/:id/send-email
 * @desc    Send invoice PDF by email
 * @access  Private (Owner or Super Admin)
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

    // Check permission
    const invoice = await proformaInvoiceService.getInvoiceById(req.params.id);
    if (req.user.role !== 'super_admin' && invoice.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to send this invoice'
      });
    }

    const result = await proformaInvoiceService.sendInvoiceByEmail(
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