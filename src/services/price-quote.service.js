// src/services/price-quote.service.js - UPDATED WITH includeStaticFile SUPPORT

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/quotes-id-generator.util');
const nodemailer = require('nodemailer');
const pdfPoppler = require('pdf-poppler');
const sharp = require('sharp');

const QUOTES_FILE = path.join(__dirname, '../../data/quotations/index.json');
const QUOTES_DIR = path.join(__dirname, '../../data/quotations');
const PDF_DIR = path.join(__dirname, '../../data/quotations/pdfs');
const AR_UPLOADS_DIR = path.join(__dirname, '../../data/quotations/AR-Uploads');
const EN_UPLOADS_DIR = path.join(__dirname, '../../data/quotations/EN-Uploads');
const LOGO_PATH = path.join(__dirname, '../../assets/images/OmegaLogo.png');
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// ✅ NEW: Path to static terms and conditions PDF
const STATIC_TERMS_PDF_PATH = path.join(__dirname, '../../data/Terms And Conditions/terms-and-conditions.pdf');

// ✅ Email configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// ✅ Log configuration on startup
console.log('📧 Email Configuration (Price Quotes):');
console.log('  - Host:', EMAIL_HOST);
console.log('  - Port:', EMAIL_PORT);
console.log('  - User:', EMAIL_USER ? '✅ Configured' : '❌ Missing');
console.log('  - Password:', EMAIL_PASS ? '✅ Configured' : '❌ Missing');
console.log('  - From:', EMAIL_FROM);


class PriceQuoteService {
  async loadUsers() {
    try {
      console.log('Loading users from:', USERS_FILE);
      const data = await fs.readFile(USERS_FILE, 'utf8');
      const users = JSON.parse(data);
      console.log('Loaded users count:', users.length);
      return users;
    } catch (error) {
      console.error('Error loading users file:', error);
      if (error.code === 'ENOENT') {
        console.error('Users file does not exist at:', USERS_FILE);
        return [];
      }
      throw error;
    }
  }

  async getUserNameById(userId) {
    try {
      const users = await this.loadUsers();
      console.log('=== USER LOOKUP DEBUG (QUOTES) ===');
      console.log('Looking for userId:', userId);
      console.log('Type of userId:', typeof userId);
      
      let user = users.find(u => u.id === userId);
      
      if (!user && typeof userId !== 'string') {
        const userIdStr = String(userId);
        console.log('Trying string conversion:', userIdStr);
        user = users.find(u => u.id === userIdStr);
      }
      
      if (!user && typeof userId === 'string') {
        const userIdTrimmed = userId.trim();
        console.log('Trying trimmed version:', userIdTrimmed);
        user = users.find(u => u.id.trim() === userIdTrimmed);
      }
      
      if (user) {
        console.log('✓ Found user:', user.name);
        console.log('===================================');
        return user.name;
      } else {
        console.log('✗ User not found for ID:', userId);
        console.log('===================================');
        return null;
      }
    } catch (error) {
      console.error('Error getting user name:', error);
      return null;
    }
  }

  async enrichQuotesWithCreatorNames(quotes) {
    const users = await this.loadUsers();
    
    return Promise.all(quotes.map(async quote => {
      const user = users.find(u => u.id === quote.createdBy);
      
      if (user && user.name) {
        return {
          ...quote,
          createdByName: user.name
        };
      } else {
        return {
          ...quote,
          createdByName: 'Unknown User'
        };
      }
    }));
  }

  async initialize() {
    try {
      const dirs = [QUOTES_DIR, PDF_DIR, AR_UPLOADS_DIR, EN_UPLOADS_DIR];
      for (const dir of dirs) {
        if (!fsSync.existsSync(dir)) {
          await fs.mkdir(dir, { recursive: true });
        }
      }

      if (!fsSync.existsSync(QUOTES_FILE)) {
        await atomicWrite.writeFile(QUOTES_FILE, JSON.stringify([], null, 2));
      }
    } catch (error) {
      console.error('Error initializing price quotes:', error);
      throw error;
    }
  }

