// src/utils/pdf-generator.util.js - COMPLETE FIXED VERSION WITH A4 ENFORCEMENT
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class PDFGenerator {
  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  detectLanguage(receiptData) {
    const fieldsToCheck = [
      receiptData.to,
      receiptData.address,
      receiptData.workLocation,
      receiptData.attention
    ];

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
        title: 'إشعار تسليم',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'Design – Manufacture – Installation',
        country: 'المملكة الأردنية الهاشمية',
        countryEn: 'Jordan',
        to: 'إلى',
        address: 'العنوان',
        attention: 'عناية',
        projectCode: 'رمز المشروع',
        workLocation: 'موقع العمل',
        date: 'التاريخ',
        receiptNumber: 'رقم الإشعار',
        quantity: 'العدد',
        description: 'وصف',
        element: 'العناصر',
        receiverSignature: 'توقيع المستلم',
        name: 'الاسم',
        dateField: 'التاريخ',
        docCode: 'OMEGA-RIC-01',
        revNo: 'REV. No',
        dateOfIssue: 'DATE OF ISSUE',
        additionalInfo: 'يرجى الاستلام ما لم ترد إشارة dvf/dh/dofba'
      },
      en: {
        title: 'Delivery Notice',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'Design – Manufacture – Installation',
        country: 'المملكة الأردنية الهاشمية',
        countryEn: 'Jordan',
        to: 'To',
        address: 'Address',
        attention: 'Attention',
        projectCode: 'Project Code',
        workLocation: 'Work Location',
        date: 'Date',
        receiptNumber: 'Receipt Number',
        quantity: 'Quantity',
        description: 'Description',
        element: 'Elements',
        receiverSignature: 'Receiver Signature',
        name: 'Name',
        dateField: 'Date',
        docCode: 'OMEGA-RIC-01',
        revNo: 'REV. No',
        dateOfIssue: 'DATE OF ISSUE',
        additionalInfo: 'Please receive the items listed below:'
      }
    };

    return labels[lang] || labels.ar;
  }

  generateHTML(receipt) {
    const language = this.detectLanguage(receipt);
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    const formattedDate = receipt.date || new Date().toISOString().split('T')[0];

    let itemsHTML = '';
    if (receipt.items && receipt.items.length > 0) {
      itemsHTML = receipt.items.map(item => `
        <tr>
          <td style="text-align: center; padding: 12px 8px;">${item.quantity || ''}</td>
          <td style="text-align: left; padding: 12px 10px;">${item.description || ''}</td>
          <td style="text-align: left; padding: 12px 10px;">${item.element || ''}</td>
        </tr>
      `).join('');
    } else {
      for (let i = 0; i < 3; i++) {
        itemsHTML += `
        <tr>
          <td style="text-align: center; padding: 12px 8px; height: 45px;">&nbsp;</td>
          <td style="text-align: left; padding: 12px 10px;">&nbsp;</td>
          <td style="text-align: left; padding: 12px 10px;">&nbsp;</td>
        </tr>
        `;
      }
    }

    const additionalTextHTML = receipt.additionalText 
      ? `<div style="text-align: ${isRTL ? 'right' : 'left'}; margin: 15px 0; font-size: 13px;">${receipt.additionalText}</div>`
      : `<div style="text-align: ${isRTL ? 'right' : 'left'}; margin: 15px 0; font-size: 13px;">${labels.additionalInfo}</div>`;

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>${labels.title} - OMEGA</title>
<style>
:root {
  --primary: #0b4fa2;
  --secondary: #555;
  --border-color: #000;
  --light-border: #ddd;
  --box-bg: #f5f5f5;
}

* {
  box-sizing: border-box;
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
}

body {
  background: #fff;
  padding: 0;
  margin: 0;
}

.a4 {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  margin: 0;
  padding: 35mm 20mm 25mm 20mm;
  position: relative;
}

.title {
  text-align: center;
  margin: 25px 0 20px 0;
  font-size: 24px;
  color: var(--primary);
  font-weight: bold;
}

.company-box {
  background-color: var(--box-bg);
  padding: 12px 18px;
  margin-bottom: 20px;
  border: none;
}

.company-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 30px;
}

.company-col {
  width: 48%;
  font-size: 12px;
  line-height: 1.6;
}

.company-col-right {
  text-align: right;
  direction: rtl;
}

.company-col-left {
  text-align: left;
  direction: ltr;
}

.company-col p {
  margin: 4px 0;
}

.details-box {
  border: 2px solid var(--primary);
  padding: 0;
  margin: 20px 0;
  border-radius: 4px;
  overflow: hidden;
}

