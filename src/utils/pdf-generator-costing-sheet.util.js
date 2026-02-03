// ============================================================
// PDF GENERATOR COSTING SHEET - WITH UPDATED ARABIC NAME
// src/utils/pdf-generator-costing-sheet.util.js
// ============================================================
const fsSync = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class CostingSheetPDFGenerator {
  
  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  // ✅ UPDATED: Detect language based on CONTENT ONLY (exclude date)
  detectLanguage(costingSheetData) {
    const fieldsToCheck = [];
    
    // Add content fields (NOT date)
    if (costingSheetData.client) fieldsToCheck.push(costingSheetData.client);
    if (costingSheetData.project) fieldsToCheck.push(costingSheetData.project);
    if (costingSheetData.notes) fieldsToCheck.push(costingSheetData.notes);
    if (costingSheetData.additionalNotes) fieldsToCheck.push(costingSheetData.additionalNotes);

    if (costingSheetData.items && costingSheetData.items.length > 0) {
      costingSheetData.items.forEach(item => {
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
      if (this.isArabic(field)) arabicCount++;
    });

    // Return language based on majority of content
    return arabicCount > (totalFields / 2) ? 'ar' : 'en';
  }

  getLabels(lang) {
    const labels = {
      ar: {
        title: 'كشف تكاليف',  // ✅ CHANGED from "ورقة تكلفة"
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        sheetInfo: 'معلومات كشف التكاليف',  // ✅ CHANGED from "معلومات ورقة التكلفة"
        csNumber: 'رقم كشف التكاليف',  // ✅ CHANGED from "رقم ورقة التكلفة"
        date: 'التاريخ',
        client: 'العميل',
        project: 'المشروع',
        profitPercentage: 'نسبة الربح',
        notes: 'ملاحظات',
        submittedBy: 'مُعد بواسطة',
        items: 'العناصر',
        itemNo: '#',
        description: 'الوصف',
        unit: 'الوحدة',
        quantity: 'الكمية',
        unitPrice: 'سعر الوحدة',
        totalPrice: 'السعر الإجمالي',
        additionalNotes: 'ملاحظات إضافية',
        subtotal: 'المجموع الفرعي',
        profit: 'الربح',
        grandTotal: 'الإجمالي النهائي',
        approvals: 'التواقيع',
        preparedBy: 'معد بواسطة',
        reviewedBy: 'راجعه',
        approvedBy: 'اعتمده',
        docCode: 'OMEGA-CS-01',
        issueDate: 'DATE OF ISSUE'
      },
      en: {
        title: 'Costing Sheet',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        sheetInfo: 'Costing Sheet Information',
        csNumber: 'CS Number',
        date: 'Date',
        client: 'Client',
        project: 'Project',
        profitPercentage: 'Profit Percentage',
        notes: 'Notes',
        submittedBy: 'Submitted By',
        items: 'Items',
        itemNo: '#',
        description: 'Description',
        unit: 'Unit',
        quantity: 'Quantity',
        unitPrice: 'Unit Price',
        totalPrice: 'Total Price',
        additionalNotes: 'Additional Notes',
        subtotal: 'Subtotal',
        profit: 'Profit',
        grandTotal: 'Grand Total',
        approvals: 'Approvals',
        preparedBy: 'Prepared By',
        reviewedBy: 'Reviewed By',
        approvedBy: 'Approved By',
        docCode: 'OMEGA-CS-01',
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
      this.hasData(item.unitPrice)
    );
  }

  // ✅ Helper: Check if sheet info section has data
  hasSheetInfoData(costingSheet) {
    return this.hasData(costingSheet.client) ||
           this.hasData(costingSheet.project) ||
           this.hasData(costingSheet.profitPercentage) ||
           this.hasData(costingSheet.notes) ||
           this.hasData(costingSheet.createdByName);
  }

  // ✅ Calculate totals with profit percentage
  calculateTotals(items, profitPercentage) {
    let subtotal = 0;
    
    items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      subtotal += quantity * unitPrice;
    });

    const profitAmount = (subtotal * parseFloat(profitPercentage || 0)) / 100;
    const grandTotal = subtotal + profitAmount;

    return {
      subtotal: subtotal.toFixed(2),
      profitAmount: profitAmount.toFixed(2),
      grandTotal: grandTotal.toFixed(2)
    };
  }

generateHTML(costingSheet) {
  // ✅ UPDATED: Detect language based on content only
  const language = this.detectLanguage(costingSheet);
  const labels = this.getLabels(language);
  const isRTL = language === 'ar';
  const formattedDate = costingSheet.date || new Date().toISOString().split('T')[0];

  // ✅ Check what data exists
  const hasItems = this.hasItemsData(costingSheet.items);
  const hasSheetInfo = this.hasSheetInfoData(costingSheet);
  const hasNotes = this.hasData(costingSheet.additionalNotes);
  const hasCSNumber = this.hasData(costingSheet.csNumber);
  const hasDate = this.hasData(costingSheet.date);

  // ✅ Calculate totals
  const totals = this.calculateTotals(costingSheet.items, costingSheet.profitPercentage);

  let itemsHTML = '';
  if (hasItems) {
    itemsHTML = costingSheet.items.map((item, index) => {
      // Only render row if at least one field has data
      const hasRowData = this.hasData(item.description) ||
                        this.hasData(item.unit) ||
                        this.hasData(item.quantity) ||
                        this.hasData(item.unitPrice);
      
      if (!hasRowData) return '';
      
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const totalPrice = (quantity * unitPrice).toFixed(2);
      
      return `
      <tr>
        <td style="text-align: center; padding: 10px 8px;">${index + 1}</td>
        <td style="text-align: ${isRTL ? 'right' : 'left'}; padding: 10px;">${item.description || ''}</td>
        <td style="text-align: center; padding: 10px;">${item.unit || ''}</td>
        <td style="text-align: center; padding: 10px;">${quantity}</td>
        <td style="text-align: center; padding: 10px;">${unitPrice}</td>
        <td style="text-align: center; padding: 10px;">${totalPrice}</td>
      </tr>
    `;
    }).join('');
  }

  // ✅ Build sheet info fields conditionally
  let sheetInfoFields = '';
  if (hasSheetInfo) {
    const fields = [];
    
    if (this.hasData(costingSheet.client)) {
      fields.push(`
        <div class="info-field">
          <span class="info-label">${labels.client}:</span>
          <span class="info-value">${costingSheet.client}</span>
        </div>
      `);
    }
    
    if (this.hasData(costingSheet.project)) {
      fields.push(`
        <div class="info-field">
          <span class="info-label">${labels.project}:</span>
          <span class="info-value">${costingSheet.project}</span>
        </div>
      `);
    }
    
    if (this.hasData(costingSheet.profitPercentage)) {
      fields.push(`
        <div class="info-field">
          <span class="info-label">${labels.profitPercentage}:</span>
          <span class="info-value">${costingSheet.profitPercentage}%</span>
        </div>
      `);
    }
    
    if (this.hasData(costingSheet.notes)) {
      fields.push(`
        <div class="info-field">
          <span class="info-label">${labels.notes}:</span>
          <span class="info-value">${costingSheet.notes}</span>
        </div>
      `);
    }
    
    if (this.hasData(costingSheet.createdByName)) {
      fields.push(`
        <div class="info-field">
          <span class="info-label">${labels.submittedBy}:</span>
          <span class="info-value">${costingSheet.createdByName}</span>
        </div>
      `);
    }
    
    sheetInfoFields = fields.join('');
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

/* ✅ NEW: Green line separator */
.separator-line {
  width: 100%;
  height: 2px;
  background-color: #1F6B3D;
  margin: 15px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

.title {
  text-align: center;
  margin: 15px 0;
  font-size: 22px;
  color: #1F6B3D;
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
  color: #1F6B3D;
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
  color: #1F6B3D;
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
  font-size: 11px;
}

.items-table thead {
  background-color: #1F6B3D;
  color: white;
  display: table-header-group;
}

.items-table th {
  padding: 10px 8px;
  text-align: center;
  font-weight: bold;
  border: 1px solid #1F6B3D;
}

.items-table tbody {
  display: table-row-group;
}

.items-table tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

.items-table td {
  padding: 10px 8px;
  border: 1px solid #ddd;
  text-align: center;
}

.items-table tbody tr {
  background-color: #fff;
}

.items-table tbody tr:nth-child(even) {
  background-color: #f9f9f9;
}

.totals-section {
  margin: 20px 0;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.totals-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
  border-bottom: 1px solid #e2e8f0;
}

.totals-row:last-child {
  border-bottom: none;
  padding-top: 12px;
  margin-top: 8px;
  border-top: 2px solid #1F6B3D;
}

.totals-label {
  font-weight: 600;
  color: #333;
}

.totals-value {
  font-weight: bold;
  color: #1F6B3D;
}

.totals-row:last-child .totals-label,
.totals-row:last-child .totals-value {
  font-size: 15px;
  font-weight: bold;
  color: #1F6B3D;
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
  color: #1F6B3D;
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

  <!-- ✅ Title after green line -->
  <h1 class="title">${labels.title}</h1>

  <!-- ✅ Doc info - only show if data exists -->
  ${(hasCSNumber || hasDate) ? `
  <div class="doc-info">
    ${hasCSNumber ? `
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.csNumber}:</span>
      <span>${costingSheet.csNumber}</span>
    </div>
    ` : ''}
    ${hasDate ? `
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.date}:</span>
      <span>${formattedDate}</span>
    </div>
    ` : ''}
  </div>
  ` : ''}

  <!-- ✅ Sheet info section - only show if data exists -->
  ${hasSheetInfo ? `
  <div class="info-section">
    <div class="info-title">${labels.sheetInfo}</div>
    <div class="info-grid">
      ${sheetInfoFields}
    </div>
  </div>
  ` : ''}

  <!-- ✅ Items table - only show if data exists -->
  ${hasItems ? `
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 6%;">${labels.itemNo}</th>
        <th style="width: 30%;">${labels.description}</th>
        <th style="width: 12%;">${labels.unit}</th>
        <th style="width: 10%;">${labels.quantity}</th>
        <th style="width: 16%;">${labels.unitPrice}</th>
        <th style="width: 16%;">${labels.totalPrice}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <!-- ✅ Totals Section -->
  <div class="totals-section">
    <div class="totals-row">
      <span class="totals-label">${labels.subtotal}:</span>
      <span class="totals-value">${totals.subtotal}</span>
    </div>
    <div class="totals-row">
      <span class="totals-label">${labels.profit} (${costingSheet.profitPercentage || 0}%):</span>
      <span class="totals-value">${totals.profitAmount}</span>
    </div>
    <div class="totals-row">
      <span class="totals-label">${labels.grandTotal}:</span>
      <span class="totals-value">${totals.grandTotal}</span>
    </div>
  </div>
  ` : ''}

  <!-- ✅ Notes section - only show if data exists -->
  ${hasNotes ? `
  <div class="notes-section">
    <div class="notes-content">${costingSheet.additionalNotes}</div>
  </div>
  ` : ''}

  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-label">${labels.preparedBy}</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-box">
      <div class="signature-label">${labels.reviewedBy}</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-box">
      <div class="signature-label">${labels.approvedBy}</div>
      <div class="signature-line"></div>
    </div>
  </div>

</div>

</body>
</html>
  `;
}

  async generateCostingSheetPDF(costingSheet) {
    const language = this.detectLanguage(costingSheet);

    return new Promise(async (resolve, reject) => {
      let browser;
      
      try {
        const pdfDir = path.join(__dirname, '../../data/costing-sheets/pdfs');
        if (!fsSync.existsSync(pdfDir)) {
          fsSync.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = `${costingSheet.csNumber || 'costing-sheet'}_${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);
        const html = this.generateHTML(costingSheet);

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
    if (isA4) return page;

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
    
    const primaryGreen = rgb(0.122, 0.420, 0.239);
    const textGray = rgb(0.333, 0.333, 0.333);
    const lightGray = rgb(0.8, 0.8, 0.8);
    const white = rgb(1, 1, 1);

    let logoImage = null;
    try {
      const logoPath = path.join(__dirname, '../../assets/images/OmegaLogo.png');
      if (fsSync.existsSync(logoPath)) {
        const logoBytes = fsSync.readFileSync(logoPath);
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
      const docCode = 'OMEGA-CS-01';
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
        color: primaryGreen
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
        const pdfBytes = fsSync.readFileSync(generatedPdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        
        await this.addHeadersFootersToAllPages(pdfDoc, language);
        
        const updatedBytes = await pdfDoc.save();
        fsSync.writeFileSync(generatedPdfPath, updatedBytes);
        
        return {
          filepath: generatedPdfPath,
          filename: path.basename(generatedPdfPath),
          merged: false,
          pageCount: {
            total: pdfDoc.getPageCount()
          }
        };
      }

      const generatedPdfBytes = fsSync.readFileSync(generatedPdfPath);
      const generatedPdf = await PDFDocument.load(generatedPdfBytes);

      let attachmentPdfBytes;
      if (Buffer.isBuffer(attachmentPdf)) {
        attachmentPdfBytes = attachmentPdf;
      } else if (typeof attachmentPdf === 'string') {
        attachmentPdfBytes = fsSync.readFileSync(attachmentPdf);
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
      fsSync.writeFileSync(outputPath, mergedPdfBytes);

      try {
        fsSync.unlinkSync(generatedPdfPath);
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
        pdfBytes = fsSync.readFileSync(pdfData);
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
        pdfBytes = fsSync.readFileSync(pdfData);
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

module.exports = new CostingSheetPDFGenerator();