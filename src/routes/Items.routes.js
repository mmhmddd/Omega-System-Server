// src/routes/Items.routes.js
const express = require('express');
const router = express.Router();
const itemsService = require('../services/Items.service');
const { protect ,checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

/**
 * @route   POST /api/items
 * @desc    Create new item
 * @access  Private (Admin & Super Admin only)
 */
router.post('/', protect, restrictTo('admin', 'super_admin'), async (req, res) => {
router.use(checkRouteAccess('items'));
  try {
    const { name, description } = req.body;

    const item = await itemsService.createItem(
      { name, description },
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
router.get('/', protect, async (req, res) => {
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
 * @route   GET /api/items/simple
 * @desc    Get all items in simple format (id and name only)
 * @access  Private (All authenticated users)
 */
router.get('/simple', protect, async (req, res) => {
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
 */
router.get('/:id', protect, async (req, res) => {
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
router.put('/:id', protect, restrictTo('admin', 'super_admin'), async (req, res) => {
  try {
    const { name, description } = req.body;

    const item = await itemsService.updateItem(
      req.params.id,
      { name, description },
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
router.delete('/:id', protect, restrictTo('admin', 'super_admin'), async (req, res) => {
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