.detail-row {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  min-height: 36px;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row:nth-child(even) {
  background-color: #f9f9f9;
}

.detail-label {
  width: 30%;
  text-align: left;
  font-weight: bold;
  padding: 10px 18px;
  background-color: #e8f0fa;
  border-${isRTL ? 'left' : 'right'}: 2px solid var(--primary);
  display: flex;
  align-items: center;
  justify-content: flex-start;
  font-size: 13px;
  color: var(--primary);
}

.detail-value {
  width: 70%;
  text-align: left;
  padding: 10px 18px;
  background-color: #fff;
  display: flex;
  align-items: center;
  font-size: 13px;
  color: #333;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
  border: 1px solid var(--light-border);
}

.items-table thead {
  background-color: #6b8dd6;
  color: white;
}

.items-table thead th {
  padding: 10px 8px;
  text-align: center;
  font-size: 13px;
  font-weight: bold;
  border: 1px solid #6b8dd6;
}

.items-table tbody td {
  border: 1px solid var(--light-border);
  font-size: 12px;
  padding: 10px 8px;
}

.items-table tbody tr {
  background-color: #fff;
}

.signature-section {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  margin-bottom: 20mm;
  gap: 25px;
}

.signature-box {
  text-align: center;
  width: 32%;
  font-size: 12px;
}

.signature-label {
  margin-bottom: 35px;
  font-weight: normal;
  color: #333;
}

.signature-line {
  border-bottom: 1.5px solid var(--border-color);
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

  <!-- Title -->
  <h1 class="title">${labels.title}</h1>

  <!-- Company Info Box -->
  <div class="company-box">
    <div class="company-row">
      ${isRTL ? `
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>المملكة الأردنية الهاشمية</p>
        <p>تلفون: +96264161060 | فاكس: +96264162060</p>
      </div>
      <div class="company-col company-col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
      </div>
      ` : `
      <div class="company-col company-col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
      </div>
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>المملكة الأردنية الهاشمية</p>
        <p>تلفون: +96264161060 | فاكس: +96264162060</p>
      </div>
      `}
    </div>
  </div>

  <!-- Receipt Details Box -->
  <div class="details-box">
    ${receipt.to ? `
    <div class="detail-row">
      <div class="detail-label">${labels.to}:</div>
      <div class="detail-value">${receipt.to}</div>
    </div>
    ` : ''}
    
    ${receipt.address ? `
    <div class="detail-row">
      <div class="detail-label">${labels.address}:</div>
      <div class="detail-value">${receipt.address}</div>
    </div>
    ` : ''}
    
    ${receipt.attention ? `
    <div class="detail-row">
      <div class="detail-label">${labels.attention}:</div>
      <div class="detail-value">${receipt.attention}</div>
    </div>
    ` : ''}
    
    ${receipt.projectCode ? `
    <div class="detail-row">
      <div class="detail-label">${labels.projectCode}:</div>
      <div class="detail-value">${receipt.projectCode}</div>
    </div>
    ` : ''}
    
    ${receipt.workLocation ? `
    <div class="detail-row">
      <div class="detail-label">${labels.workLocation}:</div>
      <div class="detail-value">${receipt.workLocation}</div>
    </div>
    ` : ''}
    
    <div class="detail-row">
      <div class="detail-label">${labels.date}:</div>
      <div class="detail-value">${formattedDate}</div>
    </div>
    
    ${receipt.receiptNumber ? `
    <div class="detail-row">
      <div class="detail-label">${labels.receiptNumber}:</div>
      <div class="detail-value">${receipt.receiptNumber}</div>
    </div>
    ` : ''}
  </div>

  <!-- Additional Text -->
  ${additionalTextHTML}

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 15%;">${labels.quantity}</th>
        <th style="width: 40%;">${labels.description}</th>
        <th style="width: 45%;">${labels.element}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <!-- Signature Section -->
  <div class="signature-section">
    <div class="signature-box">
      <div class="signature-label">${labels.receiverSignature}</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-box">
      <div class="signature-label">${labels.name}</div>
      <div class="signature-line"></div>
    </div>
    <div class="signature-box">
      <div class="signature-label">${labels.dateField}</div>
      <div class="signature-line"></div>
    </div>
  </div>

</div>

</body>
</html>
    `;
  }

  async generateReceiptPDF(receipt) {
    const language = this.detectLanguage(receipt);

    return new Promise(async (resolve, reject) => {
      let browser;
      
      try {
        const pdfDir = path.join(__dirname, '../../data/receipts/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = `${receipt.receiptNumber || 'receipt'}_${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);
        const html = this.generateHTML(receipt);

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

  // A4 dimensions in points (72 points per inch)
  // A4 = 210mm x 297mm = 595.28 x 841.89 points
  getA4Dimensions() {
    return {
      width: 595.28,
      height: 841.89
    };
  }

  async resizePageToA4(page) {
    const a4 = this.getA4Dimensions();
    const { width, height } = page.getSize();

    // If already A4, return as is
    const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
    if (isA4) {
      return page;
    }

    // Calculate scaling to fit content within A4 while maintaining aspect ratio
    const scaleX = a4.width / width;
    const scaleY = a4.height / height;
    const scale = Math.min(scaleX, scaleY, 1); // Don't upscale, only downscale if needed

    // Simply resize the page to A4
    page.setSize(a4.width, a4.height);
    
    // Scale the content if needed
    if (scale < 1) {
      page.scaleContent(scale, scale);
      
      // Center the scaled content
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
    
    const primaryBlue = rgb(0.043, 0.310, 0.635);
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
      
      // If page is not A4, skip header/footer (will be handled in normalization)
      const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
      if (!isA4) {
        console.log(`Page ${i + 1} is not A4 (${width.toFixed(2)} x ${height.toFixed(2)}), skipping header/footer`);
        continue;
      }
      
      const revNo = 'REV. No: 00';
      const dateOfIssue = `DATE OF ISSUE: ${new Date().toISOString().split('T')[0]}`;
      const docCode = 'OMEGA-RIC-01';
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

      // Copy generated pages (already A4)
      const generatedPages = await mergedPdf.copyPages(
        generatedPdf,
        generatedPdf.getPageIndices()
      );
      generatedPages.forEach(page => mergedPdf.addPage(page));

      // Copy and normalize attachment pages to A4
      const attachmentIndices = attachmentPdfDoc.getPageIndices();
      for (const index of attachmentIndices) {
        const [copiedPage] = await mergedPdf.copyPages(attachmentPdfDoc, [index]);
        const { width, height } = copiedPage.getSize();
        
        // Check if page is already A4
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

module.exports = new PDFGenerator();