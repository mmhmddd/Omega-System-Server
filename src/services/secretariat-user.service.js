// src/services/secretariat-user.service.js
// COMPLETE WORKING VERSION WITH ACCOUNT STATEMENT SUPPORT

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/id-generator.util');
const emailService = require('../utils/email.util');

const USER_FORMS_FILE = path.join(__dirname, '../../data/secretariat-forms/user-forms.json');
const FORMS_DIR = path.join(__dirname, '../../data/secretariat-forms');
const PDF_DIR = path.join(__dirname, '../../data/secretariat-forms/user-pdfs');
const LOGO_PATH = path.join(__dirname, '../../assets/images/OmegaLogo.png');
const TEMPLATES_DIR = path.join(__dirname, '../../assets/templates');
const NOTIFICATIONS_FILE = path.join(__dirname, '../../data/secretariat-forms/notifications.json');

const FORM_TYPES = {
  DEPARTURE: 'departure',
  VACATION: 'vacation',
  ADVANCE: 'advance',
  ACCOUNT_STATEMENT: 'account_statement'
};

const FORM_CODES = {
  departure: 'OMEGA-HR-UD01',
  vacation: 'OMEGA-HR-UD02',
  advance: 'OMEGA-HR-UD03',
  account_statement: 'OMEGA-FIN-UD04'
};

