// src/utils/pdf-generator-po.util.js - PURCHASE ORDER PDF GENERATOR WITH CUSTOM FILENAME SUPPORT
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class POPDFGenerator {
  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  // ✅ UPDATED: Language detection based on receiver field (المستلم)
  detectLanguage(poData) {
    // Priority 1: Check receiver field first (المستلم)
    if (poData.receiver && poData.receiver.trim() !== '') {
      return this.isArabic(poData.receiver) ? 'ar' : 'en';
    }

    // Priority 2: If no receiver, check other content fields
    const fieldsToCheck = [];
    
    if (poData.supplier) fieldsToCheck.push(poData.supplier);
    if (poData.supplierAddress) fieldsToCheck.push(poData.supplierAddress);
    if (poData.receiverCity) fieldsToCheck.push(poData.receiverCity);
    if (poData.receiverAddress) fieldsToCheck.push(poData.receiverAddress);
    if (poData.tableHeaderText) fieldsToCheck.push(poData.tableHeaderText);
    if (poData.notes) fieldsToCheck.push(poData.notes);

    if (poData.items && poData.items.length > 0) {
      poData.items.forEach(item => {
        if (item.description) fieldsToCheck.push(item.description);
        if (item.unit) fieldsToCheck.push(item.unit);
      });
    }

    // If no content fields at all, default to Arabic
    if (fieldsToCheck.length === 0) {
      return 'ar';
    }

    let arabicCount = 0;
    fieldsToCheck.forEach(field => {
      if (this.isArabic(field)) {
        arabicCount++;
      }
    });

    // Return language based on majority
    return arabicCount > (fieldsToCheck.length / 2) ? 'ar' : 'en';
  }

  // ✅ Supplier translation mapping
  getSupplierTranslation(supplierName, targetLanguage) {
    if (!supplierName) return '';

    const supplierMap = {
      // Add your supplier mappings here
      // Example:
      // 'شركة الأمل': { ar: 'شركة الأمل', en: 'Al Amal Company' },
      // 'Al Amal Company': { ar: 'شركة الأمل', en: 'Al Amal Company' },
    };

    // If supplier is in the map, return translated version
    if (supplierMap[supplierName]) {
      return supplierMap[supplierName][targetLanguage];
    }

    // If not in map, return as-is
    return supplierName;
  }

  getLabels(lang) {
    const labels = {
      ar: {
        title: 'طلب شراء',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        poNumber: 'رقم الطلب',
        date: 'تاريخ الإصدار',
        poNo: 'PO No',
        revNo: 'REV. No',
        supplierInfo: 'معلومات المورد',
        supplierName: 'اسم المورد',
        supplierAddress: 'عنوان المورد',
        supplierPhone: 'هاتف المورد',
        receiverInfo: 'معلومات المستلم',
        receiverName: 'اسم المستلم',
        receiverCity: 'مدينة المستلم',
        receiverAddress: 'عنوان المستلم',
        receiverPhone: 'هاتف المستلم',
        tableHeaderText: 'نص فوق الجدول',
        itemNo: '#',
        description: 'الوصف',
        unit: 'الوحدة',
        quantity: 'الكمية',
        unitPrice: 'سعر الوحدة',
        totalPrice: 'الإجمالي',
        subtotal: 'المجموع الفرعي',
        tax: 'ضريبة المبيعات',
        grandTotal: 'المبلغ الإجمالي',
        notes: 'ملاحظات',
        paymentDetails: 'تفاصيل الدفع',
        paymentCash: 'نقدي',
        paymentCheck: 'شيك',
        paymentAccountNumber: 'رقم الحساب',
        paymentName: 'الاسم',
        paymentTotalAmount: 'المبلغ الإجمالي',
        paymentCardNumber: 'رقم البطاقة',
        paymentExpiryDate: 'تاريخ الانتهاء',
        approvalSection: 'الموافقة',
        approvalDate: 'الموافقة',
        approvalTheDate: 'التاريخ',
        approvalActionNumber: 'رقم العمل',
        approvalSalesRep: 'مندوب المبيعات',
        approvalShippingStatus: 'الشحن عبر',
        approvedBy: 'موافق من قبل',
        purchaseManager: 'مدير المشتريات',
        productionManager: 'مدير الإنتاج',
        accountant: 'المحاسب',
        docCode: 'OMEGA-PUR-05',
        issueDate: 'DATE OF ISSUE'
      },
      en: {
        title: 'Purchase Order',
        companyNameAr: 'شركة أوميغا للصناعات الهندسية',
        companyNameEn: 'OMEGA ENGINEERING INDUSTRIES CO.',
        tagline: 'تصميم – تصنيع – تركيب',
        taglineEn: 'DESIGN - FABRICATION - INSTALLATION',
        country: 'JORDAN',
        tel: 'Tel: +96264161060 Fax: +96264162060',
        website: 'https://www.omega-jordan.com',
        poNumber: 'Order Number',
        date: 'Issue Date',
        poNo: 'PO No',
        revNo: 'REV. No',
        supplierInfo: 'Supplier Information',
        supplierName: 'Supplier Name',
        supplierAddress: 'Supplier Address',
        supplierPhone: 'Supplier Phone',
        receiverInfo: 'Receiver Information',
        receiverName: 'Receiver Name',
        receiverCity: 'Receiver City',
        receiverAddress: 'Receiver Address',
        receiverPhone: 'Receiver Phone',
        tableHeaderText: 'Table Header Text',
        itemNo: '#',
        description: 'Description',
        unit: 'Unit',
        quantity: 'Qty',
        unitPrice: 'Unit Price',
        totalPrice: 'Total',
        subtotal: 'Subtotal',
        tax: 'Sales Tax',
        grandTotal: 'Grand Total',
        notes: 'Notes',
        paymentDetails: 'Payment Details',
        paymentCash: 'Cash',
        paymentCheck: 'Check',
        paymentAccountNumber: 'Account Number',
        paymentName: 'Name',
        paymentTotalAmount: 'Total Amount',
        paymentCardNumber: 'Card Number',
        paymentExpiryDate: 'Expiry Date',
        approvalSection: 'Approval',
        approvalDate: 'Approval',
        approvalTheDate: 'Date',
        approvalActionNumber: 'Action Number',
        approvalSalesRep: 'Sales Representative',
        approvalShippingStatus: 'Shipping Via',
        approvedBy: 'Approved By',
        purchaseManager: 'Purchase Manager',
        productionManager: 'Production Manager',
        accountant: 'Accountant',
        docCode: 'OMEGA-PUR-05',
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

  // ✅ Helper: Check if supplier info section has data
  hasSupplierInfoData(po) {
    return this.hasData(po.supplier) ||
           this.hasData(po.supplierAddress) ||
           this.hasData(po.supplierPhone);
  }

  // ✅ Helper: Check if receiver info section has data
  hasReceiverInfoData(po) {
    return this.hasData(po.receiver) ||
           this.hasData(po.receiverCity) ||
           this.hasData(po.receiverAddress) ||
           this.hasData(po.receiverPhone);
  }

  calculateTotals(items, taxRate = 0) {
    if (!items || items.length === 0) {
      return { subtotal: 0, tax: 0, grandTotal: 0 };
    }
    
    let subtotal = 0;

    items.forEach(item => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      subtotal += qty * price;
    });

    const tax = (subtotal * taxRate) / 100;
    const grandTotal = subtotal + tax;

    return {
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      grandTotal: grandTotal.toFixed(2)
    };
  }

  generateHTML(po) {
    // ✅ UPDATED: Detect language based on receiver field
    const language = this.detectLanguage(po);
    const labels = this.getLabels(language);
    const isRTL = language === 'ar';
    const formattedDate = po.date || new Date().toISOString().split('T')[0];
    const totals = this.calculateTotals(po.items, po.taxRate || 0);

    // Translate supplier based on detected language
    const translatedSupplier = po.supplier
      ? this.getSupplierTranslation(po.supplier, language)
      : '';

    // ✅ Check what data exists
    const hasItems = this.hasItemsData(po.items);
    const hasSupplierInfo = this.hasSupplierInfoData(po);
    const hasReceiverInfo = this.hasReceiverInfoData(po);
    const hasTableHeaderText = this.hasData(po.tableHeaderText);
    const hasNotes = this.hasData(po.notes);
    const hasPONumber = this.hasData(po.poNumber);
    const hasDate = this.hasData(po.date);

    let itemsHTML = '';
    if (hasItems) {
      itemsHTML = po.items.map((item, index) => {
        // Only render row if at least one field has data
        const hasRowData = this.hasData(item.description) ||
                          this.hasData(item.unit) ||
                          this.hasData(item.quantity) ||
                          this.hasData(item.unitPrice);
        
        if (!hasRowData) return '';
        
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        const total = (qty * price).toFixed(2);
        
        return `
        <tr>
          <td style="text-align: center; padding: 10px 8px;">${index + 1}</td>
          <td style="text-align: ${isRTL ? 'right' : 'left'}; padding: 10px;">${item.description || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.unit || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.quantity || ''}</td>
          <td style="text-align: center; padding: 10px;">${item.unitPrice || ''}</td>
          <td style="text-align: center; padding: 10px;">${total}</td>
        </tr>
      `}).join('');
    }

    // ✅ Build supplier info fields conditionally with translation
    let supplierInfoFields = '';
    if (hasSupplierInfo) {
      const fields = [];
      
      if (this.hasData(translatedSupplier)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.supplierName}:</span>
            <span class="info-value">${translatedSupplier}</span>
          </div>
        `);
      }
      
      if (this.hasData(po.supplierAddress)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.supplierAddress}:</span>
            <span class="info-value">${po.supplierAddress}</span>
          </div>
        `);
      }
      
      if (this.hasData(po.supplierPhone)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.supplierPhone}:</span>
            <span class="info-value">${po.supplierPhone}</span>
          </div>
        `);
      }
      
      supplierInfoFields = fields.join('');
    }

    // ✅ Build receiver info fields conditionally
    let receiverInfoFields = '';
    if (hasReceiverInfo) {
      const fields = [];
      
      if (this.hasData(po.receiver)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.receiverName}:</span>
            <span class="info-value">${po.receiver}</span>
          </div>
        `);
      }
      
      if (this.hasData(po.receiverCity)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.receiverCity}:</span>
            <span class="info-value">${po.receiverCity}</span>
          </div>
        `);
      }
      
      if (this.hasData(po.receiverAddress)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.receiverAddress}:</span>
            <span class="info-value">${po.receiverAddress}</span>
          </div>
        `);
      }
      
      if (this.hasData(po.receiverPhone)) {
        fields.push(`
          <div class="info-field">
            <span class="info-label">${labels.receiverPhone}:</span>
            <span class="info-value">${po.receiverPhone}</span>
          </div>
        `);
      }
      
      receiverInfoFields = fields.join('');
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