  async getUserInfo(userId) {
    const users = await this.loadUsers();
    const user = users.find(u => u.id === userId);
    
    if (user) {
      return {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email
      };
    }
    
    return null;
  }

  async enrichQuotesWithUserInfo(quotes) {
    const users = await this.loadUsers();
    
    return quotes.map(quote => {
      const enrichedQuote = { ...quote };
      
      if (quote.createdBy) {
        const creator = users.find(u => u.id === quote.createdBy);
        if (creator) {
          enrichedQuote.createdByInfo = {
            id: creator.id,
            name: creator.name,
            username: creator.username,
            email: creator.email
          };
        }
      }
      
      return enrichedQuote;
    });
  }

  async loadQuotes() {
    try {
      await this.initialize();
      const data = await fs.readFile(QUOTES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading quotes:', error);
      return [];
    }
  }

  async saveQuotes(quotes) {
    await atomicWrite.writeFile(QUOTES_FILE, JSON.stringify(quotes, null, 2));
  }

  async generateQuoteNumber() {
    const quotes = await this.loadQuotes();
    if (quotes.length === 0) return 'PQ0001';

    const numbers = quotes.map(q => {
      const match = q.quoteNumber.match(/PQ(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });

    const maxNumber = Math.max(...numbers);
    return `PQ${(maxNumber + 1).toString().padStart(4, '0')}`;
  }

  calculateTotals(items, includeTax, taxRate) {
    if (!items || items.length === 0) {
      return {
        subtotal: 0,
        taxAmount: 0,
        total: 0
      };
    }

    const subtotal = items.reduce((sum, item) => {
      return sum + (item.quantity || 0) * (item.unitPrice || 0);
    }, 0);

    let taxAmount = 0;
    if (includeTax && taxRate) {
      taxAmount = (subtotal * taxRate) / 100;
    }

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      total: parseFloat((subtotal + taxAmount).toFixed(2))
    };
  }

  async saveAttachment(attachmentFile, language) {
    const uploadDir = language === 'arabic' ? AR_UPLOADS_DIR : EN_UPLOADS_DIR;
    const filename = `${Date.now()}-${attachmentFile.originalname}`;
    const filepath = path.join(uploadDir, filename);

    await fs.writeFile(filepath, attachmentFile.buffer);
    return filepath;
  }

  async convertPdfPagesToImages(pdfPath) {
    try {
      console.log('Converting attachment PDF to images...');

      const outputDir = path.join(__dirname, '../../temp-pdf-pages');
      await fs.mkdir(outputDir, { recursive: true });

      const opts = {
        format: 'png',
        out_dir: outputDir,
        out_prefix: `page-${Date.now()}`,
        page: null
      };

      await pdfPoppler.convert(pdfPath, opts);

      const files = (await fs.readdir(outputDir))
        .filter(f => f.endsWith('.png'))
        .sort((a, b) => {
          const na = parseInt(a.match(/-(\d+)\.png$/)?.[1] || 0);
          const nb = parseInt(b.match(/-(\d+)\.png$/)?.[1] || 0);
          return na - nb;
        });

      const base64Pages = [];

      for (const file of files) {
        const fullPath = path.join(outputDir, file);
        const buffer = await fs.readFile(fullPath);

        const optimized = await sharp(buffer)
          .resize({ width: 850, height: 1100, fit: 'inside', withoutEnlargement: true })
          .png({ quality: 94 })
          .toBuffer();

        base64Pages.push(optimized.toString('base64'));
        await fs.unlink(fullPath).catch(() => {});
      }

      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});

      console.log(`Converted ${base64Pages.length} page(s)`);
      return base64Pages;
    } catch (error) {
      console.error('Failed to convert PDF to images:', error);
      throw error;
    }
  }

