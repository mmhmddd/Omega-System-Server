// src/utils/pdf-generator-material.util.js - MATERIAL REQUEST PDF GENERATOR
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

class MaterialPDFGenerator {
  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  detectLanguage(materialData) {
    const fieldsToCheck = [
      materialData.section,
      materialData.project,
      materialData.requestReason,
      materialData.additionalNotes
    ];

    if (materialData.items && materialData.items.length > 0) {
      materialData.items.forEach(item => {
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
        title: 'طلب مواد داخلي',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        email: 'info@omega-jordan.com / omega.jo@gmail.com',
        requestInfo: 'معلومات الطلب',
        mrNumber: 'رقم الطلب',
        date: 'التاريخ',
        section: 'القسم',
        project: 'المشروع',
        requestPriority: 'أولوية الطلب',
        requestReason: 'سبب الطلب',
        requiredMaterials: 'المواد المطلوبة',
        itemNo: '#',
        description: 'الوصف',
        unit: 'الوحدة',
        quantity: 'الكمية',
        requiredDate: 'مطلوب بتاريخ',
        priority: 'أولوية المادة',
        additionalNotes: 'ملاحظات',
        additionalNotesPlaceholder: 'أدخل أي ملاحظات إضافية هنا...',
        approvals: 'التوقيعات',
        requester: 'أمين المستلم',
        sectionManager: 'مدير القسم',
        purchaseManager: 'أمين المشتريات',
        docCode: 'OMEGA-MAT-01',
        revision: 'REV. No: 01',
        page: 'صفحة',
        of: 'من'
      },
      en: {
        title: 'Internal Material Request',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        email: 'info@omega-jordan.com / omega.jo@gmail.com',
        requestInfo: 'Request Information',
        mrNumber: 'Request Number',
        date: 'Date',
        section: 'Section',
        project: 'Project',
        requestPriority: 'Request Priority',
        requestReason: 'Request Reason',
        requiredMaterials: 'Required Materials',
        itemNo: '#',
        description: 'Description',
        unit: 'Unit',
        quantity: 'Quantity',
        requiredDate: 'Required Date',
        priority: 'Priority',
        additionalNotes: 'Additional Notes',
        additionalNotesPlaceholder: 'Enter any additional notes here...',
        approvals: 'Approvals',
        requester: 'Warehouse Keeper',
        sectionManager: 'Section Manager',
        purchaseManager: 'Purchase Manager',
        docCode: 'OMEGA-MAT-01',
        revision: 'REV. No: 01',
        page: 'Page',
        of: 'of'
      }
    };

    return labels[lang] || labels.ar;
  }

  generateHTML(material) {
    const language = this.detectLanguage(material);
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    const formattedDate = material.date || new Date().toISOString().split('T')[0];

    let itemsHTML = '';
    if (material.items && material.items.length > 0) {
      itemsHTML = material.items.map((item, index) => `
        <tr>
          <td style="text-align: center; padding: 10px 8px; background-color: #FFFBEA;">${index + 1}</td>
          <td style="text-align: ${isRTL ? 'right' : 'left'}; padding: 10px;">${item.description || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.unit || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.quantity || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.requiredDate || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.priority || ''}</td>
        </tr>
      `).join('');
    } else {
      for (let i = 0; i < 5; i++) {
        itemsHTML += `
        <tr>
          <td style="padding: 10px 8px; height: 40px; background-color: #FFFBEA;">&nbsp;</td>
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
  padding: 10mm;
}

.container {
  width: 100%;
  max-width: 210mm;
  margin: 0 auto;
}

.header-box {
  border: 2px solid #2B4C8C;
  padding: 15px;
  margin-bottom: 15px;
  text-align: center;
}

.header-title {
  color: #2B4C8C;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 10px;
}

.company-info {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #ddd;
}

.company-left, .company-right {
  width: 48%;
  font-size: 10px;
  line-height: 1.6;
}

.company-left {
  text-align: left;
}

.company-right {
  text-align: right;
}

.request-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  margin-bottom: 15px;
  border: 1px solid #2B4C8C;
}

.info-row {
  display: contents;
}

.info-label {
  background-color: #E8F0FE;
  padding: 8px 12px;
  font-weight: bold;
  font-size: 11px;
  border: 1px solid #2B4C8C;
  text-align: ${isRTL ? 'right' : 'left'};
}

.info-value {
  padding: 8px 12px;
  font-size: 11px;
  border: 1px solid #2B4C8C;
  background-color: #fff;
  text-align: ${isRTL ? 'right' : 'left'};
}

.section-title {
  background-color: #2B4C8C;
  color: white;
  padding: 8px 12px;
  font-weight: bold;
  font-size: 13px;
  margin: 15px 0 10px 0;
  text-align: center;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
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

.items-table tbody tr:nth-child(even) {
  background-color: #f9f9f9;
}

.notes-section {
  border: 1px solid #ddd;
  padding: 15px;
  margin: 15px 0;
  min-height: 100px;
  background-color: #FFFBEA;
}

.notes-title {
  font-weight: bold;
  color: #2B4C8C;
  margin-bottom: 8px;
  font-size: 12px;
}

.notes-content {
  font-size: 11px;
  color: #555;
  line-height: 1.6;
}

.approvals-section {
  display: flex;
  justify-content: space-between;
  margin-top: 30px;
  gap: 15px;
}

.approval-box {
  text-align: center;
  width: 32%;
  font-size: 11px;
}

.approval-label {
  margin-bottom: 40px;
  font-weight: normal;
  color: #333;
}

.approval-line {
  border-bottom: 1.5px solid #333;
  width: 100%;
}

.footer {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  font-size: 10px;
  color: #666;
  border-top: 1px solid #ddd;
  padding-top: 10px;
}

@media print {
  body {
    padding: 0;
  }
}
</style>
</head>

<body>

<div class="container">

  <!-- Header Box -->
  <div class="header-box">
    <div class="header-title">${labels.title}</div>
    <div class="company-info">
      <div class="company-left">
        <strong>${labels.companyNameEn}</strong><br>
        ${labels.taglineEn}<br>
        ${labels.country}<br>
        ${labels.tel}<br>
        ${labels.website} / ${labels.email}
      </div>
      <div class="company-right">
        <strong>${labels.companyNameAr}</strong><br>
        ${labels.tagline}<br>
        ${labels.country}<br>
        ${labels.tel}<br>
        ${labels.website} / ${labels.email}
      </div>
    </div>
  </div>

  <!-- Request Information -->
  <div class="request-info">
    <div class="info-row">
      <div class="info-label">${labels.mrNumber}</div>
      <div class="info-value">${material.mrNumber || ''}</div>
    </div>
    <div class="info-row">
      <div class="info-label">${labels.date}</div>
      <div class="info-value">${formattedDate}</div>
    </div>
    <div class="info-row">
      <div class="info-label">${labels.section}</div>
      <div class="info-value">${material.section || ''}</div>
    </div>
    <div class="info-row">
      <div class="info-label">${labels.project}</div>
      <div class="info-value">${material.project || ''}</div>
    </div>
    <div class="info-row">
      <div class="info-label">${labels.requestPriority}</div>
      <div class="info-value">${material.requestPriority || ''}</div>
    </div>
    <div class="info-row">
      <div class="info-label">${labels.requestReason}</div>
      <div class="info-value">${material.requestReason || ''}</div>
    </div>
  </div>

  <!-- Required Materials Section Title -->
  <div class="section-title">${labels.requiredMaterials}</div>

  <!-- Items Table -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 6%;">${labels.itemNo}</th>
        <th style="width: 30%;">${labels.description}</th>
        <th style="width: 12%;">${labels.unit}</th>
        <th style="width: 12%;">${labels.quantity}</th>
        <th style="width: 20%;">${labels.requiredDate}</th>
        <th style="width: 20%;">${labels.priority}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <!-- Additional Notes -->
  <div class="notes-section">
    <div class="notes-title">${labels.additionalNotes}</div>
    <div class="notes-content">${material.additionalNotes || labels.additionalNotesPlaceholder}</div>
  </div>

  <!-- Approvals Section -->
  <div class="approvals-section">
    <div class="approval-box">
      <div class="approval-label">${labels.requester}</div>
      <div class="approval-line"></div>
    </div>
    <div class="approval-box">
      <div class="approval-label">${labels.sectionManager}</div>
      <div class="approval-line"></div>
    </div>
    <div class="approval-box">
      <div class="approval-label">${labels.purchaseManager}</div>
      <div class="approval-line"></div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${labels.docCode}</span>
    <span>${labels.revision}</span>
    <span>${labels.page} 1 ${labels.of} 1</span>
  </div>

</div>

</body>
</html>
    `;
  }

  async generateMaterialPDF(material) {
    const language = this.detectLanguage(material);

    return new Promise(async (resolve, reject) => {
      let browser;
      
      try {
        const pdfDir = path.join(__dirname, '../../data/materials-requests/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = `${material.mrNumber || 'IMR'}_${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);
        const html = this.generateHTML(material);

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
            top: '10mm',
            right: '10mm',
            bottom: '10mm',
            left: '10mm'
          }
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
}

module.exports = new MaterialPDFGenerator();