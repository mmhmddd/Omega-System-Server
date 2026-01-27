// src/routes/secretariat-user.routes.js
const express = require('express');
const router = express.Router();
const secretariatUserService = require('../services/secretariat-user.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/user-forms
 * @desc    Create a new form (Employee/Admin/Super Admin)
 * @access  Employees with 'secretariatUserManagement' access, Admin, Super Admin
 */
router.post('/', 
  checkRouteAccess('secretariatUserManagement'), 
  async (req, res, next) => {
    try {
      const { formType, projectName, date } = req.body;

      if (!formType) {
        return res.status(400).json({
          success: false,
          message: 'نوع النموذج مطلوب'
        });
      }

      const validFormTypes = ['departure', 'vacation', 'advance', 'account_statement'];
      if (!validFormTypes.includes(formType)) {
        return res.status(400).json({
          success: false,
          message: 'نوع النموذج غير صحيح. الأنواع المتاحة: departure, vacation, advance, account_statement'
        });
      }

      const formData = {
        formType,
        projectName: projectName || null,
        date: date || new Date().toISOString().split('T')[0]
      };

      const form = await secretariatUserService.createForm(formData, req.user.id);

      res.status(201).json({
        success: true,
        message: 'تم إنشاء النموذج بنجاح وإرساله إلى السكرتارية',
        data: form
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/user-forms/my-forms
 * @desc    Get current user's forms
 * @access  Employees with 'secretariatUserManagement' access, Admin, Super Admin
 */
router.get('/my-forms', 
  checkRouteAccess('secretariatUserManagement'), 
  async (req, res, next) => {
    try {
      const { formType, status, page, limit } = req.query;

      const result = await secretariatUserService.getMyForms(req.user.id, {
        formType,
        status,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10
      });

      res.status(200).json({
        success: true,
        data: result.forms,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/user-forms/all
 * @desc    Get all user forms (Secretariat/Super Admin only)
 * @access  Secretariat, Super Admin
 */
router.get('/all', 
  restrictTo('secretariat', 'super_admin'), 
  async (req, res, next) => {
    try {
      const { formType, status, search, page, limit } = req.query;

      const result = await secretariatUserService.getAllUserForms({
        formType,
        status,
        search,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 10
      });

      res.status(200).json({
        success: true,
        data: result.forms,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/user-forms/form-types/list
 * @desc    Get available form types
 * @access  Authenticated users
 */
router.get('/form-types/list', async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      formTypes: [
        { value: 'departure', label: 'نموذج مغادرة', code: 'OMEGA-HR-UD01' },
        { value: 'vacation', label: 'نموذج إجازة', code: 'OMEGA-HR-UD02' },
        { value: 'advance', label: 'نموذج سلفة', code: 'OMEGA-HR-UD03' },
        { value: 'account_statement', label: 'كشف حساب', code: 'OMEGA-FIN-UD04' }
      ]
    }
  });
});

/**
 * @route   GET /api/user-forms/notifications/all
 * @desc    Get all notifications (Secretariat/Super Admin only)
 * @access  Secretariat, Super Admin
 */
router.get('/notifications/all', 
  restrictTo('secretariat', 'super_admin'), 
  async (req, res, next) => {
    try {
      const notifications = await secretariatUserService.getNotifications();

      res.status(200).json({
        success: true,
        data: notifications
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PATCH /api/user-forms/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Secretariat, Super Admin
 */
router.patch('/notifications/:id/read', 
  restrictTo('secretariat', 'super_admin'), 
  async (req, res, next) => {
    try {
      const notification = await secretariatUserService.markNotificationAsRead(req.params.id);

      res.status(200).json({
        success: true,
        message: 'تم تحديث الإشعار',
        data: notification
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PATCH /api/user-forms/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Secretariat, Super Admin
 */
router.patch('/notifications/mark-all-read', 
  restrictTo('secretariat', 'super_admin'), 
  async (req, res, next) => {
    try {
      await secretariatUserService.markAllNotificationsAsRead();

      res.status(200).json({
        success: true,
        message: 'تم تحديث جميع الإشعارات'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/user-forms/:id
 * @desc    Get specific form by ID
 * @access  Owner, Secretariat, Super Admin
 */
router.get('/:id', async (req, res, next) => {
  try {
    const form = await secretariatUserService.getFormById(req.params.id);

    // Check permissions: secretariat, super_admin, or form owner
    if (
      req.user.role !== 'secretariat' &&
      req.user.role !== 'super_admin' &&
      form.createdBy !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية لعرض هذا النموذج'
      });
    }

    res.status(200).json({
      success: true,
      data: form
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/user-forms/:id/pdf
 * @desc    Download PDF for form
 * @access  Owner, Secretariat, Super Admin
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    const form = await secretariatUserService.getFormById(req.params.id);

    // Check permissions
    if (
      req.user.role !== 'secretariat' &&
      req.user.role !== 'super_admin' &&
      form.createdBy !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية لتحميل هذا الملف'
      });
    }

    const filename = form.pdfPath.split('/').pop();

    res.download(form.pdfPath, filename, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;