// ============================================
// src/routes/suppliers.routes.js
// ============================================

const express = require('express');
const router = express.Router();
const supplierService = require('../services/supplier.service');
const { protect ,checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// ============================================
// PUBLIC ROUTES (Authenticated users)
// ============================================

/**
 * @route   GET /api/suppliers
 * @desc    Get all suppliers with optional filters
 * @access  Authenticated
 * @query   status, materialType, country, city, minRating
 */
router.use(checkRouteAccess('supplierManagement'));

router.get('/', protect, async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status,
      materialType: req.query.materialType,
      country: req.query.country,
      city: req.query.city,
      minRating: req.query.minRating
    };
    
    const suppliers = await supplierService.getAllSuppliers(filters);
    
    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/suppliers/search
 * @desc    Search suppliers by query
 * @access  Authenticated
 * @query   q (search query)
 */
router.get('/search', protect, async (req, res, next) => {
  try {
    const query = req.query.q || '';
    
    const suppliers = await supplierService.searchSuppliers(query);
    
    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/suppliers/statistics
 * @desc    Get supplier statistics
 * @access  Authenticated
 */
router.get('/statistics', protect, async (req, res, next) => {
  try {
    const stats = await supplierService.getStatistics();
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/suppliers/material/:materialType
 * @desc    Get suppliers by material type
 * @access  Authenticated
 */
router.get('/material/:materialType', protect, async (req, res, next) => {
  try {
    const suppliers = await supplierService.getSuppliersByMaterial(req.params.materialType);
    
    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/suppliers/:id
 * @desc    Get single supplier by ID
 * @access  Authenticated
 */
router.get('/:id', protect, async (req, res, next) => {
  try {
    const supplier = await supplierService.getSupplierById(req.params.id);
    
    res.status(200).json({
      success: true,
      data: supplier
    });
  } catch (err) {
    if (err.message === 'Supplier not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

// ============================================
// SUPER ADMIN ONLY ROUTES
// ============================================

/**
 * @route   POST /api/suppliers
 * @desc    Add new supplier
 * @access  Super Admin only
 */
router.post('/', protect, restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { name, email, phone } = req.body;
    
    // Validation
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and phone are required fields'
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
    // Add createdBy from authenticated user
    const supplierData = {
      ...req.body,
      createdBy: req.user?.id || req.user?.username || null
    };

    const supplier = await supplierService.addSupplier(supplierData);
    
    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: supplier
    });
  } catch (err) {
    if (err.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

/**
 * @route   PUT /api/suppliers/:id
 * @desc    Update supplier
 * @access  Super Admin only
 */
router.put('/:id', protect, restrictTo('super_admin'), async (req, res, next) => {
  try {
    // Email validation if email is being updated
    if (req.body.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(req.body.email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
    }

    // Add updatedBy from authenticated user
    const updateData = {
      ...req.body,
      updatedBy: req.user?.id || req.user?.username || null
    };

    const supplier = await supplierService.updateSupplier(req.params.id, updateData);
    
    res.status(200).json({
      success: true,
      message: 'Supplier updated successfully',
      data: supplier
    });
  } catch (err) {
    if (err.message === 'Supplier not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    if (err.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

/**
 * @route   PATCH /api/suppliers/:id/status
 * @desc    Update supplier status
 * @access  Super Admin only
 */
router.patch('/:id/status', protect, restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Status is required'
      });
    }

    const supplier = await supplierService.updateSupplierStatus(req.params.id, status);
    
    res.status(200).json({
      success: true,
      message: 'Supplier status updated successfully',
      data: supplier
    });
  } catch (err) {
    if (err.message === 'Supplier not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    if (err.message.includes('Invalid status')) {
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

/**
 * @route   DELETE /api/suppliers/:id
 * @desc    Delete supplier
 * @access  Super Admin only
 */
router.delete('/:id', protect, restrictTo('super_admin'), async (req, res, next) => {
  try {
    const supplier = await supplierService.deleteSupplier(req.params.id);
    
    res.status(200).json({
      success: true,
      message: 'Supplier deleted successfully',
      data: supplier
    });
  } catch (err) {
    if (err.message === 'Supplier not found') {
      return res.status(404).json({
        success: false,
        error: err.message
      });
    }
    next(err);
  }
});

/**
 * @route   POST /api/suppliers/bulk-import
 * @desc    Bulk import suppliers
 * @access  Super Admin only
 */
router.post('/bulk-import', protect, restrictTo('super_admin'), async (req, res, next) => {
  try {
    const { suppliers } = req.body;
    
    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Suppliers array is required and must not be empty'
      });
    }

    const createdBy = req.user?.id || req.user?.username || null;
    const results = await supplierService.bulkImportSuppliers(suppliers, createdBy);
    
    res.status(200).json({
      success: true,
      message: `Bulk import completed: ${results.success.length} succeeded, ${results.failed.length} failed`,
      data: results
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;