.info-field {
  display: flex;
  gap: 10px;
  font-size: 12px;
  margin-bottom: 8px;
}

.info-label {
  font-weight: bold;
  min-width: 120px;
  color: #333;
}

.info-value {
  color: #555;
  flex: 1;
}

.table-header-notice {
  background-color: #FFF3CD;
  padding: 12px 15px;
  margin: 15px 0;
  border-radius: 4px;
  border-left: 4px solid #FFC107;
  break-inside: avoid;
  page-break-inside: avoid;
}

.table-header-notice p {
  margin: 0;
  font-size: 12px;
  color: #856404;
  line-height: 1.6;
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
  display: table-header-group;
}

.items-table th {
  padding: 10px 8px;
  text-align: center;
  font-weight: bold;
  border: 1px solid #2B4C8C;
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
  display: flex;
  justify-content: flex-end;
  break-inside: avoid;
  page-break-inside: avoid;
}

.totals-box {
  width: 50%;
  border: 2px solid #2B4C8C;
  background-color: #f9f9f9;
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 15px;
  border-bottom: 1px solid #ddd;
  font-size: 12px;
}

.total-row:last-child {
  border-bottom: none;
  background-color: #2B4C8C;
  color: white;
  font-weight: bold;
  font-size: 14px;
}

.total-label {
  font-weight: bold;
}

