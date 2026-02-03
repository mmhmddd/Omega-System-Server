// src/routes/suppliers.routes.js - FIXED WITH CORRECT ROUTE KEY

const express = require('express');
const router = express.Router();
const supplierService = require('../services/supplier.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// All routes require authentication
router.use(protect);
router.use(checkRouteAccess('suppliers')); // ✅ FIXED: Changed from 'supplierManagement' to 'suppliers'

/**
 * @route   POST /api/suppliers
 * @desc    Create new supplier
 * @access  Private (Admin & Super Admin only)
 */
router.post('/', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const supplier = await supplierService.createSupplier(req.body, req.user.id);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء المورد بنجاح',
      data: supplier
    });
  } catch (error) {
    console.error('Error creating supplier:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'فشل إنشاء المورد'
    });
  }
});

/**
 * @route   GET /api/suppliers
 * @desc    Get all suppliers with optional filters
 * @access  Private (All authenticated users)
 */
router.get('/', async (req, res) => {
  try {
    const {
      status,
      materialType,
      country,
      city,
      minRating
    } = req.query;

    const filters = {};
    if (status) filters.status = status;
    if (materialType) filters.materialType = materialType;
    if (country) filters.country = country;
    if (city) filters.city = city;
    if (minRating) filters.minRating = parseFloat(minRating);

    const suppliers = await supplierService.getAllSuppliers(filters);

    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل جلب الموردين'
    });
  }
});

/**
 * @route   GET /api/suppliers/search
 * @desc    Search suppliers by query
 * @access  Private (All authenticated users)
 */
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter is required'
      });
    }

    const suppliers = await supplierService.searchSuppliers(q);

    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (error) {
    console.error('Error searching suppliers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل البحث عن الموردين'
    });
  }
});

/**
 * @route   GET /api/suppliers/material/:materialType
 * @desc    Get suppliers by material type
 * @access  Private (All authenticated users)
 */
router.get('/material/:materialType', async (req, res) => {
  try {
    const suppliers = await supplierService.getSuppliersByMaterial(req.params.materialType);

    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers
    });
  } catch (error) {
    console.error('Error fetching suppliers by material:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل جلب الموردين'
    });
  }
});

/**
 * @route   GET /api/suppliers/statistics
 * @desc    Get supplier statistics
 * @access  Private (Admin & Super Admin only)
 */
router.get('/statistics', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const statistics = await supplierService.getStatistics();

    res.status(200).json({
      success: true,
      data: statistics
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل جلب الإحصائيات'
    });
  }
});

/**
 * @route   GET /api/suppliers/:id
 * @desc    Get supplier by ID
 * @access  Private (All authenticated users)
 */
router.get('/:id', async (req, res) => {
  try {
    const supplier = await supplierService.getSupplierById(req.params.id);

    res.status(200).json({
      success: true,
      data: supplier
    });
  } catch (error) {
    console.error('Error fetching supplier:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'المورد غير موجود'
    });
  }
});

/**
 * @route   PUT /api/suppliers/:id
 * @desc    Update supplier
 * @access  Private (Admin & Super Admin only)
 */
router.put('/:id', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const supplier = await supplierService.updateSupplier(
      req.params.id,
      req.body,
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'تم تحديث المورد بنجاح',
      data: supplier
    });
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'فشل تحديث المورد'
    });
  }
});

/**
 * @route   PATCH /api/suppliers/:id/status
 * @desc    Update supplier status
 * @access  Private (Admin & Super Admin only)
 */
router.patch('/:id/status', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !['active', 'inactive', 'pending', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be: active, inactive, pending, or suspended'
      });
    }

    const supplier = await supplierService.updateSupplierStatus(
      req.params.id,
      status,
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'تم تحديث حالة المورد بنجاح',
      data: supplier
    });
  } catch (error) {
    console.error('Error updating supplier status:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'فشل تحديث حالة المورد'
    });
  }
});

/**
 * @route   DELETE /api/suppliers/:id
 * @desc    Delete supplier
 * @access  Private (Admin & Super Admin only)
 */
router.delete('/:id', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await supplierService.deleteSupplier(req.params.id);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.supplier
    });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'فشل حذف المورد'
    });
  }
});

/**
 * @route   POST /api/suppliers/bulk-import
 * @desc    Bulk import suppliers
 * @access  Private (Super Admin only)
 */
router.post('/bulk-import', restrictTo('super_admin'), async (req, res) => {
  try {
    const { suppliers } = req.body;

    if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Suppliers array is required and must not be empty'
      });
    }

    const result = await supplierService.bulkImportSuppliers(suppliers, req.user.id);

    res.status(200).json({
      success: true,
      message: 'Bulk import completed',
      data: result
    });
  } catch (error) {
    console.error('Error in bulk import:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل الاستيراد الجماعي'
    });
  }
});

module.exports = router;