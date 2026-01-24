// src/routes/price-quote.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const priceQuoteService = require('../services/price-quote.service');
const { protect } = require('../middleware/auth.middleware');
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

/**
 * @route   POST /api/price-quotes
 * @desc    Create a new price quote
 * @access  Private (Admin, Employee, Super Admin)
 */
router.post('/', upload.single('attachment'), async (req, res, next) => {
  try {
    const {
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      date,
      revNumber,
      validForDays,
      language,
      includeTax,
      taxRate,
      items,
      customNotes
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

    // Validate items
    if (!parsedItems || !Array.isArray(parsedItems) || parsedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item is required'
      });
    }

    // Validate each item
    for (const item of parsedItems) {
      if (!item.description || item.quantity === undefined || item.unitPrice === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Each item must have description, quantity, and unit price'
        });
      }
    }

    // Validate tax
    if (includeTax && (!taxRate || taxRate <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Tax rate is required when tax is included'
      });
    }

    // Validate language
    if (language && !['arabic', 'english'].includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Language must be either "arabic" or "english"'
      });
    }

    const quoteData = {
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      date,
      revNumber,
      validForDays,
      language: language || 'arabic',
      includeTax: includeTax === 'true' || includeTax === true,
      taxRate: includeTax ? parseFloat(taxRate) : 0,
      items: parsedItems,
      customNotes
    };

    const quote = await priceQuoteService.createQuote(quoteData, req.user.id, req.file);

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
 * @desc    Get all price quotes (Super Admin only)
 * @access  Super Admin
 */
router.get('/', restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { search, page, limit, createdBy } = req.query;

    const result = await priceQuoteService.getAllQuotes({
      search,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      createdBy
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
 * @route   GET /api/price-quotes/:id
 * @desc    Get specific price quote by ID
 * @access  Private
 */
router.get('/:id', async (req, res, next) => {
  try {
    const quote = await priceQuoteService.getQuoteById(req.params.id);

    // Check permissions: super_admin can see all, others only their own
    if (req.user.role !== 'super_admin' && quote.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this quote'
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
 * @route   PUT /api/price-quotes/:id
 * @desc    Update price quote
 * @access  Private (Owner or Super Admin)
 */
router.put('/:id', upload.single('attachment'), async (req, res, next) => {
  try {
    const quote = await priceQuoteService.getQuoteById(req.params.id);

    // Check permissions
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
      date,
      revNumber,
      validForDays,
      language,
      includeTax,
      taxRate,
      items,
      customNotes
    } = req.body;

    // Parse items if it's a string (from form-data)
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

    // Validate items if provided
    if (parsedItems) {
      if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one item is required'
        });
      }

      for (const item of parsedItems) {
        if (!item.description || item.quantity === undefined || item.unitPrice === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Each item must have description, quantity, and unit price'
          });
        }
      }
    }

    const updateData = {
      clientName,
      clientPhone,
      clientAddress,
      clientCity,
      date,
      revNumber,
      validForDays,
      language,
      includeTax: includeTax === 'true' || includeTax === true,
      taxRate: parseFloat(taxRate),
      items: parsedItems,
      customNotes
    };

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
 * @access  Super Admin only
 */
router.delete('/:id', restrictTo('super_admin'), async (req, res, next) => {
  try {
    await priceQuoteService.deleteQuote(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Price quote deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/price-quotes/:id/pdf
 * @desc    Download PDF of price quote
 * @access  Private (Owner or Super Admin)
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const quote = await priceQuoteService.getQuoteById(req.params.id);

    // Check permissions
    if (req.user.role !== 'super_admin' && quote.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to download this PDF'
      });
    }

    // Extract filename from path
    const filename = quote.pdfPath.split('/').pop();

    // Send PDF file
    res.download(quote.pdfPath, filename, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;