  buildHeaderHTML(quoteData, isArabic) {
    const logoBase64 = fsSync.existsSync(LOGO_PATH)
      ? fsSync.readFileSync(LOGO_PATH, 'base64')
      : '';

    return `
      <div style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:10px 30px; border-bottom:3px solid #0b4fa2;">
        <div style="text-align:left; font-family:'Roboto',Arial,sans-serif; font-size:11px;">
          <p style="margin:3px 0;"><strong style="color:#0b4fa2;">Quote No:</strong> ${quoteData.quoteNumber}</p>
          <p style="margin:3px 0;"><strong style="color:#0b4fa2;">DATE:</strong> ${quoteData.date}</p>
        </div>
        <div>
          ${logoBase64 ? `<img src="data:image/png;base64,${logoBase64}" style="height:60px;" />` : ''}
        </div>
      </div>
    `;
  }

  buildFooterHTML(isArabic) {
    return `
      <div style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:0 30px; font-size:11px; color:#555; border-top:1px solid #ddd;">
        <div style="font-family:'Roboto',Arial,sans-serif;">OMEGA-SAL-06</div>
        <div style="font-family:'Cairo',Arial,sans-serif;">
          ${isArabic ? 'صفحة <span class="pageNumber"></span> من <span class="totalPages"></span>' : 'Page <span class="pageNumber"></span> of <span class="totalPages"></span>'}
        </div>
      </div>
    `;
  }

  // ✅ UPDATED: Add includeStaticFile parameter
  async generatePDF(quoteData, attachmentPath = null, includeStaticFile = false) {
    let browser;
    try {
      const isArabic = quoteData.language === 'arabic';
      const totals = this.calculateTotals(quoteData.items, quoteData.includeTax, quoteData.taxRate);

      const mainContent = this.buildMainContent(quoteData, totals, isArabic);

      console.log('🔵 Generating PDF for quote:', quoteData.quoteNumber);
      console.log('🔵 Include static file:', includeStaticFile);

      // ✅ Build attachment HTML (user-uploaded PDF)
      let attachmentHTML = '';
      if (attachmentPath && fsSync.existsSync(attachmentPath)) {
        const attachmentPages = await this.convertPdfPagesToImages(attachmentPath);
        attachmentPages.forEach((base64, index) => {
          attachmentHTML += `
            <div style="page-break-before: always; height: 100vh; display: flex; align-items: center; justify-content: center; background: white; padding: 10px; box-sizing: border-box;">
              <img src="data:image/png;base64,${base64}" style="max-width:100%; max-height:100%; object-fit: contain;" alt="Attachment page ${index + 1}" />
            </div>
          `;
        });
      }

      // ✅ NEW: Add static terms PDF as images if includeStaticFile is true
      let staticTermsHTML = '';
      if (includeStaticFile === true) {
        try {
          if (fsSync.existsSync(STATIC_TERMS_PDF_PATH)) {
            console.log('✅ Adding static terms and conditions PDF...');
            const staticPages = await this.convertPdfPagesToImages(STATIC_TERMS_PDF_PATH);
            staticPages.forEach((base64, index) => {
              staticTermsHTML += `
                <div style="page-break-before: always; height: 100vh; display: flex; align-items: center; justify-content: center; background: white; padding: 10px; box-sizing: border-box;">
                  <img src="data:image/png;base64,${base64}" style="max-width:100%; max-height:100%; object-fit: contain;" alt="Terms page ${index + 1}" />
                </div>
              `;
            });
            console.log(`✅ Added ${staticPages.length} page(s) from static terms PDF`);
          } else {
            console.warn('⚠️ Static terms PDF file not found at:', STATIC_TERMS_PDF_PATH);
          }
        } catch (error) {
          console.error('❌ Error reading static terms PDF:', error.message);
        }
      }

      const fullHTML = `
<!DOCTYPE html>
<html lang="${isArabic ? 'ar' : 'en'}" dir="${isArabic ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <title>${isArabic ? 'عرض سعر' : 'Price Quote'} - OMEGA</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${isArabic ? "'Cairo', Arial, sans-serif" : "'Roboto', Arial, sans-serif"};
      background: white;
    }
    .main-content { padding: 20px 30px; }
    .title { text-align: center; margin: 20px 0 15px; font-size: 26px; font-weight: 700; color: #0b4fa2; }
    .project-name { 
      text-align: center; 
      margin: 0 0 25px; 
      font-size: 20px; 
      font-weight: 600; 
      color: #2563eb;
      padding: 12px 20px;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-radius: 8px;
      border-left: 4px solid #2563eb;
      border-right: 4px solid #2563eb;
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.1);
    }
    .company { margin-bottom: 25px; padding: 15px 20px; border-radius: 7px; }
    .row { display: flex; justify-content: space-between; align-items: flex-start; }
    .col-left, .col-right { width: 48%; font-size: 13px; line-height: 1.6; }
    .col-right { text-align: right; direction: rtl; }
    .col-left { text-align: left; direction: ltr; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    table th { background: #0b4fa2; color: white; padding: 10px 8px; border: 1px solid #000; font-weight: 700; font-size: 13px; }
    table td { padding: 8px 6px; border: 1px solid #ddd; font-size: 12px; text-align: center; }
    table tbody tr:nth-child(even) { background: #f9f9f9; }
    .client-info { margin: 25px 0; padding: 15px; border: 2px solid #0b4fa2; border-radius: 5px; }
    .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 13px; }
    .totals-section { margin: 25px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; text-align: right; }
    .total-row { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 8px; }
    .total-final { padding-top: 10px; border-top: 2px solid #0b4fa2; font-size: 16px; color: #0b4fa2; }
    .notes-section { margin: 25px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; page-break-inside: avoid; }
    .notes-title { color: #0b4fa2; font-size: 15px; margin-bottom: 10px; }
  </style>
</head>
<body>
  ${mainContent}
  ${attachmentHTML}
  ${staticTermsHTML}
</body>
</html>
      `;

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
      await page.setContent(fullHTML, { waitUntil: 'networkidle0', timeout: 60000 });

      await page.evaluate(() => document.fonts.ready);
      await page.waitForNetworkIdle({ timeout: 15000 }).catch(() => {});

      const sanitizedClient = quoteData.clientName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
      const filename = `${quoteData.quoteNumber}-${quoteData.date}-${sanitizedClient}.pdf`;
      const pdfPath = path.join(PDF_DIR, filename);

      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: this.buildHeaderHTML(quoteData, isArabic),
        footerTemplate: this.buildFooterHTML(isArabic),
        margin: {
          top: '110px',
          bottom: '60px',
          left: '0px',
          right: '0px'
        }
      });

