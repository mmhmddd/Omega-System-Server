// src/services/secretariat.service.js
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/id-generator.util');
const emailService = require('../utils/email.util');

const FORMS_FILE = path.join(__dirname, '../../data/secretariat-forms/index.json');
const FORMS_DIR = path.join(__dirname, '../../data/secretariat-forms');
const PDF_DIR = path.join(__dirname, '../../data/secretariat-forms/pdfs');
const LOGO_PATH = path.join(__dirname, '../../assets/images/OmegaLogo.png');
const TEMPLATES_DIR = path.join(__dirname, '../../assets/templates');

const FORM_TYPES = {
  DEPARTURE: 'departure',
  VACATION: 'vacation',
  ADVANCE: 'advance',
  ACCOUNT_STATEMENT: 'account_statement'
};

const FORM_CODES = {
  departure: 'OMEGA-HR-FD01',
  vacation: 'OMEGA-HR-FD02',
  advance: 'OMEGA-HR-FD03',
  account_statement: 'OMEGA-FIN-FD04'
};

class SecretariatService {
  async initialize() {
    try {
      const dirs = [FORMS_DIR, PDF_DIR];
      for (const dir of dirs) {
        if (!fsSync.existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
      }

      if (!fsSync.existsSync(FORMS_FILE)) {
        await atomicWrite.writeFile(FORMS_FILE, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Error initializing secretariat forms:', error);
      throw error;
    }
  }

  async loadForms() {
    try {
      await this.initialize();
      const data = await fs.readFile(FORMS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading forms:', error);
      return [];
    }
  }

  async saveForms(forms) {
    await atomicWrite.writeFile(FORMS_FILE, JSON.stringify(forms, null, 2));
  }

  async getEmployeeById(employeeId) {
    const usersFile = path.join(__dirname, '../../data/users/users.json');
    const data = await fs.readFile(usersFile, 'utf8');
    const users = JSON.parse(data);
    return users.find(u => u.id === employeeId);
  }

  async generatePDF(formData, formType) {
    let browser;
    try {
      const logoBase64 = fsSync.existsSync(LOGO_PATH)
        ? fsSync.readFileSync(LOGO_PATH, 'base64')
        : '';

      const templatePath = this.getTemplatePath(formType);
      let htmlTemplate = await fs.readFile(templatePath, 'utf8');

      htmlTemplate = htmlTemplate
        .replace(/{{LOGO}}/g, logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" alt="Logo" style="height: 50px;" />` : '')
        .replace(/{{EMPLOYEE_NAME}}/g, formData.employeeName)
        .replace(/{{DATE}}/g, formData.date)
        .replace(/{{PROJECT_NAME}}/g, formData.projectName || '----------------')
        .replace(/{{FORM_CODE}}/g, FORM_CODES[formType]);

      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      
      // Set viewport to ensure proper rendering
      await page.setViewport({
        width: 794,  // A4 width in pixels at 96 DPI
        height: 1123, // A4 height in pixels at 96 DPI
        deviceScaleFactor: 1
      });

      await page.setContent(htmlTemplate, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);

      const filename = `${formData.formNumber}_${formData.employeeName.replace(/\s+/g, '_')}_${formData.date}.pdf`;
      const pdfPath = path.join(PDF_DIR, filename);

      // PDF options with proper margins
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
      console.log('PDF generated successfully:', pdfPath);
      return pdfPath;
    } catch (error) {
      console.error('PDF generation failed:', error);
      if (browser) await browser.close().catch(() => {});
      throw error;
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
    const forms = await this.loadForms();
    const typeForms = forms.filter(f => f.formType === formType);

    const prefixes = {
      [FORM_TYPES.DEPARTURE]: 'DEP',
      [FORM_TYPES.VACATION]: 'VAC',
      [FORM_TYPES.ADVANCE]: 'ADV',
      [FORM_TYPES.ACCOUNT_STATEMENT]: 'ACC'
    };

    const prefix = prefixes[formType];
    
    if (typeForms.length === 0) return `${prefix}0001`;

    const numbers = typeForms.map(f => {
      const match = f.formNumber.match(/\d+/);
      return match ? parseInt(match[0]) : 0;
    });

    const maxNumber = Math.max(...numbers);
    return `${prefix}${(maxNumber + 1).toString().padStart(4, '0')}`;
  }

  async createForm(formData, createdBy) {
    const forms = await this.loadForms();
    const employee = await this.getEmployeeById(formData.employeeId);

    if (!employee) {
      throw new Error('الموظف غير موجود');
    }

    if (!Object.values(FORM_TYPES).includes(formData.formType)) {
      throw new Error('نوع النموذج غير صحيح');
    }

    const formNumber = await this.generateFormNumber(formData.formType);

    const newForm = {
      id: generateId('FORM'),
      formNumber,
      formType: formData.formType,
      employeeId: formData.employeeId,
      employeeName: employee.name,
      projectName: formData.projectName || null,
      date: formData.date || new Date().toISOString().split('T')[0],
      createdBy,
      createdByRole: 'secretariat',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const pdfPath = await this.generatePDF(newForm, formData.formType);
    newForm.pdfPath = pdfPath;

    forms.push(newForm);
    await this.saveForms(forms);

    return newForm;
  }

  async getAllForms(filters = {}) {
    let forms = await this.loadForms();

    if (filters.formType) {
      forms = forms.filter(f => f.formType === filters.formType);
    }

    if (filters.employeeId) {
      forms = forms.filter(f => f.employeeId === filters.employeeId);
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
  }

  async getFormById(id) {
    const forms = await this.loadForms();
    const form = forms.find(f => f.id === id);

    if (!form) {
      throw new Error('Form not found');
    }

    return form;
  }

  async deleteForm(id) {
    const forms = await this.loadForms();
    const formIndex = forms.findIndex(f => f.id === id);

    if (formIndex === -1) {
      throw new Error('Form not found');
    }

    const form = forms[formIndex];

    if (form.pdfPath && fsSync.existsSync(form.pdfPath)) {
      await fs.unlink(form.pdfPath).catch(() => {});
    }

    forms.splice(formIndex, 1);
    await this.saveForms(forms);

    return { message: 'Form deleted successfully' };
  }

  async updateFormStatus(id, status) {
    const forms = await this.loadForms();
    const formIndex = forms.findIndex(f => f.id === id);

    if (formIndex === -1) {
      throw new Error('Form not found');
    }

    forms[formIndex].status = status;
    forms[formIndex].updatedAt = new Date().toISOString();

    await this.saveForms(forms);

    return forms[formIndex];
  }
}

module.exports = new SecretariatService();