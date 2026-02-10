// src/routes/price-quote.routes.js - UPDATED WITH TERMS & CONDITIONS TEXT FIELD

const express = require('express');
const router = express.Router();
const multer = require('multer');
const priceQuoteService = require('../services/price-quote.service');
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
router.use(checkRouteAccess('priceQuotes'));

/**
 * @route   POST /api/price-quotes
 * @desc    Create a new price quote
 * @access  Private (Admin, Employee with permission, Super Admin)
 * ✅ UPDATED: Now accepts includeTermsAndConditions and termsAndConditionsText parameters
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
      includeTermsAndConditions, // ✅ NEW FIELD
      termsAndConditionsText // ✅ NEW FIELD
    } = req.body;

    console.log('📝 Creating Price Quote with Terms & Conditions:');
    console.log('  - includeTermsAndConditions:', includeTermsAndConditions);
    console.log('  - termsAndConditionsText length:', termsAndConditionsText ? termsAndConditionsText.length : 0);

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

    // ✅ Convert includeTermsAndConditions to boolean
    const includeTermsAndConditionsBool = includeTermsAndConditions === true || includeTermsAndConditions === 'true';

    const quoteData = {
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
      includeTermsAndConditions: includeTermsAndConditionsBool, // ✅ NEW FIELD
      termsAndConditionsText: includeTermsAndConditionsBool ? termsAndConditionsText : null // ✅ NEW FIELD
    };

    console.log('🔍 Final quoteData:');
    console.log('  - includeTermsAndConditions:', quoteData.includeTermsAndConditions);
    console.log('  - termsAndConditionsText:', quoteData.termsAndConditionsText ? 'YES' : 'NO');

    const quote = await priceQuoteService.createQuote(
      quoteData,
      req.user,
      req.file
    );

    res.status(201).json({
      success: true,
      message: 'Price quote created successfully',
      data: quote
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/price-quotes
 * @desc    Get all price quotes
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
        message: 'You do not have permission to access price quotes'
      });
    }

    const result = await priceQuoteService.getAllQuotes({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      createdBy: filterCreatedBy
    });

    res.status(200).json({
      success: true,
      data: result.quotes,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/price-quotes/my-quotes
 * @desc    Get all quotes by current user with pagination
 * @access  Private (Admin/Employee)
 */
router.get('/my-quotes', async (req, res, next) => {
  try {
    const { search, page, limit } = req.query;

    const result = await priceQuoteService.getAllQuotes({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      createdBy: req.user.id
    });

    res.status(200).json({
      success: true,
      data: result.quotes,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/price-quotes/my-latest
 * @desc    Get latest quote by current user (Admin/Employee)
 * @access  Private
 */
router.get('/my-latest', async (req, res, next) => {
  try {
    const quote = await priceQuoteService.getLatestQuoteByUser(req.user.id);

    if (!quote) {
      return res.status(404).json({
        success: false,
        message: 'No quotes found'
      });
    }

    res.status(200).json({
      success: true,
      data: quote
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ✅ UPDATED: GET /api/price-quotes/:id/pdf
 * @desc    Download PDF of price quote with custom filename pattern
 * @access  Private (Owner or Super Admin)
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const quote = await priceQuoteService.getQuoteById(req.params.id);

    if (req.user.role !== 'super_admin' && quote.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to download this PDF'
      });
    }

    if (!quote.pdfPath) {
      return res.status(404).json({
        success: false,
        message: 'PDF not found'
      });
    }

    const fs = require('fs');
    if (!fs.existsSync(quote.pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'PDF file not found'
      });
    }

    // ✅ Create custom download filename: Q0001_ClientName_DD-MM-YYYY.pdf
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
    
    const quoteNumber = quote.quoteNumber || 'Q0000';
    const clientName = sanitizeFilename(quote.clientName);
    const dateFormatted = formatDate(quote.date);
    const downloadFilename = `${quoteNumber}_${clientName}_${dateFormatted}.pdf`;

    console.log('📥 Download filename:', downloadFilename);
    console.log('📁 File path:', quote.pdfPath);

    res.download(quote.pdfPath, downloadFilename, (err) => {
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
 * @route   PUT /api/price-quotes/:id
 * @desc    Update price quote
 * @access  Private (Owner or Super Admin)
 * ✅ UPDATED: Now accepts includeTermsAndConditions and termsAndConditionsText parameters
 */
router.put('/:id', upload.single('attachment'), async (req, res, next) => {
  try {
    const quote = await priceQuoteService.getQuoteById(req.params.id);

    if (req.user.role !== 'super_admin' && quote.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this quote'
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
      includeTermsAndConditions, // ✅ NEW FIELD
      termsAndConditionsText // ✅ NEW FIELD
    } = req.body;

    console.log('📝 Updating Price Quote with Terms & Conditions:');
    console.log('  - includeTermsAndConditions:', includeTermsAndConditions);
    console.log('  - termsAndConditionsText length:', termsAndConditionsText ? termsAndConditionsText.length : 0);

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

    // ✅ Convert includeTermsAndConditions to boolean if provided
    let includeTermsAndConditionsBool;
    if (includeTermsAndConditions !== undefined) {
      includeTermsAndConditionsBool = includeTermsAndConditions === true || includeTermsAndConditions === 'true';
    }

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
      includeTermsAndConditions: includeTermsAndConditionsBool, // ✅ NEW FIELD
      termsAndConditionsText: includeTermsAndConditionsBool ? termsAndConditionsText : undefined // ✅ NEW FIELD
    };

    console.log('🔍 Final updateData:');
    console.log('  - includeTermsAndConditions:', updateData.includeTermsAndConditions);
    console.log('  - termsAndConditionsText:', updateData.termsAndConditionsText ? 'YES' : 'NO');

    const updatedQuote = await priceQuoteService.updateQuote(req.params.id, updateData, req.file);

    res.status(200).json({
      success: true,
      message: 'Price quote updated successfully',
      data: updatedQuote
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/price-quotes/:id
 * @desc    Delete price quote
 * @access  Private (Super Admin can delete all, Admin/Employee can delete their own)
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const quote = await priceQuoteService.getQuoteById(req.params.id);

    if (req.user.role === 'super_admin') {
      await priceQuoteService.deleteQuote(req.params.id);
    } else if (req.user.role === 'admin' || req.user.role === 'employee') {
      if (quote.createdBy !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this quote'
        });
      }
      await priceQuoteService.deleteQuote(req.params.id);
    } else {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete quotes'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Price quote deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/price-quotes/:id/send-email
 * @desc    Send quote PDF by email
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
    const quote = await priceQuoteService.getQuoteById(req.params.id);
    if (req.user.role !== 'super_admin' && quote.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to send this quote'
      });
    }

    const result = await priceQuoteService.sendQuoteByEmail(
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