
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class RFQPDFGenerator {
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

All materials, items, and services not explicitly stated in this document shall be considered excluded. Any services or works falling outside the Supplier’s scope are not included. Value Added Tax (VAT) and any applicable governmental fees, permits, or approvals are not included unless otherwise expressly stated. Civil works, lifting equipment, handling, dismantling, re-installation of existing site obstacles, or any similar activities are excluded unless clearly mentioned.

Any additional work, variations, modifications, or requirements not specified in this document shall be subject to additional cost and corresponding time adjustments, as applicable. Fees related to studies, design approvals, authority approvals, permits, stamping, engineering calculations, or any similar technical requirements are not included unless explicitly stated.

Prices are based on the execution of the complete order as specified. In the event of partial order execution, the Supplier reserves the right to revise and amend the prices accordingly.

Payment terms shall be as follows:
• ( )% advance payment upon order confirmation  
• ( )% during project execution / upon delivery  
• ( )% upon completion and final handover  

This document is valid for ( ) calendar / working days from the date of issuance unless otherwise stated.

Execution and delivery timelines are subject to order confirmation, receipt of required approvals, and readiness of the project/site conditions.  
Estimated execution period: ( ) days / weeks / months from the date of order confirmation.`;



  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  detectLanguage(rfqData) {
    if (rfqData.requester && rfqData.requester.trim() !== '') {
      return this.isArabic(rfqData.requester) ? 'ar' : 'en';
    }

    const fieldsToCheck = [];
    
    if (rfqData.production) fieldsToCheck.push(rfqData.production);
    if (rfqData.supplier) fieldsToCheck.push(rfqData.supplier);
    if (rfqData.supplierAddress) fieldsToCheck.push(rfqData.supplierAddress);
    if (rfqData.notes) fieldsToCheck.push(rfqData.notes);

    if (rfqData.items && rfqData.items.length > 0) {
      rfqData.items.forEach(item => {
        if (item.description) fieldsToCheck.push(item.description);
        if (item.unit) fieldsToCheck.push(item.unit);
      });
    }

    // If no content fields at all, default to Arabic
    if (fieldsToCheck.length === 0) {
      return 'ar';
    }

    // Count Arabic fields
    let arabicCount = 0;
    fieldsToCheck.forEach(field => {
      if (this.isArabic(field)) {
        arabicCount++;
      }
    });

    return arabicCount > (fieldsToCheck.length / 2) ? 'ar' : 'en';
  }

  getDepartmentTranslation(departmentLabel, targetLanguage) {
    const departmentMap = {
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

    if (departmentMap[departmentLabel]) {
      return departmentMap[departmentLabel][targetLanguage];
    }

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
        rfqNo: 'رقم طلب التسعير',
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

  hasRequestInfoData(rfq) {
    return this.hasData(rfq.requester) ||
           this.hasData(rfq.production) ||
           this.hasData(rfq.supplier) ||
           this.hasData(rfq.supplierAddress) ||
           rfq.urgent === true;
  }

  // Calculate item total price
  calculateItemTotal(quantity, unitPrice) {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    return (qty * price).toFixed(2);
  }

  // Calculate grand total
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
    const language = this.detectLanguage(rfq);
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    const formattedDate = rfq.date || new Date().toISOString().split('T')[0];
    
    // Translate department based on detected language
    const translatedDepartment = rfq.production 
      ? this.getDepartmentTranslation(rfq.production, language)
      : '';
    
    // Check what data exists
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

    // Build request info fields conditionally
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
      
      // Use translated department
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

/* ✅ Company info section without gray background */
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
  background-color: #2B4C8C;
  margin: 10px 0 20px 0;
}

.title {
  text-align: center;
  margin: 0 0 25px 0;
  font-size: 24px;
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
  border: 1px solid #ddd;
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
  border: 2px solid #FDD835;
  border-radius: 8px;
  min-height: 80px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.notes-content {
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

  <!-- ✅ Company info directly under logo (same as delivery receipt) -->
  <div class="company-info">
    <div class="company-row">
      ${isRTL ? `
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>الأردن</p>
        <p>تلفون: 96264161060+ | فاكس:  96264161060+</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      <div class="company-col company-col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      ` : `
      <div class="company-col company-col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>الأردن</p>
        <p>تلفون: 96264161060+ | فاكس:  96264161060+</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      `}
    </div>
  </div>

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
    <div class="notes-content">${rfq.notes}</div>
  </div>
  ` : ''}

  <!-- Signature section -->
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

