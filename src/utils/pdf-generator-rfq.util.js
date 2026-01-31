// src/utils/pdf-generator-rfq.util.js - UPDATED WITH IMPROVED LANGUAGE DETECTION & DEPARTMENT TRANSLATION

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class RFQPDFGenerator {
  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  // ✅ UPDATED: Detect language based on CONTENT ONLY (exclude date and time)
  detectLanguage(rfqData) {
    const fieldsToCheck = [];
    
    // ✅ Add content fields (NOT date/time)
    if (rfqData.requester) fieldsToCheck.push(rfqData.requester);
    if (rfqData.production) fieldsToCheck.push(rfqData.production);
    if (rfqData.supplier) fieldsToCheck.push(rfqData.supplier);
    if (rfqData.supplierAddress) fieldsToCheck.push(rfqData.supplierAddress);
    if (rfqData.notes) fieldsToCheck.push(rfqData.notes);

    // Add item descriptions
    if (rfqData.items && rfqData.items.length > 0) {
      rfqData.items.forEach(item => {
        if (item.description) fieldsToCheck.push(item.description);
        if (item.unit) fieldsToCheck.push(item.unit);
      });
    }

    // If no content fields, return default language
    if (fieldsToCheck.length === 0) {
      return 'ar'; // Default to Arabic
    }

    let arabicCount = 0;
    let totalFields = fieldsToCheck.length;

    fieldsToCheck.forEach(field => {
      if (this.isArabic(field)) {
        arabicCount++;
      }
    });

    // Return language based on majority of content
    return arabicCount > (totalFields / 2) ? 'ar' : 'en';
  }

  // ✅ NEW: Department translation mapping
  getDepartmentTranslation(departmentLabel, targetLanguage) {
    const departmentMap = {
      // Arabic labels
      'المشتريات': { ar: 'المشتريات', en: 'Procurement' },
      'المخزن': { ar: 'المخزن', en: 'Warehouse' },
      'الصيانة': { ar: 'الصيانة', en: 'Maintenance' },
      'المبيعات': { ar: 'المبيعات', en: 'Sales' },
      'التسويق': { ar: 'التسويق', en: 'Marketing' },
      'التطوير': { ar: 'التطوير', en: 'Development' },
      'أخرى': { ar: 'أخرى', en: 'Other' },
      
      // English labels
      'Procurement': { ar: 'المشتريات', en: 'Procurement' },
      'Warehouse': { ar: 'المخزن', en: 'Warehouse' },
      'Maintenance': { ar: 'الصيانة', en: 'Maintenance' },
      'Sales': { ar: 'المبيعات', en: 'Sales' },
      'Marketing': { ar: 'التسويق', en: 'Marketing' },
      'Development': { ar: 'التطوير', en: 'Development' },
      'Other': { ar: 'أخرى', en: 'Other' }
    };

    // If department is in the map, return translated version
    if (departmentMap[departmentLabel]) {
      return departmentMap[departmentLabel][targetLanguage];
    }

    // If not in map, return as-is
    return departmentLabel;
  }

  getLabels(lang) {
    const labels = {
      ar: {
        title: 'طلب تسعير مواد',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        rfqNumber: 'رقم الوثيقة',
        date: 'تاريخ الإصدار',
        rfqNo: 'RFQ No',
        requestInfo: 'معلومات الطلب',
        dateLabel: 'التاريخ',
        requester: 'مقدم الطلب',
        department: 'القسم',
        supplier: 'المورد',
        supplierAddress: 'عنوان المورد',
        urgent: 'عاجل',
        yes: 'نعم',
        no: 'لا',
        itemNo: 'م',
        description: 'الوصف',
        unit: 'الوحدة',
        quantity: 'الكمية',
        jobNo: 'رقم العمل',
        taskNo: 'رقم المهمة',
        estimatedUnitPrice: 'السعر التقديري',
        totalPrice: 'الإجمالي',
        notes: 'ملاحظات',
        signatures: 'التواقيع',
        requesterSig: 'مقدم الطلب',
        purchaseSig: 'مدير المشتريات',
        productionSig: 'مدير الإنتاج',
        docCode: 'OMEGA-PUR-04',
        issueDate: 'DATE OF ISSUE'
      },
      en: {
        title: 'Request For Quotation',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        rfqNumber: 'Document No',
        date: 'Issue Date',
        rfqNo: 'RFQ No',
        requestInfo: 'Request Information',
        dateLabel: 'Date',
        requester: 'Requester',
        department: 'Department',
        supplier: 'Supplier',
        supplierAddress: 'Supplier Address',
        urgent: 'Urgent',
        yes: 'Yes',
        no: 'No',
        itemNo: '#',
        description: 'Description',
        unit: 'Unit',
        quantity: 'Quantity',
        jobNo: 'Job No.',
        taskNo: 'Task No.',
        estimatedUnitPrice: 'Est. Unit Price',
        totalPrice: 'Total',
        notes: 'Notes',
        signatures: 'Signatures',
        requesterSig: 'Requester',
        purchaseSig: 'Purchase Manager',
        productionSig: 'Production Manager',
        docCode: 'OMEGA-PUR-04',
        issueDate: 'DATE OF ISSUE'
      }
    };

    return labels[lang] || labels.ar;
  }

  // ✅ Helper: Check if any field has data
  hasData(value) {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  // ✅ Helper: Check if items have any data
  hasItemsData(items) {
    if (!items || items.length === 0) return false;
    
    // Check if at least one item has at least one filled field
    return items.some(item => 
      this.hasData(item.description) ||
      this.hasData(item.unit) ||
      this.hasData(item.quantity) ||
      this.hasData(item.jobNo) ||
      this.hasData(item.taskNo) ||
      this.hasData(item.estimatedUnitPrice)
    );
  }

  // ✅ Helper: Check if request info section has data
  hasRequestInfoData(rfq) {
    return this.hasData(rfq.requester) ||
           this.hasData(rfq.production) ||
           this.hasData(rfq.supplier) ||
           this.hasData(rfq.supplierAddress) ||
           rfq.urgent === true;
  }

  // حساب السعر الإجمالي (الكمية × السعر التقديري للوحدة)
  calculateItemTotal(quantity, unitPrice) {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    return (qty * price).toFixed(2);
  }

  calculateGrandTotal(items) {
    if (!items || items.length === 0) return '0.00';
    
    let total = 0;
    items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.estimatedUnitPrice) || 0;
      total += qty * price;
    });

    return total.toFixed(2);
  }

  generateHTML(rfq) {
    // ✅ UPDATED: Detect language based on content only
    const language = this.detectLanguage(rfq);
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    const formattedDate = rfq.date || new Date().toISOString().split('T')[0];
    
    // ✅ NEW: Translate department based on detected language
    const translatedDepartment = rfq.production 
      ? this.getDepartmentTranslation(rfq.production, language)
      : '';
    
    // ✅ Check what data exists
    const hasItems = this.hasItemsData(rfq.items);
    const hasRequestInfo = this.hasRequestInfoData(rfq);
    const hasNotes = this.hasData(rfq.notes);
    const hasRFQNumber = this.hasData(rfq.rfqNumber);
    const hasDate = this.hasData(rfq.date);

    let itemsHTML = '';
    let grandTotal = '0.00';
    
    if (hasItems) {
      grandTotal = this.calculateGrandTotal(rfq.items);
      
      itemsHTML = rfq.items.map((item, index) => {
        // Only render row if at least one field has data
        const hasRowData = this.hasData(item.description) ||
                          this.hasData(item.unit) ||
                          this.hasData(item.quantity) ||
                          this.hasData(item.jobNo) ||
                          this.hasData(item.taskNo) ||
                          this.hasData(item.estimatedUnitPrice);
        
        if (!hasRowData) return '';
        
        const totalPrice = this.calculateItemTotal(item.quantity, item.estimatedUnitPrice);
        
        return `
        <tr>
          <td style="text-align: center; padding: 8px 6px;">${index + 1}</td>
          <td style="text-align: ${isRTL ? 'right' : 'left'}; padding: 8px;">${item.description || ''}</td>
          <td style="text-align: center; padding: 8px;">${item.unit || ''}</td>
          <td style="text-align: center; padding: 8px;">${item.quantity || ''}</td>
          <td style="text-align: center; padding: 8px;">${item.jobNo || ''}</td>
          <td style="text-align: center; padding: 8px;">${item.taskNo || ''}</td>
          <td style="text-align: center; padding: 8px;">${item.estimatedUnitPrice || ''}</td>
          <td style="text-align: center; padding: 8px; font-weight: 600;">${totalPrice}</td>
        </tr>
      `;
      }).join('');
    }

    // ✅ Build request info fields conditionally
    let requestInfoFields = '';
    if (hasRequestInfo) {
      const fields = [];
      
      if (this.hasData(rfq.requester)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.requester}:</span>
            <span class="info-value">${rfq.requester}</span>
          </div>
        `);
      }
      
      // ✅ UPDATED: Use translated department
      if (this.hasData(translatedDepartment)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.department}:</span>
            <span class="info-value">${translatedDepartment}</span>
          </div>
        `);
      }
      
      if (this.hasData(rfq.supplier)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.supplier}:</span>
            <span class="info-value">${rfq.supplier}</span>
          </div>
        `);
      }
      
      if (this.hasData(rfq.supplierAddress)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.supplierAddress}:</span>
            <span class="info-value">${rfq.supplierAddress}</span>
          </div>
        `);
      }
      
      if (rfq.urgent === true) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.urgent}:</span>
            <span class="info-value">${labels.yes}</span>
          </div>
        `);
      }
      
      requestInfoFields = fields.join('');
    }

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>${labels.title} - OMEGA</title>
<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

body {
  background: #fff;
  margin: 0;
  padding: 0;
}

@page {
  size: A4;
  margin: 35mm 20mm 25mm 20mm;
}

.page-content {
  width: 100%;
  background: #fff;
}

/* ✅ NEW: Company info section without gray background */
.company-info {
  padding: 10px 0;
  margin-bottom: 10px;
  direction: ltr;
  break-inside: avoid;
  page-break-inside: avoid;
}

.company-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  direction: ltr;
}

.company-left, .company-right {
  width: 48%;
}

.company-left {
  text-align: left;
  direction: ltr;
}

.company-right {
  text-align: right;
  direction: rtl;
}

.company-left p, .company-right p {
  margin: 3px 0;
  font-size: 11px;
  line-height: 1.4;
  color: #333;
}

/* ✅ NEW: Blue line separator */
.separator-line {
  width: 100%;
  height: 2px;
  background-color: #2B4C8C;
  margin: 15px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

.title {
  text-align: center;
  margin: 15px 0;
  font-size: 22px;
  color: #2B4C8C;
  font-weight: bold;
  break-inside: avoid;
  page-break-inside: avoid;
}

.doc-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  font-size: 12px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.doc-info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.doc-info-label {
  font-weight: bold;
  color: #2B4C8C;
}

.info-section {
  background-color: #E8F0FE;
  padding: 15px;
  margin-bottom: 15px;
  border-radius: 4px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.info-title {
  font-weight: bold;
  color: #2B4C8C;
  margin-bottom: 10px;
  font-size: 14px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.info-field {
  display: flex;
  gap: 10px;
  font-size: 12px;
}

.info-label {
  font-weight: bold;
  min-width: 120px;
  color: #333;
}

.info-value {
  color: #555;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin: 15px 0;
  font-size: 10px;
}

.items-table thead {
  background-color: #2B4C8C;
  color: white;
  display: table-header-group;
}

.items-table th {
  padding: 8px 6px;
  text-align: center;
  font-weight: bold;
  border: 1px solid #2B4C8C;
  font-size: 10px;
}

.items-table tbody {
  display: table-row-group;
}

.items-table tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

.items-table td {
  padding: 8px 6px;
  border: 1px solid #ddd;
  text-align: center;
  font-size: 10px;
}

.items-table tbody tr {
  background-color: #fff;
}

.items-table tbody tr:nth-child(even) {
  background-color: #f9f9f9;
}

.total-row {
  background-color: #E8F0FE !important;
  font-weight: bold;
  break-inside: avoid;
  page-break-inside: avoid;
}

.notes-section {
  background-color: #FFFBEA;
  padding: 15px;
  margin: 15px 0;
  border-radius: 4px;
  min-height: 80px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.notes-title {
  font-weight: bold;
  color: #2B4C8C;
  margin-bottom: 8px;
  font-size: 13px;
}

.notes-content {
  font-size: 12px;
  color: #555;
  line-height: 1.6;
}

.signature-section {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  gap: 20px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.signature-box {
  text-align: center;
  width: 32%;
  font-size: 11px;
}

.signature-label {
  margin-bottom: 30px;
  font-weight: normal;
  color: #333;
}

.signature-line {
  border-bottom: 1.5px solid #333;
  width: 100%;
}

@media print {
  body {
    background: none;
    padding: 0;
    margin: 0;
  }
  
  .page-content {
    margin: 0;
  }
  
  .items-table {
    page-break-inside: auto;
  }
  
  .items-table tr {
    page-break-inside: avoid;
    page-break-after: auto;
  }
  
  .items-table thead {
    display: table-header-group;
  }
  
  .items-table tfoot {
    display: table-footer-group;
  }
}
</style>
</head>

<body>

<div class="page-content">

  <!-- ✅ NEW LAYOUT: Company info without gray background -->
  <div class="company-info">
    <div class="company-row">
      <div class="company-left">
        <p><strong>${labels.companyNameEn}</strong></p>
        <p>${labels.taglineEn}</p>
        <p>${labels.country}</p>
        <p>${labels.tel}</p>
        <p>${labels.website}</p>
      </div>
      <div class="company-right">
        <p><strong>${labels.companyNameAr}</strong></p>
        <p>${labels.tagline}</p>
        <p>${labels.country}</p>
        <p>${labels.tel}</p>
        <p>${labels.website}</p>
      </div>
    </div>
  </div>

  <!-- ✅ NEW: Blue separator line -->
  <div class="separator-line"></div>

  <!-- ✅ Title after blue line -->
  <h1 class="title">${labels.title}</h1>

  <!-- ✅ Doc info - only show if data exists -->
  ${(hasRFQNumber || hasDate) ? `
  <div class="doc-info">
    ${hasRFQNumber ? `
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.rfqNo}:</span>
      <span>${rfq.rfqNumber}</span>
    </div>
    ` : ''}
    ${hasDate ? `
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.dateLabel}:</span>
      <span>${formattedDate}</span>
    </div>
    ` : ''}
  </div>
  ` : ''}

  <!-- ✅ Request info section - only show if data exists -->
  ${hasRequestInfo ? `
  <div class="info-section">
    <div class="info-title">${labels.requestInfo}</div>
    <div class="info-grid">
      ${requestInfoFields}
    </div>
  </div>
  ` : ''}

  <!-- ✅ Items table - only show if data exists -->
  ${hasItems ? `
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 5%;">${labels.itemNo}</th>
        <th style="width: 25%;">${labels.description}</th>
        <th style="width: 8%;">${labels.unit}</th>
        <th style="width: 8%;">${labels.quantity}</th>
        <th style="width: 10%;">${labels.jobNo}</th>
        <th style="width: 10%;">${labels.taskNo}</th>
        <th style="width: 12%;">${labels.estimatedUnitPrice}</th>
        <th style="width: 12%;">${labels.totalPrice}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
      <tr class="total-row">
        <td colspan="7" style="text-align: ${isRTL ? 'right' : 'left'}; padding: 8px;">
          <strong>${labels.totalPrice}:</strong>
        </td>
        <td style="text-align: center;"><strong>${grandTotal}</strong></td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  <!-- ✅ Notes section - only show if data exists -->
  ${hasNotes ? `
  <div class="notes-section">
    <div class="notes-title">${labels.notes}</div>
    <div class="notes-content">${rfq.notes}</div>
  </div>
  ` : ''}

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-label">${labels.requesterSig}</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-box">
      <div class="signature-label">${labels.purchaseSig}</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-box">
      <div class="signature-label">${labels.productionSig}</div>
      <div class="signature-line"></div>
    </div>
  </div>

