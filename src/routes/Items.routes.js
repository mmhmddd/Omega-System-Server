// ============================================
// src/routes/Items.routes.js - UPDATED WITH EXCEL EXPORT
// ============================================

const express = require('express');
const router = express.Router();
const itemsService = require('../services/Items.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// Apply route access check to all routes
router.use(protect);
router.use(checkRouteAccess('itemsControl'));

/**
 * @route   POST /api/items
 * @desc    Create new item
 * @access  Private (Admin & Super Admin only)
 */
router.post('/', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, description, unit } = req.body;

    const item = await itemsService.createItem(
      { name, description, unit },
      req.user.id
    );

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الصنف بنجاح',
      data: item
    });
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'فشل إنشاء الصنف'
    });
  }
});

/**
 * @route   GET /api/items
 * @desc    Get all items with pagination and search
 * @access  Private (All authenticated users)
 */
router.get('/', async (req, res) => {
  try {
    const { page, limit, search } = req.query;

    const result = await itemsService.getAllItems({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      search: search || ''
    });

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل جلب الأصناف'
    });
  }
});

/**
 * @route   GET /api/items/export/excel
 * @desc    Export items to Excel file
 * @access  Private (All authenticated users)
 * @note    IMPORTANT: This route MUST be before /api/items/:id to avoid route conflict
 */
router.get('/export/excel', async (req, res) => {
  try {
    const { search } = req.query;

    // Generate Excel file
    const excelBuffer = await itemsService.exportItemsToExcel({
      search: search || ''
    });

    // Generate filename with current date and time
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
    const filename = `items-export-${dateStr}-${timeStr}.xlsx`;

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Content-Length', excelBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    // Send file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting items to Excel:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل تصدير الأصناف إلى Excel'
    });
  }
});

/**
 * @route   GET /api/items/simple
 * @desc    Get all items in simple format (id and name only)
 * @access  Private (All authenticated users)
 * @note    IMPORTANT: This route MUST be before /api/items/:id to avoid route conflict
 */
router.get('/simple', async (req, res) => {
  try {
    const items = await itemsService.getAllItemsSimple();

    res.status(200).json({
      success: true,
      data: items
    });
  } catch (error) {
    console.error('Error fetching simple items:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'فشل جلب الأصناف'
    });
  }
});

/**
 * @route   GET /api/items/:id
 * @desc    Get item by ID
 * @access  Private (All authenticated users)
 * @note    This route MUST come AFTER specific routes like /export/excel and /simple
 */
router.get('/:id', async (req, res) => {
  try {
    const item = await itemsService.getItemById(req.params.id);

    res.status(200).json({
      success: true,
      data: item
    });
  } catch (error) {
    console.error('Error fetching item:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'الصنف غير موجود'
    });
  }
});

/**
 * @route   PUT /api/items/:id
 * @desc    Update item
 * @access  Private (Admin & Super Admin only)
 */
router.put('/:id', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, description, unit } = req.body;

    const item = await itemsService.updateItem(
      req.params.id,
      { name, description, unit },
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: 'تم تحديث الصنف بنجاح',
      data: item
    });
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'فشل تحديث الصنف'
    });
  }
});

/**
 * @route   DELETE /api/items/:id
 * @desc    Delete item
 * @access  Private (Admin & Super Admin only)
 */
router.delete('/:id', restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await itemsService.deleteItem(req.params.id);

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.item
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'فشل حذف الصنف'
    });
  }
});

module.exports = router;