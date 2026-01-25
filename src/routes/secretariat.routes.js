// src/routes/secretariat.routes.js
const express = require('express');
const router = express.Router();
const secretariatService = require('../services/secretariat.service');
const { protect, checkRouteAccess } = require('../middleware/auth.middleware');
const { restrictTo } = require('../middleware/role.middleware');

// جميع المسارات تتطلب المصادقة والدور: secretariat أو super_admin
router.use(protect);
router.use(restrictTo('secretariat', 'super_admin'));
router.use(checkRouteAccess('secretariatManagement'));
/**
 * @route   POST /api/secretariat/forms
 * @desc    إنشاء نموذج جديد من قبل السكرتارية
 * @access  Secretariat, Super Admin
 */
router.post('/forms', async (req, res, next) => {
  try {
    const { employeeId, formType, date } = req.body;

    // التحقق من المدخلات
    if (!employeeId || !formType) {
      return res.status(400).json({
        success: false,
        message: 'معرف الموظف ونوع النموذج مطلوبان'
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
      employeeId,
      formType,
      date: date || new Date().toISOString().split('T')[0]
    };

    const form = await secretariatService.createForm(formData, req.user.id);

    res.status(201).json({
      success: true,
      message: 'تم إنشاء النموذج بنجاح',
      data: form
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/secretariat/forms
 * @desc    الحصول على جميع النماذج التي أنشأتها السكرتارية
 * @access  Secretariat, Super Admin
 */
router.get('/forms', async (req, res, next) => {
  try {
    const { formType, employeeId, status, search, page, limit } = req.query;

    const result = await secretariatService.getAllForms({
      formType,
      employeeId,
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
});

/**
 * @route   GET /api/secretariat/forms/:id
 * @desc    الحصول على نموذج محدد بواسطة المعرف
 * @access  Secretariat, Super Admin
 */
router.get('/forms/:id', async (req, res, next) => {
  try {
    const form = await secretariatService.getFormById(req.params.id);

    res.status(200).json({
      success: true,
      data: form
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/secretariat/forms/:id
 * @desc    حذف نموذج
 * @access  Secretariat, Super Admin
 */
router.delete('/forms/:id', async (req, res, next) => {
  try {
    await secretariatService.deleteForm(req.params.id);

    res.status(200).json({
      success: true,
      message: 'تم حذف النموذج بنجاح'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/secretariat/forms/:id/status
 * @desc    تحديث حالة النموذج
 * @access  Secretariat, Super Admin
 */
router.patch('/forms/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'الحالة مطلوبة'
      });
    }

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'الحالة غير صحيحة. الحالات المتاحة: pending, approved, rejected'
      });
    }

    const form = await secretariatService.updateFormStatus(req.params.id, status);

    res.status(200).json({
      success: true,
      message: 'تم تحديث حالة النموذج بنجاح',
      data: form
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/secretariat/forms/:id/pdf
 * @desc    تحميل ملف PDF للنموذج
 * @access  Secretariat, Super Admin
 */
router.get('/forms/:id/pdf', async (req, res, next) => {
  try {
    const form = await secretariatService.getFormById(req.params.id);

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

/**
 * @route   GET /api/secretariat/form-types
 * @desc    الحصول على أنواع النماذج المتاحة
 * @access  Secretariat, Super Admin
 */
router.get('/form-types', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      formTypes: [
        { value: 'departure', label: 'نموذج مغادرة', code: 'OMEGA-HR-FD01' },
        { value: 'vacation', label: 'نموذج إجازة', code: 'OMEGA-HR-FD02' },
        { value: 'advance', label: 'نموذج سلفة', code: 'OMEGA-HR-FD03' },
        { value: 'account_statement', label: 'كشف حساب', code: 'OMEGA-FIN-FD04' }
      ]
    }
  });
});

module.exports = router;