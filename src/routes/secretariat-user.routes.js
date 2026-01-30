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
 * @desc    Create a new form with optional manual data (Employee/Admin/Super Admin)
 * @access  Employees with 'secretariatUserManagement' access, Admin, Super Admin
 */
router.post('/', 
  checkRouteAccess('secretariatUserManagement'), 
  async (req, res, next) => {
    try {
      const { formType, projectName, date, manualData } = req.body;

      // Validate required fields
      if (!formType) {
        return res.status(400).json({
          success: false,
          message: 'نوع النموذج مطلوب',
          field: 'formType'
        });
      }

      // Validate form type
      const validFormTypes = ['departure', 'vacation', 'advance', 'account_statement'];
      if (!validFormTypes.includes(formType)) {
        return res.status(400).json({
          success: false,
          message: 'نوع النموذج غير صحيح. الأنواع المتاحة: departure, vacation, advance, account_statement',
          field: 'formType',
          validTypes: validFormTypes
        });
      }

      // Validate date format if provided
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          success: false,
          message: 'صيغة التاريخ غير صحيحة. استخدم YYYY-MM-DD',
          field: 'date'
        });
      }

      // Validate manual data if provided
      if (manualData) {
        const validation = validateManualData(formType, manualData);
        if (!validation.isValid) {
          return res.status(400).json({
            success: false,
            message: 'بيانات النموذج اليدوية غير صحيحة',
            errors: validation.errors
          });
        }
      }

      const formData = {
        formType,
        projectName: projectName || null,
        date: date || new Date().toISOString().split('T')[0],
        manualData: manualData || null
      };

      const form = await secretariatUserService.createForm(formData, req.user.id);

      res.status(201).json({
        success: true,
        message: 'تم إنشاء النموذج بنجاح وإرساله إلى السكرتارية',
        data: form
      });
    } catch (error) {
      console.error('Error creating user form:', error);
      
      // Handle specific error types
      if (error.message.includes('غير موجود') || error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message.includes('غير صحيح') || error.message.includes('invalid')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء إنشاء النموذج. يرجى المحاولة مرة أخرى.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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

      // Validate query parameters
      if (formType && !['departure', 'vacation', 'advance', 'account_statement'].includes(formType)) {
        return res.status(400).json({
          success: false,
          message: 'نوع النموذج غير صحيح'
        });
      }

      if (status && !['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'حالة النموذج غير صحيحة'
        });
      }

      const pageNum = page ? parseInt(page) : 1;
      const limitNum = limit ? parseInt(limit) : 10;

      if (pageNum < 1 || limitNum < 1) {
        return res.status(400).json({
          success: false,
          message: 'قيم الصفحة والحد يجب أن تكون أكبر من صفر'
        });
      }

      const result = await secretariatUserService.getMyForms(req.user.id, {
        formType,
        status,
        page: pageNum,
        limit: limitNum
      });

      res.status(200).json({
        success: true,
        data: result.forms,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error getting user forms:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحميل النماذج. يرجى المحاولة مرة أخرى.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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

      const pageNum = page ? parseInt(page) : 1;
      const limitNum = limit ? parseInt(limit) : 10;

      if (pageNum < 1 || limitNum < 1) {
        return res.status(400).json({
          success: false,
          message: 'قيم الصفحة والحد يجب أن تكون أكبر من صفر'
        });
      }

      const result = await secretariatUserService.getAllUserForms({
        formType,
        status,
        search,
        page: pageNum,
        limit: limitNum
      });

      res.status(200).json({
        success: true,
        data: result.forms,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error getting all user forms:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحميل النماذج. يرجى المحاولة مرة أخرى.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route   GET /api/user-forms/form-types/list
 * @desc    Get available form types
 * @access  Authenticated users
 */
router.get('/form-types/list', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error getting form types:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحميل أنواع النماذج'
    });
  }
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
      console.error('Error getting notifications:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحميل الإشعارات',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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
      if (!req.params.id) {
        return res.status(400).json({
          success: false,
          message: 'معرف الإشعار مطلوب'
        });
      }

      const notification = await secretariatUserService.markNotificationAsRead(req.params.id);

      res.status(200).json({
        success: true,
        message: 'تم تحديث الإشعار',
        data: notification
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'الإشعار غير موجود'
        });
      }

      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحديث الإشعار',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحديث الإشعارات',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
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
    if (!req.params.id) {
      return res.status(400).json({
        success: false,
        message: 'معرف النموذج مطلوب'
      });
    }

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
    console.error('Error getting form by ID:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'النموذج غير موجود'
      });
    }

    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحميل النموذج',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/user-forms/:id/pdf
 * @desc    Download PDF for form
 * @access  Owner, Secretariat, Super Admin
 */
router.get('/:id/pdf', async (req, res, next) => {
  try {
    if (!req.params.id) {
      return res.status(400).json({
        success: false,
        message: 'معرف النموذج مطلوب'
      });
    }

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

    // Check if PDF exists
    const fs = require('fs');
    if (!fs.existsSync(form.pdfPath)) {
      return res.status(404).json({
        success: false,
        message: 'ملف PDF غير موجود'
      });
    }

    const filename = form.pdfPath.split('/').pop();

    res.download(form.pdfPath, filename, (err) => {
      if (err) {
        console.error('Error downloading PDF:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تحميل الملف'
          });
        }
      }
    });
  } catch (error) {
    console.error('Error downloading PDF:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'النموذج غير موجود'
      });
    }

    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحميل الملف',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Helper function to validate manual data
 */
