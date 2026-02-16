// src/utils/pdf-generatorRecipts.util.js - UPDATED: Dynamic rows - removes empty fields completely
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class PDFGenerator {
  DEFAULT_TERMS_AR = `الشروط والأحكام

تُعتبر جميع المواد والبنود والخدمات غير المذكورة صراحةً في هذا المستند مستثناة. كما أن أي خدمات أو أعمال تقع خارج نطاق عمل المورد غير مشمولة. ضريبة القيمة المضافة وأي رسوم حكومية أو تصاريح أو موافقات رسمية غير مشمولة ما لم يُذكر خلاف ذلك صراحةً. كما أن الأعمال المدنية وأعمال الرفع والمناولة وفك وإعادة تركيب العوائق الموجودة في الموقع أو أي أعمال مشابهة غير مشمولة ما لم يتم ذكرها بشكل واضح.

أي أعمال إضافية أو تغييرات أو تعديلات أو متطلبات غير مذكورة في هذا المستند تخضع لتكاليف إضافية وتعديل في مدة التنفيذ حسب الحالة. كما أن رسوم الدراسات واعتماد التصاميم والموافقات الرسمية والتصاريح وختم المخططات والحسابات الهندسية أو أي متطلبات فنية مشابهة غير مشمولة ما لم يُذكر خلاف ذلك صراحةً.

الأسعار مبنية على أساس تنفيذ الطلب بالكامل كما هو محدد، وفي حال تنفيذ جزء من الطلب يحق للمورد تعديل الأسعار وفقًا لذلك.

تكون شروط الدفع على النحو التالي:
• ( )% دفعة مقدمة عند تأكيد الطلب  
• ( )% أثناء التنفيذ / عند التوريد  
• ( )% عند الانتهاء والتسليم النهائي  

يسري هذا المستند لمدة ( ) يوم تقويمي / يوم عمل من تاريخ الإصدار ما لم يُذكر خلاف ذلك.

تعتمد مدة التنفيذ والتوريد على تأكيد الطلب واستلام الموافقات اللازمة وجاهزية الموقع.  
مدة التنفيذ التقديرية: ( ) يوم / أسبوع / شهر من تاريخ تأكيد الطلب.`;



  DEFAULT_TERMS_EN = `Terms and Conditions

All materials, items, and services not explicitly stated in this document shall be considered excluded. Any services or works falling outside the Supplier's scope are not included. Value Added Tax (VAT) and any applicable governmental fees, permits, or approvals are not included unless otherwise expressly stated. Civil works, lifting equipment, handling, dismantling, re-installation of existing site obstacles, or any similar activities are excluded unless clearly mentioned.

Any additional work, variations, modifications, or requirements not specified in this document shall be subject to additional cost and corresponding time adjustments, as applicable. Fees related to studies, design approvals, authority approvals, permits, stamping, engineering calculations, or any similar technical requirements are not included unless explicitly stated.

Prices are based on the execution of the complete order as specified. In the event of partial order execution, the Supplier reserves the right to revise and amend the prices accordingly.

Payment terms shall be as follows:
• ( )% advance payment upon order confirmation  
• ( )% during project execution / upon delivery  
• ( )% upon completion and final handover  

This document is valid for ( ) calendar / working days from the date of issuance unless otherwise stated.

Execution and delivery timelines are subject to order confirmation, receipt of required approvals, and readiness of the project/site conditions.  
Estimated execution period: ( ) days / weeks / months from the date of order confirmation.`;



  /**
   * ✅ Get default Terms & Conditions text based on language
   */
  getDefaultTermsAndConditions(language = 'ar') {
    return language === 'ar' ? this.DEFAULT_TERMS_AR : this.DEFAULT_TERMS_EN;
  }

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
        vehicleNumber: 'رقم المركبة',
        quantity: 'العدد',
        description: 'وصف',
        element: 'العناصر',
        receiverSignature: 'توقيع المستلم',
        name: 'الاسم',
        dateField: 'التاريخ',
        docCode: 'OMEGA-RIC-01',
        dateOfIssue: 'DATE OF ISSUE',
        additionalInfo: 'يرجى استلام ما تم إدراجه أدناه',
        additionalNotes: 'ملاحظات إضافية',
        termsAndConditions: 'الشروط والأحكام'
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
        vehicleNumber: 'Vehicle Number',
        quantity: 'Quantity',
        description: 'Description',
        element: 'Elements',
        receiverSignature: 'Receiver Signature',
        name: 'Name',
        dateField: 'Date',
        docCode: 'OMEGA-RIC-01',
        dateOfIssue: 'DATE OF ISSUE',
        additionalInfo: 'Please receive the items listed below:',
        additionalNotes: 'Additional Notes',
        termsAndConditions: 'Terms and Conditions'
      }
    };

    return labels[lang] || labels.ar;
  }

  generateHTML(receipt) {
    const language = this.detectLanguage(receipt);
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    const formattedDate = receipt.date || new Date().toISOString().split('T')[0];

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           PDF GENERATOR: PROCESSING RECEIPT                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('📄 Receipt data:');
    console.log('   - companyNumber:', receipt.companyNumber);
    console.log('   - additionalText:', receipt.additionalText);
    console.log('   - notes:', receipt.notes);
    console.log('   - items:', receipt.items?.length || 0);
    console.log('════════════════════════════════════════════════════════════');

    // ✅ Check if we have items with data
    const hasItems = receipt.items && receipt.items.length > 0;
    
    // ✅ Generate items HTML only if items exist
    let itemsTableHTML = '';
    if (hasItems) {
      const itemsHTML = receipt.items.map(item => `
        <tr>
          <td style="text-align: center; padding: 12px 8px;">${item.quantity || ''}</td>
          <td style="text-align: ${isRTL ? 'right' : 'left'}; padding: 12px 10px;">${item.description || ''}</td>
          <td style="text-align: ${isRTL ? 'right' : 'left'}; padding: 12px 10px;">${item.element || ''}</td>
        </tr>
      `).join('');

      itemsTableHTML = `
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 15%;">${labels.quantity}</th>
              <th style="width: 40%; text-align: ${isRTL ? 'right' : 'center'};">${labels.description}</th>
              <th style="width: 45%; text-align: ${isRTL ? 'right' : 'center'};">${labels.element}</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      `;
    }

    // ✅ Generate additional text box only if additionalText exists
    let additionalTextHTML = '';
    if (receipt.additionalText && receipt.additionalText.trim() !== '') {
      const fixedSentence = '' ;

      additionalTextHTML = `
        <div style="
          text-align: ${isRTL ? 'right' : 'left'}; 
          margin: 5px 0; 
          padding: 10px 15px; 
          border: 2px solid #1565C0; 
          border-radius: 8px; 
          background-color: #f0f7ff; 
          line-height: 1.8;
          break-inside: avoid;
          page-break-inside: avoid;
        ">
          <div style="
            margin-bottom: 10px; 
            font-weight: bold; 
            color: #0D47A1; 
            font-size: 14px;
          ">
            ${fixedSentence}
          </div>
          <div style="
            color: #1565C0; 
            font-size: 13px; 
            line-height: 1.6;
            font-weight: 500;
          ">
            ${receipt.additionalText}
          </div>
        </div>
      `;
    }

    // ✅ Generate notes box only if notes exist
    let notesHTML = '';
    if (receipt.notes && receipt.notes.trim() !== '') {
      notesHTML = `
        <div class="additional-notes-box">
          <div class="additional-notes-content">${receipt.notes}</div>
        </div>
      `;
    }

    // ✅ NEW: Generate details box HTML dynamically - only shows rows with data
    const generateDetailsBox = () => {
      // Collect all fields with their values
      const allFields = [
        { label: labels.to, value: receipt.to },
        { label: labels.address, value: receipt.address },
        { label: labels.attention, value: receipt.attention },
        { label: labels.projectCode, value: receipt.projectCode },
        { label: labels.workLocation, value: receipt.workLocation },
        { label: labels.vehicleNumber, value: receipt.companyNumber },
        { label: labels.date, value: formattedDate }, // Date always present
        { label: labels.receiptNumber, value: receipt.receiptNumber }
      ].filter(field => field.value); // Only keep fields with values
      
      // Generate rows with 3 cells each
      let rowsHTML = '';
      for (let i = 0; i < allFields.length; i += 3) {
        const row = allFields.slice(i, i + 3);
        const cellsHTML = row.map(field => `
          <div class="detail-cell">
            <span class="detail-cell-label">${field.label}:</span>
            <span class="detail-cell-value">${field.value}</span>
          </div>
        `).join('');
        
        // Add empty cells to fill the row if needed
        const emptyCells = row.length < 3 ? '<div class="detail-cell"><span class="detail-cell-empty">-</span></div>'.repeat(3 - row.length) : '';
        
        rowsHTML += `<div class="detail-row">${cellsHTML}${emptyCells}</div>`;
      }
      
      return rowsHTML;
    };

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

@page {
  size: A4;
  margin: 35mm 20mm 25mm 20mm;
}

.page-content {
  width: 100%;
  background: #fff;
}

/* ✅ Company info section - directly under logo, no background */
.company-info {
  padding: 5px 0 10px 0;
  margin-bottom: 10px;
  break-inside: avoid;
  page-break-inside: avoid;
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

/* ✅ Single blue separator line */
.blue-separator {
  width: 100%;
  height: 3px;
  background-color: var(--primary);
  margin: 10px 0 20px 0;
}

/* ✅ Title after blue line */
.title {
  text-align: center;
  margin: 0 0 25px 0;
  font-size: 24px;
  color: var(--primary);
  font-weight: bold;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* ✅ Details box with dynamic 3-column layout */
.details-box {
  border: 2px solid var(--primary);
  padding: 0;
  margin: 20px 0;
  border-radius: 4px;
  overflow: hidden;
  break-inside: avoid;
  page-break-inside: avoid;
}

.detail-row {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  min-height: 45px;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-row:nth-child(even) {
  background-color: #f9f9f9;
}

.detail-cell {
  width: 33.33%;
  padding: 12px 15px;
  border-${isRTL ? 'left' : 'right'}: 1px solid #e0e0e0;
  display: flex;
  align-items: center;
  gap: 8px;
  text-align: ${isRTL ? 'right' : 'left'};
}

.detail-cell:last-child {
  border-${isRTL ? 'left' : 'right'}: none;
}

.detail-cell-label {
  font-weight: bold;
  font-size: 12px;
  color: var(--primary);
  white-space: nowrap;
  flex-shrink: 0;
}

.detail-cell-value {
  font-size: 13px;
  color: #333;
  line-height: 1.4;
  flex: 1;
}

.detail-cell-empty {
  visibility: hidden;
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
  display: table-header-group;
}

.items-table thead th {
  padding: 10px 8px;
  text-align: center;
  font-size: 13px;
  font-weight: bold;
  border: 1px solid #6b8dd6;
}

.items-table tbody {
  display: table-row-group;
}

.items-table tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

.items-table tbody td {
  border: 1px solid var(--light-border);
  font-size: 12px;
  padding: 10px 8px;
}

.items-table tbody tr {
  background-color: #fff;
}

.additional-notes-box {
  margin: 25px 0;
  padding: 15px 20px;
  border: 2px solid #FDD835;
  border-radius: 8px;
  background-color: #FFFDE7;
  min-height: 80px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.additional-notes-title {
  font-weight: bold;
  font-size: 14px;
  color: #333;
  margin-bottom: 8px;
  text-align: ${isRTL ? 'right' : 'left'};
}

.additional-notes-content {
  font-size: 13px;
  color: #555;
  line-height: 1.6;
  text-align: ${isRTL ? 'right' : 'left'};
  white-space: pre-wrap;
}

.signature-section {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  gap: 25px;
  break-inside: avoid;
  page-break-inside: avoid;
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

  <!-- ✅ Company info directly under logo (no background) -->
  <div class="company-info">
    <div class="company-row">
      ${isRTL ? `
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>المملكة الأردنية الهاشمية</p>
        <p> تلفون: 96264161060+ | فاكس: 96264162060</p>
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
        <p> تلفون: 96264161060+ | فاكس: 96264162060</p>
      </div>
      `}
    </div>
  </div>


  <!-- ✅ Title after blue line -->
  <h1 class="title">${labels.title}</h1>

  <!-- ✅ NEW: Dynamic Details Box - only shows rows with filled data -->
  <div class="details-box">
    ${generateDetailsBox()}
  </div>

  <!-- ✅ Additional Text Box (only if exists) -->
  ${additionalTextHTML}

  <!-- ✅ Items Table (only if exists) -->
  ${itemsTableHTML}

  <!-- ✅ Notes Box (only if exists) -->
  ${notesHTML}

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
/**
   * ✅ NEW: Generate Terms & Conditions HTML Page
   */
  generateTermsHTML(termsText, language = 'ar') {
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    
    // Escape HTML special characters
    const escapeHtml = (text) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    // Convert line breaks to HTML
    const formattedText = escapeHtml(termsText).replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>${isRTL ? 'الشروط والأحكام' : 'Terms and Conditions'} - OMEGA</title>
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

.company-info {
  padding: 5px 0 10px 0;
  margin-bottom: 10px;
  break-inside: avoid;
  page-break-inside: avoid;
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

.blue-separator {
  width: 100%;
  height: 3px;
  background-color: #0b4fa2;
  margin: 10px 0 20px 0;
}

.title {
  text-align: center;
  margin: 0 0 25px 0;
  font-size: 24px;
  color: #0b4fa2;
  font-weight: bold;
  break-inside: avoid;
  page-break-inside: avoid;
}

.terms-content {
  padding: 20px 0;
  font-size: 12px;
  line-height: 1.8;
  color: #333;
  text-align: ${isRTL ? 'right' : 'left'};
  white-space: pre-wrap;
}

@media print {
  body {
    background: none;
    padding: 0;
    margin: 0;
  }
}
</style>
</head>

<body>

<div class="page-content">

  <!-- Company Info Header -->
  <div class="company-info">
    <div class="company-row">
      ${isRTL ? `
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>المملكة الأردنية الهاشمية</p>
        <p> تلفون: 96264161060+ | فاكس:  96264162060</p>
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

  <!-- Title -->
  <h1 class="title">${isRTL ? 'الشروط والأحكام' : 'Terms and Conditions'}</h1>

  <!-- Terms Content -->
  <div class="terms-content">${formattedText}</div>

</div>

</body>
</html>
    `;
  }

  /**
   * ✅ FIXED: Add Terms & Conditions page to existing PDF
   */
  async addTermsAndConditionsPage(existingPdfPath, termsText, language = 'ar') {
    let browser;
    
    try {
      console.log('📄 Generating Terms & Conditions page...');
      
      // Generate Terms HTML
      const termsHTML = this.generateTermsHTML(termsText, language);
      
      // Create temporary Terms PDF
      const tempTermsPath = existingPdfPath.replace('.pdf', '_terms_temp.pdf');
      
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
      await page.setContent(termsHTML, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      await page.pdf({
        path: tempTermsPath,
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
      browser = null;

      // Merge the Terms PDF with the existing PDF
      console.log('📄 Merging Terms & Conditions page with main PDF...');
      
      const existingPdfBytes = fs.readFileSync(existingPdfPath);
      const termsPdfBytes = fs.readFileSync(tempTermsPath);
      
      const existingPdf = await PDFDocument.load(existingPdfBytes);
      const termsPdf = await PDFDocument.load(termsPdfBytes);
      
      // Create merged PDF
      const mergedPdf = await PDFDocument.create();
      
      // Copy all pages from existing PDF
      const existingPages = await mergedPdf.copyPages(
        existingPdf,
        existingPdf.getPageIndices()
      );
      existingPages.forEach(page => mergedPdf.addPage(page));
      
      // Copy all pages from Terms PDF
      const termsPages = await mergedPdf.copyPages(
        termsPdf,
        termsPdf.getPageIndices()
      );
      termsPages.forEach(page => mergedPdf.addPage(page));
      
      // Save merged PDF
      const mergedPdfBytes = await mergedPdf.save();
      fs.writeFileSync(existingPdfPath, mergedPdfBytes);
      
      // Delete temporary Terms PDF
      try {
        fs.unlinkSync(tempTermsPath);
        console.log('✅ Terms & Conditions page added successfully');
      } catch (err) {
        console.log('⚠️ Could not delete temp Terms PDF:', err.message);
      }
      
    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error('❌ Error adding Terms & Conditions page:', error);
      throw error;
    }
  }
  /**
   * ✅ UPDATED: Generate receipt PDF with custom filename and T&C in same language
   */
  async generateReceiptPDF(receipt, customFilename = null, termsAndConditionsText = null) {
    const language = this.detectLanguage(receipt);

    return new Promise(async (resolve, reject) => {
      let browser;
      
      try {
        const pdfDir = path.join(__dirname, '../../data/receipts/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        const filename = customFilename || `${receipt.receiptNumber || 'receipt'}_${Date.now()}.pdf`;
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
        browser = null;

        // ✅ If Terms & Conditions text is provided, add it as a new page WITH SAME LANGUAGE
        if (termsAndConditionsText && termsAndConditionsText.trim()) {
          console.log(`📄 Adding Terms & Conditions page to PDF in ${language === 'ar' ? 'Arabic' : 'English'}...`);
          await this.addTermsAndConditionsPage(filepath, termsAndConditionsText, language);
        }

        console.log('✅ PDF generated with filename:', filename);
        console.log(`✅ Language: ${language === 'ar' ? 'Arabic' : 'English'}`);

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
      console.log('⚠️ Logo not found');
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

  /**
   * ✅ FIXED: mergePDFs now properly handles all merging scenarios
   */
  async mergePDFs(generatedPdfPath, attachmentPdf = null, outputFilename = null, language = 'ar') {
    try {
      console.log('📄 Starting PDF merge process...');
      console.log('   - Generated PDF:', generatedPdfPath);
      console.log('   - Has attachment:', !!attachmentPdf);
      console.log('   - Output filename:', outputFilename);

      // Step 1: Load the generated PDF
      const generatedPdfBytes = fs.readFileSync(generatedPdfPath);
      let workingPdf = await PDFDocument.load(generatedPdfBytes);

      // Step 2: If there's an attachment, merge it
      if (attachmentPdf) {
        console.log('📎 Merging attachment PDF...');
        
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

        // Copy pages from generated PDF
        const generatedPages = await mergedPdf.copyPages(
          workingPdf,
          workingPdf.getPageIndices()
        );
        generatedPages.forEach(page => mergedPdf.addPage(page));

        // Copy and resize pages from attachment
        const attachmentIndices = attachmentPdfDoc.getPageIndices();
        for (const index of attachmentIndices) {
          const [copiedPage] = await mergedPdf.copyPages(attachmentPdfDoc, [index]);
          const { width, height } = copiedPage.getSize();
          
          const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
          
          if (!isA4) {
            await this.resizePageToA4(copiedPage);
          }
          
          mergedPdf.addPage(copiedPage);
        }

        workingPdf = mergedPdf;
        console.log('✅ Attachment merged successfully');
      }

      // Step 3: Add headers and footers to all pages
      console.log('📄 Adding headers and footers...');
      await this.addHeadersFootersToAllPages(workingPdf, language);

      // Step 4: Save the final PDF
      const finalFilename = outputFilename || path.basename(generatedPdfPath);
      const outputDir = path.dirname(generatedPdfPath);
      const outputPath = path.join(outputDir, finalFilename);

      const finalPdfBytes = await workingPdf.save();
      fs.writeFileSync(outputPath, finalPdfBytes);

      // Step 5: Clean up original file if output path is different
      if (outputPath !== generatedPdfPath) {
        try {
          fs.unlinkSync(generatedPdfPath);
          console.log('✅ Original file cleaned up');
        } catch (err) {
          console.log('⚠️ Could not delete original file');
        }
      }

      console.log('✅ PDF merge completed:', finalFilename);

      return {
        filepath: outputPath,
        filename: finalFilename,
        merged: !!attachmentPdf,
        pageCount: {
          total: workingPdf.getPageCount()
        }
      };
    } catch (error) {
      console.error('❌ PDF merge failed:', error);
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