</div>

</body>
</html>
  `;
  }

  async generateRFQPDF(rfq) {
    const language = this.detectLanguage(rfq);

    return new Promise(async (resolve, reject) => {
      let browser;
      
      try {
        const pdfDir = path.join(__dirname, '../../data/rfqs/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = `${rfq.rfqNumber || 'rfq'}_${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);
        const html = this.generateHTML(rfq);

        browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        });

        const page = await browser.newPage();
        await page.setContent(html, { 
          waitUntil: 'networkidle0',
          timeout: 30000 
        });

        await page.pdf({
          path: filepath,
          format: 'A4',
          printBackground: true,
          margin: {
            top: '0mm',
            right: '0mm',
            bottom: '0mm',
            left: '0mm'
          },
          preferCSSPageSize: true
        });

        await browser.close();

        resolve({ 
          filename, 
          filepath, 
          language,
          success: true 
        });
      } catch (error) {
        if (browser) {
          await browser.close();
        }
        reject({
          success: false,
          error: error.message,
          stack: error.stack
        });
      }
    });
  }

  getA4Dimensions() {
    return {
      width: 595.28,
      height: 841.89
    };
  }

  async resizePageToA4(page) {
    const a4 = this.getA4Dimensions();
    const { width, height } = page.getSize();

    const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
    if (isA4) {
      return page;
    }

    const scaleX = a4.width / width;
    const scaleY = a4.height / height;
    const scale = Math.min(scaleX, scaleY, 1);

    page.setSize(a4.width, a4.height);
    
    if (scale < 1) {
      page.scaleContent(scale, scale);
      
      const scaledWidth = width * scale;
      const scaledHeight = height * scale;
      const translateX = (a4.width - scaledWidth) / 2;
      const translateY = (a4.height - scaledHeight) / 2;
      page.translateContent(translateX, translateY);
    }

    return page;
  }

  async addHeadersFootersToAllPages(pdfDoc, language = 'ar') {
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const isRTL = language === 'ar';
    const a4 = this.getA4Dimensions();
    
    const primaryBlue = rgb(0.169, 0.298, 0.549);
    const textGray = rgb(0.333, 0.333, 0.333);
    const lightGray = rgb(0.8, 0.8, 0.8);
    const white = rgb(1, 1, 1);

    let logoImage = null;
    try {
      const logoPath = path.join(__dirname, '../../assets/images/OmegaLogo.png');
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        logoImage = await pdfDoc.embedPng(logoBytes);
      }
    } catch (error) {
      console.log('Logo not found');
    }

    for (let i = 0; i < totalPages; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      
      const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
      if (!isA4) {
        console.log(`Page ${i + 1} is not A4, skipping header/footer`);
        continue;
      }
      
      const dateOfIssue = `DATE OF ISSUE: ${new Date().toISOString().split('T')[0]}`;
      const docCode = 'OMEGA-PUR-04';
      const pageNumber = `Page ${i + 1} of ${totalPages}`;

      if (i > 0) {
        page.drawRectangle({
          x: 0,
          y: height - 100,
          width: width,
          height: 100,
          color: white
        });
      }

      if (logoImage) {
        const logoWidth = 80;
        const logoHeight = 50;
        
        if (isRTL) {
          page.drawImage(logoImage, {
            x: 60,
            y: height - 70,
            width: logoWidth,
            height: logoHeight
          });
        } else {
          page.drawImage(logoImage, {
            x: width - 140,
            y: height - 70,
            width: logoWidth,
            height: logoHeight
          });
        }
      }

      page.drawLine({
        start: { x: 50, y: height - 90 },
        end: { x: width - 50, y: height - 90 },
        thickness: 2,
        color: primaryBlue
      });

      if (isRTL) {

        page.drawText(dateOfIssue, {
          x: width - 200,
          y: height - 63,
          size: 9,
          font: font,
          color: textGray
        });
      } else {

        page.drawText(dateOfIssue, {
          x: 60,
          y: height - 63,
          size: 9,
          font: font,
          color: textGray
        });
      }

      page.drawLine({
        start: { x: 50, y: 50 },
        end: { x: width - 50, y: 50 },
        thickness: 1,
        color: lightGray
      });

      if (isRTL) {
        page.drawText(docCode, {
          x: width - 150,
          y: 35,
          size: 9,
          font: font,
          color: textGray
        });
        page.drawText(pageNumber, {
          x: 60,
          y: 35,
          size: 9,
          font: font,
          color: textGray
        });
      } else {
        page.drawText(pageNumber, {
          x: 60,
          y: 35,
          size: 9,
          font: font,
          color: textGray
        });
        page.drawText(docCode, {
          x: width - 150,
          y: 35,
          size: 9,
          font: font,
          color: textGray
        });
      }
    }

    return pdfDoc;
  }

  async mergePDFs(generatedPdfPath, attachmentPdf = null, outputFilename = null, language = 'ar') {
    try {
      if (!attachmentPdf) {
        const pdfBytes = fs.readFileSync(generatedPdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        await this.addHeadersFootersToAllPages(pdfDoc, language);
        
        const updatedBytes = await pdfDoc.save();
        fs.writeFileSync(generatedPdfPath, updatedBytes);
        
        return {
          filepath: generatedPdfPath,
          filename: path.basename(generatedPdfPath),
          merged: false,
          pageCount: {
            total: pdfDoc.getPageCount()
          }
        };
      }

      const generatedPdfBytes = fs.readFileSync(generatedPdfPath);
      const generatedPdf = await PDFDocument.load(generatedPdfBytes);

      let attachmentPdfBytes;
      if (Buffer.isBuffer(attachmentPdf)) {
        attachmentPdfBytes = attachmentPdf;
      } else if (typeof attachmentPdf === 'string') {
        attachmentPdfBytes = fs.readFileSync(attachmentPdf);
      } else {
        throw new Error('Invalid attachment format');
      }

      const attachmentPdfDoc = await PDFDocument.load(attachmentPdfBytes);
      const mergedPdf = await PDFDocument.create();
      const a4 = this.getA4Dimensions();

      const generatedPages = await mergedPdf.copyPages(
        generatedPdf,
        generatedPdf.getPageIndices()
      );
      generatedPages.forEach(page => mergedPdf.addPage(page));

      const attachmentIndices = attachmentPdfDoc.getPageIndices();
      for (const index of attachmentIndices) {
        const [copiedPage] = await mergedPdf.copyPages(attachmentPdfDoc, [index]);
        const { width, height } = copiedPage.getSize();
        
        const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
        
        if (!isA4) {
          console.log(`Normalizing attachment page ${index + 1} from ${width.toFixed(2)}x${height.toFixed(2)} to A4`);
          await this.resizePageToA4(copiedPage);
        }
        
        mergedPdf.addPage(copiedPage);
      }

      await this.addHeadersFootersToAllPages(mergedPdf, language);

      const timestamp = Date.now();
      const finalFilename = outputFilename || 
        path.basename(generatedPdfPath).replace('.pdf', `_merged_${timestamp}.pdf`);
      
      const outputDir = path.dirname(generatedPdfPath);
      const outputPath = path.join(outputDir, finalFilename);

      const mergedPdfBytes = await mergedPdf.save();
      fs.writeFileSync(outputPath, mergedPdfBytes);

      try {
        fs.unlinkSync(generatedPdfPath);
        console.log('✓ Original PDF deleted');
      } catch (err) {
        console.log('Could not delete original:', err.message);
      }

      return {
        filepath: outputPath,
        filename: finalFilename,
        merged: true,
        pageCount: {
          generated: generatedPdf.getPageCount(),
          attachment: attachmentPdfDoc.getPageCount(),
          total: mergedPdf.getPageCount()
        }
      };
    } catch (error) {
      throw new Error(`PDF merge failed: ${error.message}`);
    }
  }

  async isValidPDF(pdfData) {
    try {
      let pdfBytes;
      if (Buffer.isBuffer(pdfData)) {
        pdfBytes = pdfData;
      } else if (typeof pdfData === 'string') {
        pdfBytes = fs.readFileSync(pdfData);
      } else {
        return false;
      }
      await PDFDocument.load(pdfBytes);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getPageCount(pdfData) {
    try {
      let pdfBytes;
      if (Buffer.isBuffer(pdfData)) {
        pdfBytes = pdfData;
      } else if (typeof pdfData === 'string') {
        pdfBytes = fs.readFileSync(pdfData);
      } else {
        throw new Error('Invalid PDF data');
      }
      const pdf = await PDFDocument.load(pdfBytes);
      return pdf.getPageCount();
    } catch (error) {
      throw new Error(`Failed to get page count: ${error.message}`);
    }
  }
}

module.exports = new RFQPDFGenerator();