function validateManualData(formType, manualData) {
  const errors = [];

  if (!manualData) return { isValid: true, errors: [] };

  // Validate common fields
  if (manualData.employeeNumber && !/^\d+$/.test(manualData.employeeNumber)) {
    errors.push('رقم الموظف يجب أن يكون رقمياً');
  }

  switch (formType) {
    case 'departure':
      if (manualData.departureDate && manualData.returnDate) {
        const departure = new Date(manualData.departureDate);
        const returnDate = new Date(manualData.returnDate);
        if (isNaN(departure.getTime()) || isNaN(returnDate.getTime())) {
          errors.push('صيغة التاريخ غير صحيحة');
        } else if (returnDate < departure) {
          errors.push('تاريخ العودة لا يمكن أن يكون قبل تاريخ المغادرة');
        }
      }
      break;

    case 'vacation':
      if (manualData.startDate && manualData.endDate) {
        const start = new Date(manualData.startDate);
        const end = new Date(manualData.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          errors.push('صيغة التاريخ غير صحيحة');
        } else if (end < start) {
          errors.push('تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية');
        }
      }
      if (manualData.numberOfDays !== undefined) {
        const days = Number(manualData.numberOfDays);
        if (isNaN(days) || days < 1) {
          errors.push('عدد الأيام يجب أن يكون على الأقل 1');
        }
      }
      if (manualData.vacationType && !['annual', 'sick', 'emergency', 'unpaid'].includes(manualData.vacationType)) {
        errors.push('نوع الإجازة غير صحيح');
      }
      break;

    case 'advance':
      if (manualData.advanceAmount !== undefined) {
        const amount = Number(manualData.advanceAmount);
        if (isNaN(amount) || amount <= 0) {
          errors.push('مبلغ السلفة يجب أن يكون أكبر من صفر');
        }
      }
      if (manualData.installments !== undefined) {
        const installments = Number(manualData.installments);
        if (isNaN(installments) || installments < 1) {
          errors.push('عدد الأقساط يجب أن يكون على الأقل 1');
        }
      }
      if (manualData.repaymentMethod && !['salary_deduction', 'cash', 'other'].includes(manualData.repaymentMethod)) {
        errors.push('طريقة السداد غير صحيحة');
      }
      break;

    case 'account_statement':
      if (manualData.fromDate && manualData.toDate) {
        const from = new Date(manualData.fromDate);
        const to = new Date(manualData.toDate);
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
          errors.push('صيغة التاريخ غير صحيحة');
        } else if (to < from) {
          errors.push('تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية');
        }
      }
      if (manualData.accountType && !['salary', 'bonus', 'deduction', 'other'].includes(manualData.accountType)) {
        errors.push('نوع الحساب غير صحيح');
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = router;