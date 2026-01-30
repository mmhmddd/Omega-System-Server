// src/services/price-quote.service.js

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const atomicWrite = require('../utils/atomic-write.util');
const { generateId } = require('../utils/quotes-id-generator.util');

const pdfPoppler = require('pdf-poppler');
const sharp = require('sharp');

const QUOTES_FILE = path.join(__dirname, '../../data/quotations/index.json');
const QUOTES_DIR = path.join(__dirname, '../../data/quotations');
const PDF_DIR = path.join(__dirname, '../../data/quotations/pdfs');
const AR_UPLOADS_DIR = path.join(__dirname, '../../data/quotations/AR-Uploads');
const EN_UPLOADS_DIR = path.join(__dirname, '../../data/quotations/EN-Uploads');
const LOGO_PATH = path.join(__dirname, '../../assets/images/OmegaLogo.png');
// ✅ NEW: Path to users file for user info enrichment
const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

class PriceQuoteService {
  // ✅ NEW: Load users from JSON file
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

  // ✅ NEW: Get user name by ID
  async getUserNameById(userId) {
    try {
      const users = await this.loadUsers();
      console.log('=== USER LOOKUP DEBUG (QUOTES) ===');
      console.log('Looking for userId:', userId);
      console.log('Type of userId:', typeof userId);
      
      // Try exact match first
      let user = users.find(u => u.id === userId);
      
      // If not found, try string comparison
      if (!user && typeof userId !== 'string') {
        const userIdStr = String(userId);
        console.log('Trying string conversion:', userIdStr);
        user = users.find(u => u.id === userIdStr);
      }
      
      // If still not found, try trimming whitespace
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

  // ✅ NEW: Add creator names to quotes
  async enrichQuotesWithCreatorNames(quotes) {
    const users = await this.loadUsers();
    
    return Promise.all(quotes.map(async quote => {
      // Always look up the current user name from users database
      const user = users.find(u => u.id === quote.createdBy);
      
      if (user && user.name) {
        // User found - use their current name
        return {
          ...quote,
          createdByName: user.name
        };
      } else {
        // User not found - use Unknown User
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

  // ✅ NEW: Load users for user info enrichment
  async loadUsers() {
    try {
      if (!fsSync.existsSync(USERS_FILE)) {
        return [];
      }
      const data = await fs.readFile(USERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading users:', error);
      return [];
    }
  }

  // ✅ NEW: Get user info by ID
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

  // ✅ NEW: Enrich quotes with user information
  async enrichQuotesWithUserInfo(quotes) {
    const users = await this.loadUsers();
    
    return quotes.map(quote => {
      const enrichedQuote = { ...quote };
      
      // Find creator info
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
          <p style="margin:3px 0;"><strong style="color:#0b4fa2;">REV. No:</strong> ${quoteData.revNumber || '00'}</p>
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

  async generatePDF(quoteData, attachmentPath = null) {
    let browser;
    try {
      const isArabic = quoteData.language === 'arabic';
      const totals = this.calculateTotals(quoteData.items, quoteData.includeTax, quoteData.taxRate);

      const mainContent = this.buildMainContent(quoteData, totals, isArabic);

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
    .title { text-align: center; margin: 20px 0 25px; font-size: 26px; font-weight: 700; color: #0b4fa2; }
    .company { margin-bottom: 25px; background: #ecebeb; padding: 15px 20px; border-radius: 7px; }
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
      console.log('PDF generated successfully:', pdfPath);
      return pdfPath;
    } catch (error) {
      console.error('PDF generation failed:', error);
      if (browser) await browser.close().catch(() => {});
      throw error;
    }
  }

  buildMainContent(data, totals, isArabic) {
    const title = isArabic ? 'عرض سعر' : 'Price Quote';

    return `
<div class="main-content">
  <h1 class="title">${title}</h1>

  <section class="company">
    <div class="row">
      <div class="col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميع – تركيب – تصنيع</p>
        <p>المملكة الأردنية الهاشمية</p>
        <p>تلفون: +96264161060 | فاكس: +96264162060</p>
      </div>
      <div class="col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
      </div>
    </div>
  </section>

  ${this.buildClientInfoSection(data, isArabic)}
  ${this.buildItemsTable(data.items, isArabic)}
  ${this.buildTotalsSection(totals, data, isArabic)}
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

  // ──────────────────────────────────────────────
  // CRUD Operations
  // ──────────────────────────────────────────────

  async createQuote(quoteData, currentUser, attachmentFile = null) {
    console.log('\n=== CREATE QUOTE DEBUG ===');
    console.log('currentUser.id:', currentUser.id);
    console.log('currentUser.name:', currentUser.name);
    
    const quotes = await this.loadQuotes();
    const quoteNumber = await this.generateQuoteNumber();

    // Get creator name from users database (to ensure consistency)
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
      date: quoteData.date,
      revNumber: quoteData.revNumber || '00',
      validForDays: quoteData.validForDays || null,
      language: quoteData.language || 'arabic',
      includeTax: !!quoteData.includeTax,
      taxRate: quoteData.includeTax ? (quoteData.taxRate || 0) : 0,
      items: quoteData.items || [],
      customNotes: quoteData.customNotes || null,
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

    const pdfPath = await this.generatePDF(newQuote, attachmentPath);
    newQuote.pdfPath = pdfPath;

    quotes.push(newQuote);
    await this.saveQuotes(quotes);

    console.log('Quote created with name:', newQuote.createdByName);
    return newQuote;
  }



  
  // ✅ UPDATED: Enrich quotes with creator names
  async getAllQuotes(filters = {}) {
    let quotes = await this.loadQuotes();

    // ✅ Add creator names to all quotes
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
        (q.createdByName && q.createdByName.toLowerCase().includes(searchLower)) // ✅ Search by creator name
      );
    }

    quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const paginatedQuotes = quotes.slice(startIndex, endIndex);

    // ✅ Enrich with user info
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

  // ✅ UPDATED: Get latest quote with creator name
  async getLatestQuoteByUser(userId) {
    const quotes = await this.loadQuotes();
    const userQuotes = quotes.filter(q => q.createdBy === userId);

    if (userQuotes.length === 0) return null;

    userQuotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latestQuote = userQuotes[0];

    // ✅ Add creator name
    const createdByName = await this.getUserNameById(latestQuote.createdBy);
    return {
      ...latestQuote,
      createdByName: createdByName || latestQuote.createdByName || 'Unknown User'
    };
  }

  // ✅ UPDATED: Get quote by ID with creator name
  async getQuoteById(id) {
    const quotes = await this.loadQuotes();
    const quote = quotes.find(q => q.id === id);

    if (!quote) {
      throw new Error('Quote not found');
    }

    // ✅ Add creator name
    const createdByName = await this.getUserNameById(quote.createdBy);
    return {
      ...quote,
      createdByName: createdByName || quote.createdByName || 'Unknown User'
    };
  }

  // ✅ UPDATED: Update quote (keep creator info unchanged)
  async updateQuote(id, updateData, attachmentFile = null) {
    const quotes = await this.loadQuotes();
    const quoteIndex = quotes.findIndex(q => q.id === id);

    if (quoteIndex === -1) {
      throw new Error('Quote not found');
    }

    const quote = quotes[quoteIndex];

    // Update fields if provided
    if (updateData.clientName) quote.clientName = updateData.clientName;
    if (updateData.clientPhone) quote.clientPhone = updateData.clientPhone;
    if (updateData.clientAddress !== undefined) quote.clientAddress = updateData.clientAddress;
    if (updateData.clientCity !== undefined) quote.clientCity = updateData.clientCity;
    if (updateData.date) quote.date = updateData.date;
    if (updateData.revNumber !== undefined) quote.revNumber = updateData.revNumber;
    if (updateData.validForDays !== undefined) quote.validForDays = updateData.validForDays;
    if (updateData.language) quote.language = updateData.language;
    if (updateData.includeTax !== undefined) quote.includeTax = !!updateData.includeTax;
    if (updateData.taxRate !== undefined) quote.taxRate = updateData.taxRate;
    if (updateData.items) quote.items = updateData.items;
    if (updateData.customNotes !== undefined) quote.customNotes = updateData.customNotes;

    // ✅ DO NOT update createdBy and createdByName - they remain unchanged

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

    const pdfPath = await this.generatePDF(quote, attachmentPath);
    quote.pdfPath = pdfPath;

    quotes[quoteIndex] = quote;
    await this.saveQuotes(quotes);

    // ✅ Add creator name before returning
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
}

module.exports = new PriceQuoteService();