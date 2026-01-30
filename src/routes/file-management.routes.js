// src/routes/file-management.routes.js
const express = require('express');
const router = express.Router();
const fileManagementService = require('../services/File-management.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// All routes require authentication and super_admin role ONLY
router.use(protect);
router.use(checkRouteAccess('fileManagement'));
router.use(restrictTo('super_admin'));

/**
 * @route   GET /api/file-management
 * @desc    Get all files with filters and pagination
 * @access  Super Admin ONLY
 * @query   type, category, extension, search, createdBy, startDate, endDate, sortBy, sortOrder, page, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      type,
      category,
      extension,
      search,
      createdBy,
      startDate,
      endDate,
      sortBy,
      sortOrder,
      page,
      limit
    } = req.query;

    const filters = {
      type,
      category,
      extension,
      search,
      createdBy,
      startDate,
      endDate,
      sortBy,
      sortOrder,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20
    };

    const result = await fileManagementService.getAllFiles(filters);

    res.status(200).json({
      success: true,
      data: result.files,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/statistics
 * @desc    Get file statistics
 * @access  Super Admin ONLY
 */
router.get('/statistics', async (req, res, next) => {
  try {
    const stats = await fileManagementService.getFileStatistics();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/storage-usage
 * @desc    Get storage usage by type
 * @access  Super Admin ONLY
 */
router.get('/storage-usage', async (req, res, next) => {
  try {
    const usage = await fileManagementService.getStorageUsageByType();

    res.status(200).json({
      success: true,
      data: usage
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/orphaned
 * @desc    Get orphaned files (files without metadata)
 * @access  Super Admin ONLY
 */
router.get('/orphaned', async (req, res, next) => {
  try {
    const result = await fileManagementService.getOrphanedFiles();

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/file-management/cleanup-orphaned
 * @desc    Delete all orphaned files
 * @access  Super Admin ONLY
 */
router.post('/cleanup-orphaned', async (req, res, next) => {
  try {
    const result = await fileManagementService.cleanupOrphanedFiles();

    res.status(200).json({
      success: true,
      message: `تم حذف ${result.deletedCount} ملف يتيم بنجاح`,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/duplicates
 * @desc    Get duplicate files
 * @access  Super Admin ONLY
 */
router.get('/duplicates', async (req, res, next) => {
  try {
    const result = await fileManagementService.getDuplicateFiles();

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/types
 * @desc    Get available file types and categories
 * @access  Super Admin ONLY
 */
router.get('/types', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      types: [
        { value: 'cuttingJobs', label: 'أعمال القص', icon: '✂️' },
        { value: 'quotations', label: 'عروض الأسعار', icon: '💰' },
        { value: 'quotationsAttachmentsAR', label: 'مرفقات العروض (عربي)', icon: '📎' },
        { value: 'quotationsAttachmentsEN', label: 'مرفقات العروض (English)', icon: '📎' },
        { value: 'receipts', label: 'إيصالات الاستلام', icon: '📋' },
        { value: 'secretariatForms', label: 'نماذج السكرتارية', icon: '📝' },
        { value: 'secretariatUserForms', label: 'نماذج المستخدمين', icon: '👤' },
        { value: 'rfqs', label: 'طلبات عروض الأسعار', icon: '📊' },
        { value: 'purchases', label: 'طلبات الشراء', icon: '🛒' },
        { value: 'materials', label: 'طلبات المواد', icon: '📦' },
        { value: 'filesPhysical', label: 'الملفات الفعلية', icon: '📁' }
      ],
      categories: [
        { value: 'pdf', label: 'PDF', icon: '📄' },
        { value: 'cad', label: 'CAD', icon: '📐' },
        { value: 'cnc', label: 'CNC', icon: '⚙️' },
        { value: 'image', label: 'صور', icon: '🖼️' },
        { value: 'document', label: 'مستندات', icon: '📃' },
        { value: 'other', label: 'أخرى', icon: '📎' }
      ],
      sortOptions: [
        { value: 'createdAt', label: 'تاريخ الإنشاء' },
        { value: 'modifiedAt', label: 'تاريخ التعديل' },
        { value: 'name', label: 'الاسم' },
        { value: 'size', label: 'الحجم' }
      ],
      sortOrders: [
        { value: 'asc', label: 'تصاعدي' },
        { value: 'desc', label: 'تنازلي' }
      ]
    }
  });
});

/**
 * @route   GET /api/file-management/:id
 * @desc    Get specific file details
 * @access  Super Admin ONLY
 */
router.get('/:id', async (req, res, next) => {
  try {
    const file = await fileManagementService.getFileById(req.params.id);

    res.status(200).json({
      success: true,
      data: file
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/:id/download
 * @desc    Download file
 * @access  Super Admin ONLY
 */
router.get('/:id/download', async (req, res, next) => {
  try {
    const fileInfo = await fileManagementService.getFileForDownload(req.params.id);

    res.download(fileInfo.path, fileInfo.name, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/:id/preview
 * @desc    Preview file (for PDFs and images)
 * @access  Super Admin ONLY
 */
router.get('/:id/preview', async (req, res, next) => {
  try {
    const fileInfo = await fileManagementService.getFileForDownload(req.params.id);

    // Set appropriate content type
    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', 'inline');

    // Send file
    res.sendFile(fileInfo.path);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/file-management/:id
 * @desc    Delete file
 * @access  Super Admin ONLY
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await fileManagementService.deleteFile(req.params.id);

    res.status(200).json({
      success: true,
      message: 'تم حذف الملف بنجاح',
      data: result.file
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/file-management/bulk-delete
 * @desc    Delete multiple files
 * @access  Super Admin ONLY
 */
router.post('/bulk-delete', async (req, res, next) => {
  try {
    const { fileIds } = req.body;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يجب توفير قائمة بمعرفات الملفات'
      });
    }

    const results = [];
    const errors = [];

    for (const fileId of fileIds) {
      try {
        const result = await fileManagementService.deleteFile(fileId);
        results.push(result);
      } catch (error) {
        errors.push({
          fileId,
          error: error.message
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `تم حذف ${results.length} ملف بنجاح`,
      data: {
        deleted: results.length,
        errors: errors.length,
        deletedFiles: results,
        failedFiles: errors
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/export/list
 * @desc    Export file list as JSON
 * @access  Super Admin ONLY
 */
router.get('/export/list', async (req, res, next) => {
  try {
    const { files } = await fileManagementService.getAllFiles({ limit: 999999 });

    const exportData = files.map(f => ({
      name: f.name,
      type: f.type,
      category: f.category,
      extension: f.extension,
      size: f.sizeFormatted,
      documentNumber: f.documentNumber,
      createdBy: f.createdBy,
      createdByRole: f.createdByRole,
      createdAt: f.createdAt,
      modifiedAt: f.modifiedAt,
      path: f.relativePath,
      projectName: f.projectName,
      clientName: f.clientName,
      supplier: f.supplier,
      requester: f.requester
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="files-export-${Date.now()}.json"`);
    res.status(200).json(exportData);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/file-management/export/csv
 * @desc    Export file list as CSV
 * @access  Super Admin ONLY
 */
router.get('/export/csv', async (req, res, next) => {
  try {
    const { files } = await fileManagementService.getAllFiles({ limit: 999999 });

    // Create CSV header
    const headers = [
      'Name',
      'Type',
      'Category',
      'Extension',
      'Size',
      'Document Number',
      'Created By',
      'Role',
      'Created At',
      'Modified At',
      'Path'
    ];

    // Create CSV rows
    const rows = files.map(f => [
      f.name,
      f.type,
      f.category,
      f.extension,
      f.sizeFormatted,
      f.documentNumber || '',
      f.createdBy || '',
      f.createdByRole || '',
      f.createdAt,
      f.modifiedAt,
      f.relativePath
    ]);

    // Combine header and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="files-export-${Date.now()}.csv"`);
    res.status(200).send(csvContent);
  } catch (error) {
    next(error);
  }
});

module.exports = router;