/**
 * ✅ GENERATE RFQ PDF WITH TEXT-BASED TERMS & CONDITIONS
 */
async generateRFQPDF(id, userId, userRole, attachmentPdf = null) {
  const rfq = await this.getRFQById(id, userId, userRole);

  if (!rfq.requester || rfq.requester.trim() === '') {
    rfq.requester = await this.getUserName(userId);
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       GENERATING RFQ PDF                                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('📄 RFQ Number:', rfq.rfqNumber);
  console.log('📎 Include Terms & Conditions:', rfq.includeTermsAndConditions);
  console.log('📎 Terms Text Length:', rfq.termsAndConditionsText?.length || 0);
  console.log('📎 User Attachment:', attachmentPdf ? 'Yes' : 'No');
  console.log('════════════════════════════════════════════════════════════');

  const sanitizeFilename = (str) => {
    if (!str) return 'Unknown';
    return str.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, '_').substring(0, 30);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) {
      const today = new Date().toISOString().split('T')[0];
      const [year, month, day] = today.split('-');
      return `${day}-${month}-${year}`;
    }
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
  };

  const rfqNumber = rfq.rfqNumber || 'RFQ0000';
  const requesterName = sanitizeFilename(rfq.requester);
  const dateFormatted = formatDate(rfq.date);
  const customFilename = `${rfqNumber}_${requesterName}_${dateFormatted}`;

  console.log('📝 Custom filename:', customFilename);

  // ✅ NEW: Detect language BEFORE generating PDF
  const detectedLanguage = this.detectRFQLanguage(rfq);
  console.log('🌐 Detected language:', detectedLanguage);

  // ✅ NEW: Use language-appropriate default terms if needed
  let termsText = rfq.termsAndConditionsText;
  
  // If terms are enabled but text is empty, use default based on detected language
  if (rfq.includeTermsAndConditions && (!termsText || termsText.trim() === '')) {
    termsText = detectedLanguage === 'ar' ? this.DEFAULT_TERMS_AR : this.DEFAULT_TERMS_EN;
    console.log('📝 Using default terms for language:', detectedLanguage);
  }

  // ✅ Pass termsText (which is now language-aware) to PDF generator
  const pdfResult = await rfqPdfGenerator.generateRFQPDF(
    rfq, 
    customFilename,
    termsText // Pass the language-appropriate text
  );

  // ... rest of the method stays the same ...
  const pdfsToMerge = [];

  if (attachmentPdf) {
    const isValid = await rfqPdfGenerator.isValidPDF(attachmentPdf);
    if (isValid) {
      pdfsToMerge.push(attachmentPdf);
      console.log('✅ Added user attachment PDF to merge list');
    } else {
      console.warn('⚠️ Invalid user attachment PDF, skipping');
    }
  }

  let finalPdfResult = pdfResult;
  try {
    if (pdfsToMerge.length > 0) {
      console.log(`🔄 Merging ${pdfsToMerge.length} PDF(s) with RFQ...`);
      
      let currentPath = pdfResult.filepath;
      
      for (let i = 0; i < pdfsToMerge.length; i++) {
        const mergeResult = await rfqPdfGenerator.mergePDFs(
          currentPath,
          pdfsToMerge[i],
          null,
          pdfResult.language
        );
        currentPath = mergeResult.filepath;
        
        if (i === pdfsToMerge.length - 1) {
          finalPdfResult = {
            ...pdfResult,
            filename: mergeResult.filename,
            filepath: mergeResult.filepath,
            merged: true,
            pageCount: mergeResult.pageCount
          };
        }
      }
      
      console.log('✅ PDF merge completed successfully');
    } else {
      const headerResult = await rfqPdfGenerator.mergePDFs(
        pdfResult.filepath,
        null,
        null,
        pdfResult.language
      );
      
      finalPdfResult = {
        ...pdfResult,
        filename: headerResult.filename,
        filepath: headerResult.filepath,
        merged: false,
        pageCount: headerResult.pageCount
      };
    }
  } catch (mergeError) {
    console.error('❌ PDF merge/header failed:', mergeError.message);
    finalPdfResult.mergeError = mergeError.message;
  }

  const rfqs = await this.loadRFQs();
  const rfqIndex = rfqs.findIndex(r => r.id === id);

  if (rfqIndex !== -1) {
    rfqs[rfqIndex].pdfFilename = finalPdfResult.filename;
    rfqs[rfqIndex].pdfLanguage = finalPdfResult.language;
    rfqs[rfqIndex].pdfGeneratedAt = new Date().toISOString();
    rfqs[rfqIndex].pdfMerged = finalPdfResult.merged || false;
    if (finalPdfResult.pageCount) {
      rfqs[rfqIndex].pdfPageCount = finalPdfResult.pageCount;
    }
    await this.saveRFQs(rfqs);
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('✅ PDF generation complete!');
  console.log('════════════════════════════════════════════════════════════\n');

  return {
    rfq,
    pdf: finalPdfResult
  };
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
    
    const primaryBlue = rgb(0.169, 0.298, 0.549); // #2B4C8C
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

      // Clear header area on subsequent pages
      if (i > 0) {
        page.drawRectangle({
          x: 0,
          y: height - 100,
          width: width,
          height: 100,
          color: white
        });
      }

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

      // Draw blue line under header
      page.drawLine({
        start: { x: 50, y: height - 90 },
        end: { x: width - 50, y: height - 90 },
        thickness: 2,
        color: primaryBlue
      });

      // Draw date of issue (no REV No)
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

      // Draw footer text
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

  // Add these methods to the RFQPDFGenerator class

/**
 * ✅ NEW: Generate Terms & Conditions HTML Page
 */
generateTermsHTML(termsText, language = 'ar') {
  const labels = this.getLabels(language);
  const isRTL = language === 'ar';
  
  const escapeHtml = (text) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formattedText = escapeHtml(termsText).replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>${labels.termsAndConditions || 'Terms and Conditions'} - OMEGA</title>
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
  background-color: #2B4C8C;
  margin: 10px 0 20px 0;
}

.title {
  text-align: center;
  margin: 0 0 25px 0;
  font-size: 24px;
  color: #2B4C8C;
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
        <p>الأردن</p>
        <p>تلفون: 96264161060+ | فاكس:  96264161060+</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      <div class="company-col company-col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      ` : `
      <div class="company-col company-col-left">
        <p><strong>OMEGA ENGINEERING INDUSTRIES CO.</strong></p>
        <p>Design – Manufacture – Installation</p>
        <p>Jordan</p>
        <p>Tel: +96264161060 | Fax: +96264162060</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>الأردن</p>
        <p>تلفون: 96264161060+ | فاكس:  96264161060+</p>
        <p>https://www.omega-jordan.com</p>
      </div>
      `}
    </div>
  </div>

  <!-- Title -->
  <h1 class="title">${labels.termsAndConditions || 'Terms and Conditions'}</h1>

  <!-- Terms Content -->
  <div class="terms-content">${formattedText}</div>

</div>

</body>
</html>
  `;
}

/**
 * ✅ NEW: Add Terms & Conditions page to existing PDF
 */
async addTermsAndConditionsPage(existingPdfPath, termsText, language = 'ar') {
  let browser;
  
  try {
    const termsHTML = this.generateTermsHTML(termsText, language);
    
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

    console.log('📄 Merging Terms & Conditions page with main PDF...');
    
    const existingPdfBytes = fs.readFileSync(existingPdfPath);
    const termsPdfBytes = fs.readFileSync(tempTermsPath);
    
    const existingPdf = await PDFDocument.load(existingPdfBytes);
    const termsPdf = await PDFDocument.load(termsPdfBytes);
    
    const mergedPdf = await PDFDocument.create();
    
    const existingPages = await mergedPdf.copyPages(
      existingPdf,
      existingPdf.getPageIndices()
    );
    existingPages.forEach(page => mergedPdf.addPage(page));
    
    const termsPages = await mergedPdf.copyPages(
      termsPdf,
      termsPdf.getPageIndices()
    );
    termsPages.forEach(page => mergedPdf.addPage(page));
    
    const mergedPdfBytes = await mergedPdf.save();
    fs.writeFileSync(existingPdfPath, mergedPdfBytes);
    
    try {
      fs.unlinkSync(tempTermsPath);
      console.log('✅ Terms & Conditions page added successfully');
    } catch (err) {
      console.log('Could not delete temp Terms PDF:', err.message);
    }
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('❌ Error adding Terms & Conditions page:', error);
    throw error;
  }
}

// Update the generateRFQPDF method signature to accept termsAndConditionsText
async generateRFQPDF(rfq, customFilename = null, termsAndConditionsText = null) {
  const language = this.detectLanguage(rfq);

  return new Promise(async (resolve, reject) => {
    let browser;
    
    try {
      const pdfDir = path.join(__dirname, '../../data/rfqs/pdfs');
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      const filename = customFilename 
        ? `${customFilename}.pdf`
        : `${rfq.rfqNumber || 'rfq'}_${Date.now()}.pdf`;
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
      browser = null;

      // ✅ If Terms & Conditions text is provided, add it as a new page
      if (termsAndConditionsText && termsAndConditionsText.trim()) {
        console.log('📄 Adding Terms & Conditions page to PDF...');
        await this.addTermsAndConditionsPage(filepath, termsAndConditionsText, language);
      }

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
      rfqNo: 'رقم طلب التسعير',
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
      issueDate: 'DATE OF ISSUE',
      termsAndConditions: 'الشروط والأحكام' // ✅ ADD THIS LINE
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
      issueDate: 'DATE OF ISSUE',
      termsAndConditions: 'Terms and Conditions' // ✅ ADD THIS LINE
    }
  };

  return labels[lang] || labels.ar;
}

  async mergePDFs(generatedPdfPath, attachmentPdf = null, staticPdfPath = null, language = 'ar') {
    try {
      // ✅ If no attachment and no static PDF, just add headers/footers
      if (!attachmentPdf && !staticPdfPath) {
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

      // ✅ Load generated PDF
      const generatedPdfBytes = fs.readFileSync(generatedPdfPath);
      const generatedPdf = await PDFDocument.load(generatedPdfBytes);
      const mergedPdf = await PDFDocument.create();
      const a4 = this.getA4Dimensions();

      // ✅ Add generated PDF pages first
      const generatedPages = await mergedPdf.copyPages(
        generatedPdf,
        generatedPdf.getPageIndices()
      );
      generatedPages.forEach(page => mergedPdf.addPage(page));

      // ✅ Track page counts
      let attachmentPageCount = 0;
      let staticPageCount = 0;

      // ✅ Add attachment PDF if provided
      if (attachmentPdf) {
        let attachmentPdfBytes;
        if (Buffer.isBuffer(attachmentPdf)) {
          attachmentPdfBytes = attachmentPdf;
        } else if (typeof attachmentPdf === 'string') {
          attachmentPdfBytes = fs.readFileSync(attachmentPdf);
        } else {
          throw new Error('Invalid attachment format');
        }

        const attachmentPdfDoc = await PDFDocument.load(attachmentPdfBytes);
        attachmentPageCount = attachmentPdfDoc.getPageCount();
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
      }

      // ✅ Add static PDF if provided and exists
      if (staticPdfPath && fs.existsSync(staticPdfPath)) {
        const staticPdfBytes = fs.readFileSync(staticPdfPath);
        const staticPdfDoc = await PDFDocument.load(staticPdfBytes);
        staticPageCount = staticPdfDoc.getPageCount();
        const staticIndices = staticPdfDoc.getPageIndices();
        
        for (const index of staticIndices) {
          const [copiedPage] = await mergedPdf.copyPages(staticPdfDoc, [index]);
          const { width, height } = copiedPage.getSize();
          
          const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
          
          if (!isA4) {
            console.log(`Normalizing static PDF page ${index + 1} from ${width.toFixed(2)}x${height.toFixed(2)} to A4`);
            await this.resizePageToA4(copiedPage);
          }
          
          mergedPdf.addPage(copiedPage);
        }
      }

      // ✅ Add headers and footers to all pages
      await this.addHeadersFootersToAllPages(mergedPdf, language);

      // ✅ Generate output filename
      const timestamp = Date.now();
      const finalFilename = path.basename(generatedPdfPath).replace('.pdf', `_merged_${timestamp}.pdf`);
      
      const outputDir = path.dirname(generatedPdfPath);
      const outputPath = path.join(outputDir, finalFilename);

      // ✅ Save merged PDF
      const mergedPdfBytes = await mergedPdf.save();
      fs.writeFileSync(outputPath, mergedPdfBytes);

      // ✅ Delete original generated PDF
      try {
        fs.unlinkSync(generatedPdfPath);
        console.log('✓ Original PDF deleted');
      } catch (err) {
        console.log('Could not delete original:', err.message);
      }

      // ✅ Return result with detailed page counts
      return {
        filepath: outputPath,
        filename: finalFilename,
        merged: true,
        pageCount: {
          generated: generatedPdf.getPageCount(),
          attachment: attachmentPageCount,
          static: staticPageCount,
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