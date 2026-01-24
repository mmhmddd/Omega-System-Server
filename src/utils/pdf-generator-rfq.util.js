// src/utils/pdf-generator-rfq.util.js - RFQ PDF GENERATOR WITH ALIGNED HEADERS
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

  detectLanguage(rfqData) {
    const fieldsToCheck = [
      rfqData.production,
      rfqData.supplier,
      rfqData.notes
    ];

    if (rfqData.items && rfqData.items.length > 0) {
      rfqData.items.forEach(item => {
        if (item.description) fieldsToCheck.push(item.description);
      });
    }

    let arabicCount = 0;
    let totalFields = 0;

    fieldsToCheck.forEach(field => {
      if (field) {
        totalFields++;
        if (this.isArabic(field)) {
          arabicCount++;
        }
      }
    });

    return arabicCount > (totalFields / 2) ? 'ar' : 'en';
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
        location: 'عنوان المورد',
        urgent: 'عاجل',
        yes: 'نعم',
        no: 'لا',
        itemNo: '#',
        item: 'الصنف',
        unit: 'الوحدة',
        quantity: 'الكمية',
        unitPrice: 'سعر الوحدة',
        unitPriceExternal: 'السعر الخارجي الوحدة',
        unitPriceInternal: 'السعر الداخلي الوحدة',
        totalPrice: 'السعر الإجمالي',
        notes: 'ملاحظات',
        signatures: 'التواقيع',
        requesterSig: 'مقدم الطلب',
        purchaseSig: 'مدير المشتريات',
        productionSig: 'مدير الإنتاج',
        docCode: 'OMEGA-PUR-04',
        revision: 'REV. No: 00',
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
        location: 'Supplier Address',
        urgent: 'Urgent',
        yes: 'Yes',
        no: 'No',
        itemNo: '#',
        item: 'Item',
        unit: 'Unit',
        quantity: 'Qty',
        unitPrice: 'Unit Price',
        unitPriceExternal: 'External Unit Price',
        unitPriceInternal: 'Internal Unit Price',
        totalPrice: 'Total Price',
        notes: 'Notes',
        signatures: 'Signatures',
        requesterSig: 'Requester',
        purchaseSig: 'Purchase Manager',
        productionSig: 'Production Manager',
        docCode: 'OMEGA-PUR-04',
        revision: 'REV. No: 00',
        issueDate: 'DATE OF ISSUE'
      }
    };

    return labels[lang] || labels.ar;
  }

  calculateTotal(items) {
    if (!items || items.length === 0) return { external: 0, internal: 0 };
    
    let externalTotal = 0;
    let internalTotal = 0;

    items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const extPrice = parseFloat(item.unitPriceExternal) || 0;
      const intPrice = parseFloat(item.unitPriceInternal) || 0;
      
      externalTotal += qty * extPrice;
      internalTotal += qty * intPrice;
    });

    return {
      external: externalTotal.toFixed(2),
      internal: internalTotal.toFixed(2)
    };
  }

  generateHTML(rfq) {
    const language = this.detectLanguage(rfq);
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    const formattedDate = rfq.date || new Date().toISOString().split('T')[0];
    const totals = this.calculateTotal(rfq.items);

    let itemsHTML = '';
    if (rfq.items && rfq.items.length > 0) {
      itemsHTML = rfq.items.map((item, index) => `
        <tr>
          <td style="text-align: center; padding: 10px 8px;">${index + 1}</td>
          <td style="text-align: ${isRTL ? 'right' : 'left'}; padding: 10px;">${item.description || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.unit || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.quantity || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.unitPriceExternal || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.unitPriceInternal || ''}</td>
        </tr>
      `).join('');
    } else {
      for (let i = 0; i < 5; i++) {
        itemsHTML += `
        <tr>
          <td style="padding: 10px 8px; height: 40px;">&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
          <td>&nbsp;</td>
        </tr>
        `;
      }
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
}

.a4 {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  padding: 35mm 20mm 25mm 20mm;
}

.header-box {
  background-color: #f0f0f0;
  padding: 15px;
  margin-bottom: 15px;
  border: 1px solid #ddd;
  direction: ltr;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  direction: ltr;
}

.header-left, .header-right {
  width: 48%;
}

.header-left {
  text-align: left;
  direction: ltr;
}

.header-right {
  text-align: right;
  direction: rtl;
}

.header-left p, .header-right p {
  margin: 4px 0;
  font-size: 11px;
  line-height: 1.4;
}

.title {
  text-align: center;
  margin: 20px 0 15px 0;
  font-size: 22px;
  color: #2B4C8C;
  font-weight: bold;
}

.doc-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
  font-size: 12px;
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
  min-width: 100px;
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
  background-color: #2B4C8C;
  color: white;
}

