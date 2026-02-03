// src/utils/pdf-generator-empty-receipt.util.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class EmptyReceiptPDFGenerator {
  
  /**
   * Get next receipt number from counters.json
   */
  getNextReceiptNumber() {
    const countersPath = path.join(__dirname, '../../data/counters.json');
    let counters = {};
    
    try {
      if (fs.existsSync(countersPath)) {
        const data = fs.readFileSync(countersPath, 'utf8');
        counters = JSON.parse(data);
      }
    } catch (error) {
      console.warn('Could not read counters.json, starting from 1');
    }
    
    // Get current counter or start at 1
    const currentNumber = counters.emptyReceiptNumber || 0;
    const nextNumber = currentNumber + 1;
    
    // Update counter
    counters.emptyReceiptNumber = nextNumber;
    
    // Save back to file
    try {
      fs.writeFileSync(countersPath, JSON.stringify(counters, null, 2));
    } catch (error) {
      console.error('Error saving counter:', error);
    }
    
    return nextNumber;
  }
  
  /**
   * Generate filename in format EMR0001, EMR0002, etc.
   */
  generateFilename(language) {
    const receiptNumber = this.getNextReceiptNumber();
    const paddedNumber = String(receiptNumber).padStart(4, '0');
    const timestamp = Date.now();
    return `EMR${paddedNumber}_${language}_${timestamp}.pdf`;
  }

  getLabels(lang) {
    const labels = {
      ar: {
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'Design – Manufacture – Installation',
        country: 'المملكة الأردنية الهاشمية',
        countryEn: 'Jordan'
      },
      en: {
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'Design – Manufacture – Installation',
        country: 'المملكة الأردنية الهاشمية',
        countryEn: 'Jordan'
      }
    };

    return labels[lang] || labels.ar;
  }

  generateHTML(language) {
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>Empty Receipt - OMEGA</title>
<style>
:root {
  --primary: #0b4fa2;
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

@page {
  size: A4;
  margin: 35mm 20mm 25mm 20mm;
}

.page-content {
  width: 100%;
  background: #fff;
  min-height: 500px;
}

/* Company info section - directly under logo, no background */
.company-info {
  padding: 5px 0 10px 0;
  margin-bottom: 10px;
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

/* Single blue separator line */
.blue-separator {
  width: 100%;
  height: 3px;
  background-color: var(--primary);
  margin: 10px 0 20px 0;
}
</style>
</head>

<body>

<div class="page-content">

  <!-- Company info directly under logo -->
  <div class="company-info">
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


</div>

</body>
</html>
    `;
  }

  async generateEmptyReceiptPDF(language = 'ar') {
    return new Promise(async (resolve, reject) => {
      let browser;
      
      try {
        const pdfDir = path.join(__dirname, '../../data/empty-receipts/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        // Generate filename with EMR format
        const filename = this.generateFilename(language);
        const filepath = path.join(pdfDir, filename);
        const html = this.generateHTML(language);

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

        // Add header and footer
        const finalPdf = await this.addHeadersFooters(filepath, language);

        resolve({ 
          filename: finalPdf.filename, 
          filepath: finalPdf.filepath, 
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

  async addHeadersFooters(pdfPath, language = 'ar') {
    try {
      const pdfBytes = fs.readFileSync(pdfPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const page = pages[0];
      const { width, height } = page.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const isRTL = language === 'ar';
      
      const primaryBlue = rgb(0.043, 0.310, 0.635);
      const textGray = rgb(0.333, 0.333, 0.333);
      const lightGray = rgb(0.8, 0.8, 0.8);
      const white = rgb(1, 1, 1);

      // Load logo
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

      // Draw header background
      page.drawRectangle({
        x: 0,
        y: height - 100,
        width: width,
        height: 100,
        color: white
      });

      // Draw logo
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

      // Draw header line
      page.drawLine({
        start: { x: 50, y: height - 90 },
        end: { x: width - 50, y: height - 90 },
        thickness: 2,
        color: primaryBlue
      });

      // Draw date of issue
      const dateOfIssue = `DATE OF ISSUE: ${new Date().toISOString().split('T')[0]}`;
      
      if (isRTL) {
        page.drawText(dateOfIssue, {
          x: width - 200,
          y: height - 55,
          size: 9,
          font: font,
          color: textGray
        });
      } else {
        page.drawText(dateOfIssue, {
          x: 60,
          y: height - 55,
          size: 9,
          font: font,
          color: textGray
        });
      }

      // Draw footer line
      page.drawLine({
        start: { x: 50, y: 50 },
        end: { x: width - 50, y: 50 },
        thickness: 1,
        color: lightGray
      });

      // Draw footer text - use EMR number from filename
      const filename = path.basename(pdfPath);
      const emrMatch = filename.match(/EMR\d{4}/);
      const docCode = emrMatch ? emrMatch[0] : 'OMEGA-RIC-01';
      const pageNumber = 'Page 1 of 1';

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

      // Save the updated PDF
      const updatedBytes = await pdfDoc.save();
      fs.writeFileSync(pdfPath, updatedBytes);

      return {
        filepath: pdfPath,
        filename: path.basename(pdfPath)
      };
    } catch (error) {
      throw new Error(`Failed to add headers/footers: ${error.message}`);
    }
  }
}

module.exports = new EmptyReceiptPDFGenerator();