.total-value {
  text-align: ${isRTL ? 'left' : 'right'};
}

.two-column-sections {
  display: flex;
  gap: 15px;
  margin: 20px 0;
  break-inside: avoid;
  page-break-inside: avoid;
}

.payment-approval-section {
  flex: 1;
  background-color: #F8F9FA;
  padding: 15px;
  border-radius: 4px;
  border: 1px dashed #ADB5BD;
}

.section-title {
  font-weight: bold;
  color: #2B4C8C;
  margin-bottom: 12px;
  font-size: 14px;
  text-align: center;
  padding-bottom: 8px;
}

.section-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.grid-row {
  display: flex;
  gap: 10px;
}

.grid-item {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
}

.grid-item .field-label {
  font-weight: bold;
  color: #495057;
  white-space: nowrap;
}

.grid-item .field-value {
  color: #6C757D;
  text-align: ${isRTL ? 'left' : 'right'};
  min-width: 80px;
  border-bottom: 1px dashed #ADB5BD;
  padding-bottom: 2px;
  flex: 1;
  margin-${isRTL ? 'right' : 'left'}: 8px;
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

.approval-section {
  display: flex;
  justify-content: space-between;
  margin-top: 40px;
  gap: 15px;
  break-inside: avoid;
  page-break-inside: avoid;
}

.approval-box {
  text-align: center;
  width: 32%;
  font-size: 11px;
}

.approval-label {
  margin-bottom: 30px;
  font-weight: normal;
  color: #333;
}

.approval-line {
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

  <!-- ✅ Blue separator line -->
  <div class="separator-line"></div>

  <!-- ✅ Title after blue line -->
  <h1 class="title">${labels.title}</h1>

  <!-- ✅ Doc info - only show if data exists -->
  ${(hasPONumber || hasDate) ? `
  <div class="doc-info">
    ${hasPONumber ? `
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.poNo}:</span>
      <span>${po.poNumber}</span>
    </div>
    ` : ''}
    ${hasDate ? `
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.date}:</span>
      <span>${formattedDate}</span>
    </div>
    ` : ''}
    <div class="doc-info-item">
      <span class="doc-info-label">${labels.revNo}:</span>
      <span>01</span>
    </div>
  </div>
  ` : ''}

  <!-- ✅ Supplier info section - only show if data exists -->
  ${hasSupplierInfo ? `
  <div class="info-section">
    <div class="info-title">${labels.supplierInfo}</div>
    ${supplierInfoFields}
  </div>
  ` : ''}

  <!-- ✅ Receiver info section - only show if data exists -->
  ${hasReceiverInfo ? `
  <div class="info-section">
    <div class="info-title">${labels.receiverInfo}</div>
    ${receiverInfoFields}
  </div>
  ` : ''}

  <!-- ✅ Table header text - only show if data exists -->
  ${hasTableHeaderText ? `
  <div class="table-header-notice">
    <p>${po.tableHeaderText}</p>
  </div>
  ` : ''}

  <!-- ✅ Items table - only show if data exists -->
  ${hasItems ? `
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 6%;">${labels.itemNo}</th>
        <th style="width: 35%;">${labels.description}</th>
        <th style="width: 12%;">${labels.unit}</th>
        <th style="width: 12%;">${labels.quantity}</th>
        <th style="width: 15%;">${labels.unitPrice}</th>
        <th style="width: 20%;">${labels.totalPrice}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>

  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row">
        <span class="total-label">${labels.subtotal}:</span>
        <span class="total-value">${totals.subtotal}</span>
      </div>
      <div class="total-row">
        <span class="total-label">${labels.tax} (${po.taxRate || 0}%):</span>
        <span class="total-value">${totals.tax}</span>
      </div>
      <div class="total-row">
        <span class="total-label">${labels.grandTotal}:</span>
        <span class="total-value">${totals.grandTotal}</span>
      </div>
    </div>
  </div>
  ` : ''}

  <div class="two-column-sections">
    <div class="payment-approval-section">
      <div class="section-title">${labels.paymentDetails}</div>
      <div class="section-grid">
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.paymentCash}:</span>
            <span class="field-value">${po.paymentCash || ''}</span>
          </div>
          <div class="grid-item">
            <span class="field-label">${labels.paymentCheck}:</span>
            <span class="field-value">${po.paymentCheck || ''}</span>
          </div>
        </div>
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.paymentAccountNumber}:</span>
            <span class="field-value">${po.paymentAccountNumber || ''}</span>
          </div>
        </div>
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.paymentName}:</span>
            <span class="field-value">${po.paymentName || ''}</span>
          </div>
          <div class="grid-item">
            <span class="field-label">${labels.paymentTotalAmount}:</span>
            <span class="field-value">${po.paymentTotalAmount || totals.grandTotal}</span>
          </div>
        </div>
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.paymentCardNumber}:</span>
            <span class="field-value">${po.paymentCardNumber || ''}</span>
          </div>
        </div>
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.paymentExpiryDate}:</span>
            <span class="field-value">${po.paymentExpiryDate || ''}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="payment-approval-section">
      <div class="section-title">${labels.approvalSection}</div>
      <div class="section-grid">
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.approvalDate}:</span>
            <span class="field-value">${po.approvalDate || ''}</span>
          </div>
          <div class="grid-item">
            <span class="field-label">${labels.approvalTheDate}:</span>
            <span class="field-value">${po.approvalTheDate || ''}</span>
          </div>
        </div>
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.approvalActionNumber}:</span>
            <span class="field-value">${po.approvalActionNumber || ''}</span>
          </div>
        </div>
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.approvalSalesRep}:</span>
            <span class="field-value">${po.approvalSalesRep || ''}</span>
          </div>
        </div>
        <div class="grid-row">
          <div class="grid-item">
            <span class="field-label">${labels.approvalShippingStatus}:</span>
            <span class="field-value">${po.approvalShippingStatus || ''}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ✅ Notes section - only show if data exists -->
  ${hasNotes ? `
  <div class="notes-section">
    <div class="notes-content">${po.notes}</div>
  </div>
  ` : ''}

  <div class="approval-section">
    <div class="approval-box">
      <div class="approval-label">${labels.purchaseManager}</div>
      <div class="approval-line"></div>
    </div>
    <div class="approval-box">
      <div class="approval-label">${labels.productionManager}</div>
      <div class="approval-line"></div>
    </div>
    <div class="approval-box">
      <div class="approval-label">${labels.accountant}</div>
      <div class="approval-line"></div>
    </div>
  </div>

</div>

</body>
</html>
    `;
  }

  // ✅ UPDATED: Accept customFilename parameter
  async generatePOPDF(po, customFilename = null) {
    const language = this.detectLanguage(po);

    return new Promise(async (resolve, reject) => {
      let browser;
      
      try {
        const pdfDir = path.join(__dirname, '../../data/purchases/pdfs');
        if (!fs.existsSync(pdfDir)) {
          fs.mkdirSync(pdfDir, { recursive: true });
        }

        // ✅ Use custom filename if provided, otherwise use default pattern
        const filename = customFilename 
          ? `${customFilename}.pdf`
          : `${po.poNumber || 'po'}_${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);
        const html = this.generateHTML(po);

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
      const docCode = 'OMEGA-PUR-05';
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
          console.log(`Normalizing attachment page ${index + 1}`);
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
}

module.exports = new POPDFGenerator();