.items-table th {
  padding: 10px 8px;
  text-align: center;
  font-weight: bold;
  border: 1px solid #2B4C8C;
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

.total-row {
  background-color: #E8F0FE !important;
  font-weight: bold;
}

.notes-section {
  background-color: #FFFBEA;
  padding: 15px;
  margin: 15px 0;
  border-radius: 4px;
  min-height: 80px;
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
  }
  .a4 {
    margin: 0;
  }
}
</style>
</head>

<body>

<div class="a4">

  <!-- Header Box - ALWAYS: English left, Arabic right -->
  <div class="header-box">
    <div class="header-row">
      <div class="header-left">
        <p><strong>${labels.companyNameEn}</strong></p>
        <p>${labels.taglineEn}</p>
        <p>${labels.country}</p>
        <p>${labels.tel}</p>
        <p>${labels.website}</p>
      </div>
      <div class="header-right">
        <p><strong>${labels.companyNameAr}</strong></p>
        <p>${labels.tagline}</p>
        <p>${labels.country}</p>
        <p>${labels.tel}</p>
        <p>${labels.website}</p>
      </div>
    </div>
  </div>

  <!-- Title -->
  <h1 class="title">${labels.title}</h1>

  <!-- Document Info -->
  <div class="doc-info">
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.rfqNo}:</span>
      <span>${rfq.rfqNumber || ''}</span>
    </div>
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.dateLabel}:</span>
      <span>${formattedDate}</span>
    </div>
  </div>

  <!-- Request Information -->
  <div class="info-section">
    <div class="info-title">${labels.requestInfo}</div>
    <div class="info-grid">
      <div class="info-field">
        <span class="info-label">${labels.requester}:</span>
        <span class="info-value">${rfq.requester || ''}</span>
      </div>
      <div class="info-field">
        <span class="info-label">${labels.department}:</span>
        <span class="info-value">${rfq.production || ''}</span>
      </div>
      <div class="info-field">
        <span class="info-label">${labels.supplier}:</span>
        <span class="info-value">${rfq.supplier || ''}</span>
      </div>
      <div class="info-field">
        <span class="info-label">${labels.urgent}:</span>
        <span class="info-value">${rfq.urgent ? labels.yes : labels.no}</span>
      </div>
    </div>
  </div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 8%;">${labels.itemNo}</th>
        <th style="width: 30%;">${labels.item}</th>
        <th style="width: 12%;">${labels.unit}</th>
        <th style="width: 10%;">${labels.quantity}</th>
        <th style="width: 20%;">${labels.unitPriceExternal}</th>
        <th style="width: 20%;">${labels.unitPriceInternal}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
      <tr class="total-row">
        <td colspan="4" style="text-align: ${isRTL ? 'right' : 'left'}; padding: 10px;">
          <strong>${labels.totalPrice}:</strong>
        </td>
        <td style="text-align: center;"><strong>${totals.external}</strong></td>
        <td style="text-align: center;"><strong>${totals.internal}</strong></td>
      </tr>
    </tbody>
  </table>

  <!-- Notes Section -->
  <div class="notes-section">
    <div class="notes-title">${labels.notes}</div>
    <div class="notes-content">${rfq.notes || ''}</div>
  </div>

  <!-- Signature Section -->
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
      
      const revNo = 'REV. No: 00';
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
        page.drawText(revNo, {
          x: width - 200,
          y: height - 50,
          size: 9,
          font: font,
          color: textGray
        });
        page.drawText(dateOfIssue, {
          x: width - 200,
          y: height - 63,
          size: 9,
          font: font,
          color: textGray
        });
      } else {
        page.drawText(revNo, {
          x: 60,
          y: height - 50,
          size: 9,
          font: font,
          color: textGray
        });
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