      await browser.close();
      console.log('✅ PDF generated successfully:', pdfPath);
      return pdfPath;
    } catch (error) {
      console.error('❌ PDF generation failed:', error);
      if (browser) await browser.close().catch(() => {});
      throw error;
    }
  }

  buildMainContent(data, totals, isArabic) {
    const title = isArabic ? 'عرض سعر' : 'Price Quote';
    const hasItems = data.items && data.items.length > 0;

    const escapeHtml = (text) => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const hasProjectName = data.projectName && String(data.projectName).trim() !== '';
    const projectNameHtml = hasProjectName 
      ? `<h2 class="project-name">${escapeHtml(data.projectName)}</h2>` 
      : '';

    console.log('=== PDF PROJECT NAME DEBUG ===');
    console.log('Raw projectName:', data.projectName);
    console.log('Has projectName:', hasProjectName);
    console.log('Escaped projectName:', hasProjectName ? escapeHtml(data.projectName) : 'N/A');
    console.log('==============================');

    return `
<div class="main-content">
  <section class="company">
    <div class="row">
      <div class="col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>المملكة الأردنية الهاشمية</p>
        <p>+تلفون: 96264161060+ | فاكس: +96264162060</p>
      </div>
      <div class="col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
      </div>
    </div>
  </section>

  <h1 class="title">${title}</h1>
  
  ${projectNameHtml}

  ${this.buildClientInfoSection(data, isArabic)}
  ${hasItems ? this.buildItemsTable(data.items, isArabic) : ''}
  ${hasItems ? this.buildTotalsSection(totals, data, isArabic) : ''}
  ${this.buildNotesSection(data.customNotes, isArabic)}
</div>
    `;
  }

  buildClientInfoSection(data, isArabic) {
    const labels = {
      name: isArabic ? 'اسم العميل' : 'Client Name',
      phone: isArabic ? 'هاتف العميل' : 'Client Phone',
      address: isArabic ? 'عنوان العميل' : 'Client Address',
      city: isArabic ? 'مدينة العميل' : 'Client City',
      valid: isArabic ? 'صالح لمدة' : 'Valid For',
      days: isArabic ? 'يوم' : 'days'
    };

    return `
    <section class="client-info">
      <div class="client-grid">
        <div><strong>${labels.name}:</strong> ${data.clientName}</div>
        <div><strong>${labels.phone}:</strong> ${data.clientPhone}</div>
        ${data.clientAddress ? `<div><strong>${labels.address}:</strong> ${data.clientAddress}</div>` : ''}
        ${data.clientCity ? `<div><strong>${labels.city}:</strong> ${data.clientCity}</div>` : ''}
        ${data.validForDays ? `<div><strong>${labels.valid}:</strong> ${data.validForDays} ${labels.days}</div>` : ''}
      </div>
    </section>
    `;
  }

  buildItemsTable(items, isArabic) {
    const headers = isArabic
      ? ['م', 'الوصف', 'الوحدة', 'الكمية', 'سعر الوحدة (دينار)', 'المجموع (دينار)']
      : ['#', 'Description', 'Unit', 'Quantity', 'Unit Price (JOD)', 'Total (JOD)'];

    let rows = '';
    items.forEach((item, i) => {
      const total = (item.quantity || 0) * (item.unitPrice || 0);
      rows += `
        <tr>
          <td>${i + 1}</td>
          <td>${item.description || ''}</td>
          <td>${item.unit || ''}</td>
          <td>${item.quantity || 0}</td>
          <td>${(item.unitPrice || 0).toFixed(2)}</td>
          <td>${total.toFixed(2)}</td>
        </tr>
      `;
    });

    return `
    <table>
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    `;
  }

  buildTotalsSection(totals, data, isArabic) {
    const labels = {
      subtotal: isArabic ? 'المجموع الفرعي:' : 'Subtotal:',
      tax: isArabic ? `نسبة الضريبة (${data.taxRate || 0}%):` : `Tax (${data.taxRate || 0}%):`,
      total: isArabic ? 'المجموع الإجمالي:' : 'Total:'
    };

    return `
    <section class="totals-section">
      <div class="total-row">
        <strong>${labels.subtotal}</strong>
        <span>JOD ${totals.subtotal.toFixed(2)}</span>
      </div>
      ${data.includeTax ? `
      <div class="total-row">
        <strong>${labels.tax}</strong>
        <span>JOD ${totals.taxAmount.toFixed(2)}</span>
      </div>` : ''}
      <div class="total-row total-final">
        <strong>${labels.total}</strong>
        <strong>JOD ${totals.total.toFixed(2)}</strong>
      </div>
    </section>
    `;
  }

  buildNotesSection(notes, isArabic) {
    if (!notes) return '';
    const title = isArabic ? 'ملاحظات وشروط:' : 'Notes & Terms:';
    return `
    <section class="notes-section">
      <h3 class="notes-title">${title}</h3>
      <div style="white-space: pre-wrap;">${notes}</div>
    </section>
    `;
  }

  // ✅ UPDATED: Add includeStaticFile parameter
  async createQuote(quoteData, currentUser, attachmentFile = null) {
    console.log('\n=== CREATE QUOTE DEBUG ===');
    console.log('currentUser.id:', currentUser.id);
    console.log('currentUser.name:', currentUser.name);
    console.log('quoteData.projectName:', quoteData.projectName);
    console.log('quoteData.includeStaticFile:', quoteData.includeStaticFile); // ✅ NEW LOG
    
    const quotes = await this.loadQuotes();
    const quoteNumber = await this.generateQuoteNumber();

    const createdByName = await this.getUserNameById(currentUser.id);
    console.log('getUserNameById returned:', createdByName);
    console.log('==========================\n');

    const newQuote = {
      id: generateId('QUOTE'),
      quoteNumber,
      clientName: quoteData.clientName,
      clientPhone: quoteData.clientPhone,
      clientAddress: quoteData.clientAddress || null,
      clientCity: quoteData.clientCity || null,
      projectName: quoteData.projectName || null,
      date: quoteData.date,
      revNumber: quoteData.revNumber || '00',
      validForDays: quoteData.validForDays || null,
      language: quoteData.language || 'arabic',
      includeTax: !!quoteData.includeTax,
      taxRate: quoteData.includeTax ? (quoteData.taxRate || 0) : 0,
      items: quoteData.items || [],
      customNotes: quoteData.customNotes || null,
      includeStaticFile: quoteData.includeStaticFile || false, // ✅ NEW FIELD
      createdBy: currentUser.id,
      createdByName: createdByName || currentUser.name || 'Unknown User', 
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const totals = this.calculateTotals(newQuote.items, newQuote.includeTax, newQuote.taxRate);
    newQuote.subtotal = totals.subtotal;
    newQuote.taxAmount = totals.taxAmount;
    newQuote.total = totals.total;

    let attachmentPath = null;
    if (attachmentFile) {
      attachmentPath = await this.saveAttachment(attachmentFile, newQuote.language);
      newQuote.attachmentPath = attachmentPath;
    }

    // ✅ UPDATED: Pass includeStaticFile to PDF generator
    const pdfPath = await this.generatePDF(newQuote, attachmentPath, newQuote.includeStaticFile);
    newQuote.pdfPath = pdfPath;

    quotes.push(newQuote);
    await this.saveQuotes(quotes);

    console.log('Quote created with name:', newQuote.createdByName);
    console.log('Quote created with projectName:', newQuote.projectName);
    console.log('Quote created with includeStaticFile:', newQuote.includeStaticFile); // ✅ NEW LOG
    return newQuote;
  }

  async getAllQuotes(filters = {}) {
    let quotes = await this.loadQuotes();

    quotes = await this.enrichQuotesWithCreatorNames(quotes);

    if (filters.createdBy) {
      quotes = quotes.filter(q => q.createdBy === filters.createdBy);
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      quotes = quotes.filter(q =>
        q.quoteNumber.toLowerCase().includes(searchLower) ||
        q.clientName.toLowerCase().includes(searchLower) ||
        (q.clientPhone && q.clientPhone.toLowerCase().includes(searchLower)) ||
        (q.projectName && q.projectName.toLowerCase().includes(searchLower)) ||
        (q.createdByName && q.createdByName.toLowerCase().includes(searchLower))
      );
    }

    quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedQuotes = quotes.slice(startIndex, endIndex);

    const enrichedQuotes = await this.enrichQuotesWithUserInfo(paginatedQuotes);

    return {
      quotes: enrichedQuotes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(quotes.length / limit),
        totalQuotes: quotes.length,
        limit
      }
    };
  }

  async getLatestQuoteByUser(userId) {
    const quotes = await this.loadQuotes();
    const userQuotes = quotes.filter(q => q.createdBy === userId);

    if (userQuotes.length === 0) return null;

    userQuotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latestQuote = userQuotes[0];

    const createdByName = await this.getUserNameById(latestQuote.createdBy);
    return {
      ...latestQuote,
      createdByName: createdByName || latestQuote.createdByName || 'Unknown User'
    };
  }

  async getQuoteById(id) {
    const quotes = await this.loadQuotes();
    const quote = quotes.find(q => q.id === id);

    if (!quote) {
      throw new Error('Quote not found');
    }

    const createdByName = await this.getUserNameById(quote.createdBy);
    return {
      ...quote,
      createdByName: createdByName || quote.createdByName || 'Unknown User'
    };
  }

  // ✅ UPDATED: Add includeStaticFile parameter
  async updateQuote(id, updateData, attachmentFile = null) {
    const quotes = await this.loadQuotes();
    const quoteIndex = quotes.findIndex(q => q.id === id);

    if (quoteIndex === -1) {
      throw new Error('Quote not found');
    }

    const quote = quotes[quoteIndex];

    if (updateData.clientName) quote.clientName = updateData.clientName;
    if (updateData.clientPhone) quote.clientPhone = updateData.clientPhone;
    if (updateData.clientAddress !== undefined) quote.clientAddress = updateData.clientAddress;
    if (updateData.clientCity !== undefined) quote.clientCity = updateData.clientCity;
    if (updateData.projectName !== undefined) quote.projectName = updateData.projectName;
    if (updateData.date) quote.date = updateData.date;
    if (updateData.revNumber !== undefined) quote.revNumber = updateData.revNumber;
    if (updateData.validForDays !== undefined) quote.validForDays = updateData.validForDays;
    if (updateData.language) quote.language = updateData.language;
    if (updateData.includeTax !== undefined) quote.includeTax = !!updateData.includeTax;
    if (updateData.taxRate !== undefined) quote.taxRate = updateData.taxRate;
    if (updateData.items !== undefined) quote.items = updateData.items;
    if (updateData.customNotes !== undefined) quote.customNotes = updateData.customNotes;
    if (updateData.includeStaticFile !== undefined) quote.includeStaticFile = updateData.includeStaticFile; // ✅ NEW FIELD

    const totals = this.calculateTotals(quote.items, quote.includeTax, quote.taxRate);
    quote.subtotal = totals.subtotal;
    quote.taxAmount = totals.taxAmount;
    quote.total = totals.total;

    quote.updatedAt = new Date().toISOString();

    let attachmentPath = quote.attachmentPath;
    if (attachmentFile) {
      if (attachmentPath && fsSync.existsSync(attachmentPath)) {
        await fs.unlink(attachmentPath).catch(() => {});
      }
      attachmentPath = await this.saveAttachment(attachmentFile, quote.language);
      quote.attachmentPath = attachmentPath;
    }

    console.log('Updating quote with projectName:', quote.projectName);
    console.log('Updating quote with includeStaticFile:', quote.includeStaticFile); // ✅ NEW LOG
    
    // ✅ UPDATED: Pass includeStaticFile to PDF generator
    const pdfPath = await this.generatePDF(quote, attachmentPath, quote.includeStaticFile);
    quote.pdfPath = pdfPath;

    quotes[quoteIndex] = quote;
    await this.saveQuotes(quotes);

    const createdByName = await this.getUserNameById(quote.createdBy);
    return {
      ...quote,
      createdByName: createdByName || quote.createdByName || 'Unknown User'
    };
  }

  async deleteQuote(id) {
    const quotes = await this.loadQuotes();
    const quoteIndex = quotes.findIndex(q => q.id === id);

    if (quoteIndex === -1) {
      throw new Error('Quote not found');
    }

    const quote = quotes[quoteIndex];

    if (quote.pdfPath && fsSync.existsSync(quote.pdfPath)) {
      await fs.unlink(quote.pdfPath).catch(() => {});
    }

    if (quote.attachmentPath && fsSync.existsSync(quote.attachmentPath)) {
      await fs.unlink(quote.attachmentPath).catch(() => {});
    }

    quotes.splice(quoteIndex, 1);
    await this.saveQuotes(quotes);

    return { message: 'Quote deleted successfully' };
  }

  /**
   * ✅ Send quote PDF by email
   */
  async sendQuoteByEmail(quoteId, userId, userRole, recipientEmail) {
    try {
      console.log('\n📧 === SEND EMAIL DEBUG (QUOTE) ===');
      console.log('Quote ID:', quoteId);
      console.log('User ID:', userId);
      console.log('Recipient:', recipientEmail);
      
      // ✅ Check credentials first
      if (!EMAIL_USER || !EMAIL_PASS) {
        console.error('❌ Email credentials missing!');
        throw new Error('Email configuration error: Missing SMTP credentials. Please check your .env file.');
      }

      // Get quote
      const quote = await this.getQuoteById(quoteId);
      console.log('✅ Quote found:', quote.quoteNumber);

      if (!quote.pdfPath || !fsSync.existsSync(quote.pdfPath)) {
        throw new Error('PDF file not found');
      }
      console.log('✅ PDF file found');

      // Get creator's information
      const users = await this.loadUsers();
      const creator = users.find(u => u.id === quote.createdBy);
      
      const senderName = creator && creator.name ? creator.name : 'Omega System';
      const creatorEmail = creator && creator.email ? creator.email : null;
      
      console.log('✅ Creator info:', { name: senderName, hasEmail: !!creatorEmail });

      // ✅ Create transporter with system credentials
      console.log('📧 Creating email transporter...');
      
      const transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        secure: EMAIL_PORT === 465,
        auth: {
          user: EMAIL_USER,
          pass: EMAIL_PASS,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      // ✅ Verify connection
      console.log('🔄 Verifying SMTP connection...');
      await transporter.verify();
      console.log('✅ SMTP connection verified');

      // Email subject and body
      const subject = `Price Quote ${quote.quoteNumber}`;
      const text = `Please find attached the price quote ${quote.quoteNumber}.\n\nClient: ${quote.clientName}\nDate: ${quote.date}\nProject: ${quote.projectName || 'N/A'}\n\nSent by: ${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}`;
      const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1565C0 0%, #0D47A1 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
            <h2 style="margin: 0; font-size: 24px;">Price Quote ${quote.quoteNumber}</h2>
          </div>
          <div style="background: #f8fafc; padding: 20px; border-radius: 0 0 10px 10px;">
            <p style="color: #475569; font-size: 16px; margin-bottom: 20px;">Please find attached the price quote document.</p>
            <table style="border-collapse: collapse; width: 100%; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Quote Number:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #1565C0; font-weight: 600;">${quote.quoteNumber}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Client:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${quote.clientName}</td>
              </tr>
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Date:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${quote.date}</td>
              </tr>
              ${quote.projectName ? `
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #334155;">Project:</td>
                <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #475569;">${quote.projectName}</td>
              </tr>
              ` : ''}
              <tr style="background: #f8fafc;">
                <td style="padding: 12px 16px; font-weight: bold; color: #334155;">Sent By:</td>
                <td style="padding: 12px 16px; color: #475569;">${senderName}${creatorEmail ? ` (${creatorEmail})` : ''}</td>
              </tr>
            </table>
            <div style="margin-top: 20px; padding: 16px; background: #e0f2fe; border-left: 4px solid #1565C0; border-radius: 6px;">
              <p style="margin: 0; color: #0c4a6e; font-size: 14px;">
                <strong>Note:</strong> This is an automated email from Omega System.
              </p>
            </div>
          </div>
        </div>
      `;

      // ✅ Send email
      console.log('📧 Sending email...');
      const mailOptions = {
        from: `"${senderName} - Omega System" <${EMAIL_USER}>`,
        to: recipientEmail,
        subject: subject,
        text: text,
        html: html,
        attachments: [
          {
            filename: `Quote_${quote.quoteNumber}.pdf`,
            path: quote.pdfPath,
          },
        ],
      };

      if (creatorEmail) {
        mailOptions.replyTo = creatorEmail;
        console.log('✅ Reply-to set:', creatorEmail);
      }

      const info = await transporter.sendMail(mailOptions);

      console.log('✅ Email sent successfully!');
      console.log('  - Message ID:', info.messageId);
      console.log('========================\n');

      return {
        message: 'Email sent successfully',
        messageId: info.messageId,
        sentFrom: EMAIL_USER,
        sentBy: senderName,
        replyTo: creatorEmail || null
      };
    } catch (error) {
      console.error('❌ Email sending error:', error);
      
      let errorMessage = error.message;
      if (error.code === 'EAUTH') {
        errorMessage = 'Email authentication failed. Please check your EMAIL_USER and EMAIL_APP_PASSWORD in .env file.';
      } else if (error.code === 'ESOCKET') {
        errorMessage = 'Cannot connect to email server. Please check your EMAIL_HOST and EMAIL_PORT settings.';
      } else if (error.message.includes('Missing credentials')) {
        errorMessage = 'Email credentials are not configured. Please set EMAIL_USER and EMAIL_APP_PASSWORD in your .env file.';
      }
      
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }
}


module.exports = new PriceQuoteService();