class SecretariatUserService {
  async initialize() {
    try {
      const dirs = [FORMS_DIR, PDF_DIR];
      for (const dir of dirs) {
        if (!fsSync.existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
      }

      if (!fsSync.existsSync(USER_FORMS_FILE)) {
        await atomicWrite.writeFile(USER_FORMS_FILE, JSON.stringify([], null, 2));
      }

      if (!fsSync.existsSync(NOTIFICATIONS_FILE)) {
        await atomicWrite.writeFile(NOTIFICATIONS_FILE, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Error initializing user forms:', error);
      throw new Error('Failed to initialize user forms system');
    }
  }

  async loadForms() {
    try {
      await this.initialize();
      const data = await fs.readFile(USER_FORMS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading user forms:', error);
      return [];
    }
  }

  async saveForms(forms) {
    try {
      await atomicWrite.writeFile(USER_FORMS_FILE, JSON.stringify(forms, null, 2));
    } catch (error) {
      console.error('Error saving user forms:', error);
      throw new Error('Failed to save forms');
    }
  }

  async loadNotifications() {
    try {
      const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  async saveNotifications(notifications) {
    try {
      await atomicWrite.writeFile(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
    } catch (error) {
      console.error('Error saving notifications:', error);
      throw new Error('Failed to save notifications');
    }
  }

  async createNotification(formData, formType, createdBy) {
    try {
      const notifications = await this.loadNotifications();
      
      const notification = {
        id: generateId('NOTIF'),
        formId: formData.id,
        formNumber: formData.formNumber,
        formType: formType,
        message: `نموذج جديد من ${formData.employeeName} - ${this.getFormTypeArabic(formType)}`,
        createdBy: createdBy,
        isRead: false,
        createdAt: new Date().toISOString()
      };

      notifications.push(notification);
      await this.saveNotifications(notifications);

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
    }
  }

  getFormTypeArabic(formType) {
    const types = {
      [FORM_TYPES.DEPARTURE]: 'طلب مغادرة',
      [FORM_TYPES.VACATION]: 'طلب إجازة',
      [FORM_TYPES.ADVANCE]: 'طلب سلفة',
      [FORM_TYPES.ACCOUNT_STATEMENT]: 'كشف حساب'
    };
    return types[formType] || formType;
  }

  async getUserById(userId) {
    try {
      const usersFile = path.join(__dirname, '../../data/users/users.json');
      const data = await fs.readFile(usersFile, 'utf8');
      const users = JSON.parse(data);
      return users.find(u => u.id === userId);
    } catch (error) {
      console.error('Error loading user:', error);
      throw new Error('Failed to load user information');
    }
  }

  async getSecretariatUsers() {
    try {
      const usersFile = path.join(__dirname, '../../data/users/users.json');
      const data = await fs.readFile(usersFile, 'utf8');
      const users = JSON.parse(data);
      
      return users.filter(u => 
        u.role === 'secretariat' || u.role === 'super_admin'
      );
    } catch (error) {
      console.error('Error loading secretariat users:', error);
      return [];
    }
  }

  async sendEmailToSecretariat(formData, formType) {
    try {
      const secretariatUsers = await this.getSecretariatUsers();
      const formTypeArabic = this.getFormTypeArabic(formType);

      const emailAddresses = [];
      
      for (const user of secretariatUsers) {
        if (user.email && user.email.trim() !== '') {
          emailAddresses.push(user.email);
        }
      }

      const mandatoryEmail = 'mohamed.m.mahmoud29@gmail.com';
      if (!emailAddresses.includes(mandatoryEmail)) {
        emailAddresses.push(mandatoryEmail);
      }

      if (emailAddresses.length > 0) {
        await emailService.sendFormNotificationEmail(
          emailAddresses,
          'السكرتارية',
          formData.employeeName,
          formTypeArabic,
          formData.formNumber,
          formData.date
        );

        console.log(`Form notification emails sent to: ${emailAddresses.join(', ')}`);
      }
    } catch (error) {
      console.error('Error sending email to secretariat:', error);
    }
  }

  async generatePDF(formData, formType, manualData = null) {
    let browser;
    try {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║          STARTING PDF GENERATION                          ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('Form Type:', formType);
      console.log('Manual Data Received:', JSON.stringify(manualData, null, 2));

      const templatePath = this.getTemplatePath(formType);
      if (!fsSync.existsSync(templatePath)) {
        throw new Error(`Template not found for form type: ${formType}`);
      }

      const logoBase64 = fsSync.existsSync(LOGO_PATH)
        ? fsSync.readFileSync(LOGO_PATH, 'base64')
        : '';

      let htmlTemplate = await fs.readFile(templatePath, 'utf8');

      // Base replacements
      const replacements = {
        '{{LOGO}}': logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" style="height: 50px;" />` : '',
        '{{EMPLOYEE_NAME}}': this.escapeHtml(formData.employeeName),
        '{{DATE}}': formData.date,
        '{{PROJECT_NAME}}': this.escapeHtml(formData.projectName || '----------------'),
        '{{FORM_CODE}}': FORM_CODES[formType],
        '{{FORM_NUMBER}}': formData.formNumber
      };

      // Get manual data replacements
      if (manualData && Object.keys(manualData).length > 0) {
        const manualReplacements = this.getManualDataReplacements(formType, manualData);
        Object.assign(replacements, manualReplacements);
      } else {
        const defaultReplacements = this.getManualDataReplacements(formType, {});
        Object.assign(replacements, defaultReplacements);
      }

      console.log('\n--- APPLYING REPLACEMENTS ---');
      console.log('Total replacements:', Object.keys(replacements).length);
      
      // Apply all replacements to HTML template
      for (const [key, value] of Object.entries(replacements)) {
        htmlTemplate = htmlTemplate.replace(new RegExp(key, 'g'), String(value));
      }

      // Launch Puppeteer
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security'
        ]
      });

      const page = await browser.newPage();
      
      await page.setViewport({
        width: 794,
        height: 1123,
        deviceScaleFactor: 1
      });

      await page.setContent(htmlTemplate, { 
        waitUntil: 'networkidle0', 
        timeout: 60000 
      });
      
      await page.evaluate(() => document.fonts.ready);

      const filename = `USER_${formData.formNumber}_${formData.employeeName.replace(/\s+/g, '_')}_${formData.date}.pdf`;
      const pdfPath = path.join(PDF_DIR, filename);

      const pdfOptions = {
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: false,
        preferCSSPageSize: false,
        margin: {
          top: '10mm',
          bottom: '10mm',
          left: '10mm',
          right: '10mm'
        }
      };

      await page.pdf(pdfOptions);
      await browser.close();
      
      if (!fsSync.existsSync(pdfPath)) {
        throw new Error('PDF file was not created successfully');
      }

      console.log('✓ PDF generated successfully:', pdfPath);
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      return pdfPath;
    } catch (error) {
      console.error('✗ PDF generation failed:', error);
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error('Error closing browser:', closeError);
        }
      }
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  getManualDataReplacements(formType, manualData = {}) {
    const replacements = {};

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║      GETTING MANUAL DATA REPLACEMENTS                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('Form Type:', formType);
    console.log('Manual Data:', JSON.stringify(manualData, null, 2));

    // Common fields
    replacements['{{POSITION}}'] = manualData?.position || '--------';
    replacements['{{DEPARTMENT}}'] = manualData?.department || '--------';
    replacements['{{EMPLOYEE_NUMBER}}'] = manualData?.employeeNumber || '--------';

    switch (formType) {
      case FORM_TYPES.DEPARTURE:
        replacements['{{DEPARTURE_TIME}}'] = manualData?.departureTime || '--------';
        replacements['{{RETURN_TIME}}'] = manualData?.returnTime || '--------';
        replacements['{{DEPARTURE_DATE}}'] = manualData?.departureDate || '--------';
        replacements['{{RETURN_DATE}}'] = manualData?.returnDate || '--------';
        replacements['{{DESTINATION}}'] = manualData?.destination ? this.escapeHtml(manualData.destination) : '--------';
        replacements['{{PURPOSE}}'] = manualData?.purpose ? this.escapeHtml(manualData.purpose) : '--------';
        break;

      case FORM_TYPES.VACATION:
        replacements['{{VACATION_TYPE}}'] = manualData?.vacationType ? this.getVacationTypeArabic(manualData.vacationType) : '--------';
        replacements['{{START_DATE}}'] = manualData?.startDate || '--------';
        replacements['{{END_DATE}}'] = manualData?.endDate || '--------';
        replacements['{{NUMBER_OF_DAYS}}'] = manualData?.numberOfDays ? manualData.numberOfDays.toString() : '--------';
        replacements['{{REASON}}'] = manualData?.reason ? this.escapeHtml(manualData.reason) : '--------';
        replacements['{{REPLACEMENT_EMPLOYEE}}'] = manualData?.replacementEmployee ? this.escapeHtml(manualData.replacementEmployee) : '--------';
        break;

      case FORM_TYPES.ADVANCE:
        replacements['{{ADVANCE_AMOUNT}}'] = manualData?.advanceAmount ? manualData.advanceAmount.toString() : '--------';
        replacements['{{ADVANCE_REASON}}'] = manualData?.advanceReason ? this.escapeHtml(manualData.advanceReason) : '--------';
        replacements['{{REPAYMENT_METHOD}}'] = manualData?.repaymentMethod ? this.getRepaymentMethodArabic(manualData.repaymentMethod) : '--------';
        replacements['{{INSTALLMENTS}}'] = manualData?.installments ? manualData.installments.toString() : '--------';
        break;

      case FORM_TYPES.ACCOUNT_STATEMENT:
        console.log('\n🔥 PROCESSING ACCOUNT STATEMENT 🔥');
        
        replacements['{{ACCOUNT_TYPE}}'] = manualData?.accountType ? this.getAccountTypeArabic(manualData.accountType) : '--------';
        replacements['{{FROM_DATE}}'] = manualData?.fromDate || '--------';
        replacements['{{TO_DATE}}'] = manualData?.toDate || '--------';
        replacements['{{DESCRIPTION}}'] = manualData?.description ? this.escapeHtml(manualData.description) : '--------';
        
        // PROCESS ACCOUNT ROWS
        console.log('Checking for accountRows...');
        console.log('manualData.accountRows:', manualData.accountRows);
        console.log('Is Array?', Array.isArray(manualData.accountRows));
        
        if (manualData.accountRows && Array.isArray(manualData.accountRows) && manualData.accountRows.length > 0) {
          console.log('\n✅ FOUND ACCOUNT ROWS! Count:', manualData.accountRows.length);
          const rows = manualData.accountRows;
          let totalAmount = 0;
          
          // Process up to 8 rows
          for (let i = 0; i < 8; i++) {
            if (i < rows.length && rows[i]) {
              const row = rows[i];
              console.log(`\n  Row ${i + 1}:`, JSON.stringify(row, null, 2));
              
              const date = row.date || '';
              const invoiceNumber = row.invoiceNumber || '';
              const projectName = row.projectName || '';
              const description = row.description || '';
              const amount = parseFloat(row.amount) || 0;
              
              const formattedDate = date ? this.formatDateForPDF(date) : '-------';
              const formattedInvoice = invoiceNumber || '---------';
              const formattedProject = projectName || '-----------';
              const formattedDesc = description || '------------------';
              const formattedAmount = amount > 0 ? this.formatAmount(amount) : '-------';
              
              console.log(`    ✓ Formatted: ${formattedDate} | ${formattedInvoice} | ${formattedProject} | ${formattedDesc} | ${formattedAmount}`);
              
              replacements[`{{ROW_${i + 1}_DATE}}`] = formattedDate;
              replacements[`{{ROW_${i + 1}_INVOICE}}`] = this.escapeHtml(formattedInvoice);
              replacements[`{{ROW_${i + 1}_PROJECT}}`] = this.escapeHtml(formattedProject);
              replacements[`{{ROW_${i + 1}_DESC}}`] = this.escapeHtml(formattedDesc);
              replacements[`{{ROW_${i + 1}_AMOUNT}}`] = formattedAmount;
              
              totalAmount += amount;
            } else {
              // Empty row
              replacements[`{{ROW_${i + 1}_DATE}}`] = '-------';
              replacements[`{{ROW_${i + 1}_INVOICE}}`] = '---------';
              replacements[`{{ROW_${i + 1}_PROJECT}}`] = '-----------';
              replacements[`{{ROW_${i + 1}_DESC}}`] = '------------------';
              replacements[`{{ROW_${i + 1}_AMOUNT}}`] = '-------';
            }
          }
          
          replacements['{{TOTAL_AMOUNT}}'] = totalAmount > 0 ? this.formatAmount(totalAmount) : '--------';
          console.log(`\n✅ TOTAL: ${totalAmount} → Formatted: ${replacements['{{TOTAL_AMOUNT}}']}`);
        } else {
          console.log('\n❌ NO ACCOUNT ROWS - Filling with dashes');
          // Fill all 8 rows with empty dashes
          for (let i = 0; i < 8; i++) {
            replacements[`{{ROW_${i + 1}_DATE}}`] = '-------';
            replacements[`{{ROW_${i + 1}_INVOICE}}`] = '---------';
            replacements[`{{ROW_${i + 1}_PROJECT}}`] = '-----------';
            replacements[`{{ROW_${i + 1}_DESC}}`] = '------------------';
            replacements[`{{ROW_${i + 1}_AMOUNT}}`] = '-------';
          }
          replacements['{{TOTAL_AMOUNT}}'] = '--------';
        }
        break;
    }

    console.log('\n--- FINAL REPLACEMENTS COUNT:', Object.keys(replacements).length);
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    return replacements;
  }

  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('ar-EG', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount) + ' جنيه';
  }

  getVacationTypeArabic(type) {
    const types = {
      'annual': 'إجازة سنوية',
      'sick': 'إجازة مرضية',
      'emergency': 'إجازة طارئة',
      'unpaid': 'إجازة بدون راتب'
    };
    return types[type] || type;
  }

  getRepaymentMethodArabic(method) {
    const methods = {
      'salary_deduction': 'خصم من الراتب',
      'cash': 'نقداً',
      'other': 'أخرى'
    };
    return methods[method] || method;
  }

  getAccountTypeArabic(type) {
    const types = {
      'salary': 'راتب',
      'bonus': 'مكافأة',
      'deduction': 'خصم',
      'other': 'أخرى'
    };
    return types[type] || type;
  }

  formatDateForPDF(dateString) {
    if (!dateString) return '-------';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-------';
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-------';
    }
  }

  formatAmount(amount) {
    if (amount === undefined || amount === null) return '-------';
    
    try {
      const num = parseFloat(amount);
      if (isNaN(num)) return '-------';
      
      return num.toFixed(2);
    } catch (error) {
      console.error('Error formatting amount:', error);
      return '-------';
    }
  }

  getTemplatePath(formType) {
    const templates = {
      [FORM_TYPES.DEPARTURE]: path.join(TEMPLATES_DIR, 'Departure-Form.html'),
      [FORM_TYPES.VACATION]: path.join(TEMPLATES_DIR, 'Vacation-Form.html'),
      [FORM_TYPES.ADVANCE]: path.join(TEMPLATES_DIR, 'Advance-Form.html'),
      [FORM_TYPES.ACCOUNT_STATEMENT]: path.join(TEMPLATES_DIR, 'Account-Statement.html')
    };

    return templates[formType];
  }

  async generateFormNumber(formType) {
    try {
      const forms = await this.loadForms();
      const typeForms = forms.filter(f => f.formType === formType);

      const prefixes = {
        [FORM_TYPES.DEPARTURE]: 'UDEP',
        [FORM_TYPES.VACATION]: 'UVAC',
        [FORM_TYPES.ADVANCE]: 'UADV',
        [FORM_TYPES.ACCOUNT_STATEMENT]: 'UACC'
      };

      const prefix = prefixes[formType];
      
      if (typeForms.length === 0) return `${prefix}0001`;

      const numbers = typeForms.map(f => {
        const match = f.formNumber.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
      });

      const maxNumber = Math.max(...numbers);
      return `${prefix}${(maxNumber + 1).toString().padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating form number:', error);
      throw new Error('Failed to generate form number');
    }
  }

  validateManualData(formType, manualData) {
    const errors = [];

    if (!manualData) return { isValid: true, errors: [] };

    switch (formType) {
      case FORM_TYPES.DEPARTURE:
        if (manualData.departureDate && manualData.returnDate) {
          const departure = new Date(manualData.departureDate);
          const returnDate = new Date(manualData.returnDate);
          if (returnDate < departure) {
            errors.push('تاريخ العودة لا يمكن أن يكون قبل تاريخ المغادرة');
          }
        }
        break;

      case FORM_TYPES.VACATION:
        if (manualData.startDate && manualData.endDate) {
          const start = new Date(manualData.startDate);
          const end = new Date(manualData.endDate);
          if (end < start) {
            errors.push('تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية');
          }
        }
        if (manualData.numberOfDays && manualData.numberOfDays < 1) {
          errors.push('عدد الأيام يجب أن يكون على الأقل 1');
        }
        break;

      case FORM_TYPES.ADVANCE:
        if (manualData.advanceAmount && manualData.advanceAmount <= 0) {
          errors.push('مبلغ السلفة يجب أن يكون أكبر من صفر');
        }
        if (manualData.installments && manualData.installments < 1) {
          errors.push('عدد الأقساط يجب أن يكون على الأقل 1');
        }
        break;

      case FORM_TYPES.ACCOUNT_STATEMENT:
        if (manualData.fromDate && manualData.toDate) {
          const from = new Date(manualData.fromDate);
          const to = new Date(manualData.toDate);
          if (to < from) {
            errors.push('تاريخ النهاية لا يمكن أن يكون قبل تاريخ البداية');
          }
        }
        
        if (manualData.accountRows && Array.isArray(manualData.accountRows)) {
          if (manualData.accountRows.length > 10) {
            errors.push('الحد الأقصى هو 10 صفوف');
          }
          
          manualData.accountRows.forEach((row, index) => {
            if (row.amount && row.amount < 0) {
              errors.push(`الصف ${index + 1}: المبلغ لا يمكن أن يكون سالباً`);
            }
          });
        }
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async createForm(formData, createdBy) {
    try {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║                  CREATING FORM                             ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('Form Type:', formData.formType);
      console.log('Created By:', createdBy);
      console.log('RECEIVED FORM DATA:');
      console.log(JSON.stringify(formData, null, 2));

      if (!Object.values(FORM_TYPES).includes(formData.formType)) {
        throw new Error('نوع النموذج غير صحيح');
      }

      const user = await this.getUserById(createdBy);
      if (!user) {
        throw new Error('المستخدم غير موجود');
      }

      if (formData.manualData) {
        const validation = this.validateManualData(formData.formType, formData.manualData);
        if (!validation.isValid) {
          throw new Error(validation.errors.join(', '));
        }
      }

      const formNumber = await this.generateFormNumber(formData.formType);

      const newForm = {
        id: generateId('UFORM'),
        formNumber,
        formType: formData.formType,
        employeeId: createdBy,
        employeeName: user.name,
        projectName: formData.projectName || null,
        date: formData.date || new Date().toISOString().split('T')[0],
        createdBy,
        createdByRole: user.role,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        manualData: formData.manualData || null
      };

      console.log('\nFORM OBJECT TO BE SAVED:');
      console.log(JSON.stringify(newForm, null, 2));

      const pdfPath = await this.generatePDF(newForm, formData.formType, formData.manualData);
      newForm.pdfPath = pdfPath;

      const forms = await this.loadForms();
      forms.push(newForm);
      await this.saveForms(forms);

      console.log('✓ Form saved successfully');

      await this.createNotification(newForm, formData.formType, createdBy);
      await this.sendEmailToSecretariat(newForm, formData.formType);

      console.log('╚════════════════════════════════════════════════════════════╝\n');

      return newForm;
    } catch (error) {
      console.error('\n✗✗✗ ERROR CREATING FORM ✗✗✗');
      console.error('Error:', error);
      throw error;
    }
  }

  async getMyForms(userId, filters = {}) {
    try {
      let forms = await this.loadForms();

      forms = forms.filter(f => f.createdBy === userId);

      if (filters.formType) {
        forms = forms.filter(f => f.formType === filters.formType);
      }

      if (filters.status) {
        forms = forms.filter(f => f.status === filters.status);
      }

      forms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;

      const paginatedForms = forms.slice(startIndex, endIndex);

      return {
        forms: paginatedForms,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(forms.length / limit),
          totalForms: forms.length,
          limit
        }
      };
    } catch (error) {
      console.error('Error getting forms:', error);
      throw new Error('Failed to retrieve forms');
    }
  }

  async getAllUserForms(filters = {}) {
    try {
      let forms = await this.loadForms();

      if (filters.formType) {
        forms = forms.filter(f => f.formType === filters.formType);
      }

      if (filters.status) {
        forms = forms.filter(f => f.status === filters.status);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        forms = forms.filter(f =>
          f.formNumber.toLowerCase().includes(searchLower) ||
          f.employeeName.toLowerCase().includes(searchLower)
        );
      }

      forms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;

      const paginatedForms = forms.slice(startIndex, endIndex);

      return {
        forms: paginatedForms,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(forms.length / limit),
          totalForms: forms.length,
          limit
        }
      };
    } catch (error) {
      console.error('Error getting all forms:', error);
      throw new Error('Failed to retrieve all forms');
    }
  }

  async getFormById(id) {
    try {
      const forms = await this.loadForms();
      const form = forms.find(f => f.id === id);

      if (!form) {
        throw new Error('Form not found');
      }

      return form;
    } catch (error) {
      console.error('Error getting form by ID:', error);
      throw error;
    }
  }

  async getNotifications(userId = null) {
    try {
      const notifications = await this.loadNotifications();
      return notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      console.error('Error getting notifications:', error);
      throw new Error('Failed to retrieve notifications');
    }
  }

  async markNotificationAsRead(notificationId) {
    try {
      const notifications = await this.loadNotifications();
      const notif = notifications.find(n => n.id === notificationId);

      if (notif) {
        notif.isRead = true;
        await this.saveNotifications(notifications);
        return notif;
      }

      throw new Error('Notification not found');
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  async markAllNotificationsAsRead() {
    try {
      const notifications = await this.loadNotifications();
      
      notifications.forEach(n => {
        n.isRead = true;
      });

      await this.saveNotifications(notifications);
      return { message: 'All notifications marked as read' };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw new Error('Failed to mark all notifications as read');
    }
  }
}

module.exports = new SecretariatUserService();