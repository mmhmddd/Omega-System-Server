const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class POPDFGenerator {
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

  isArabic(text) {
    if (!text) return false;
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }

  detectLanguage(poData) {
    if (poData.receiver && poData.receiver.trim() !== '') {
      return this.isArabic(poData.receiver) ? 'ar' : 'en';
    }

    const fieldsToCheck = [];
    if (poData.supplier)        fieldsToCheck.push(poData.supplier);
    if (poData.supplierAddress) fieldsToCheck.push(poData.supplierAddress);
    if (poData.receiverCity)    fieldsToCheck.push(poData.receiverCity);
    if (poData.receiverAddress) fieldsToCheck.push(poData.receiverAddress);
    if (poData.tableHeaderText) fieldsToCheck.push(poData.tableHeaderText);
    if (poData.notes)           fieldsToCheck.push(poData.notes);

    if (poData.items && poData.items.length > 0) {
      poData.items.forEach(item => {
        if (item.description) fieldsToCheck.push(item.description);
        if (item.unit)        fieldsToCheck.push(item.unit);
      });
    }

    if (fieldsToCheck.length === 0) return 'ar';

    let arabicCount = 0;
    fieldsToCheck.forEach(field => { if (this.isArabic(field)) arabicCount++; });
    return arabicCount > (fieldsToCheck.length / 2) ? 'ar' : 'en';
  }

  getSupplierTranslation(supplierName, targetLanguage) {
    if (!supplierName) return '';
    const supplierMap = {};
    if (supplierMap[supplierName]) return supplierMap[supplierName][targetLanguage];
    return supplierName;
  }

  getLabels(lang) {
    const labels = {
      ar: {
        title:        'طلب شراء',
        poNo:         'رقم طلب الشراء',
        issueDate:    'تاريخ الإصدار',
        revNo:        'رقم المراجعة',
        receiverInfo: 'معلومات المستلم',
        supplierInfo: 'معلومات المورد',
        rxName:  'الاسم',    rxCity:  'المدينة', rxAddr:  'العنوان', rxPhone:  'الهاتف',
        spName:  'الاسم',    spCity:  'المدينة', spAddr:  'العنوان', spPhone:  'الهاتف',
        note:         'ملاحظات: (اختياري)',
        itemNo:       '#',
        description:  'الوصف',
        unit:         'الوحدة',
        quantity:     'الكمية',
        unitPrice:    'سعر الوحدة',
        totalPrice:   'الإجمالي',
        payTitle:     'الدفع',
        cash:         'نقداً',
        check:        'شيك',
        apprTitle:    'الموافقة',
        approval:     'الموافقة',
        date:         'التاريخ',
        subtotal:     'المجموع',
        tax:          'الضريبة',
        grandTotal:   'الإجمالي',
        sig1:         'مدير المشتريات',
        sig2:         'مدير الإنتاج',
        sig3:         'المحاسب',
        docCode:      'OMEGA-PUR-05'
      },
      en: {
        title:        'Purchase Order',
        poNo:         'PO No',
        issueDate:    'Issue Date',
        revNo:        'Rev. No',
        receiverInfo: 'Receiver Information',
        supplierInfo: 'Supplier Information',
        rxName:  'Name',    rxCity:  'City', rxAddr:  'Address', rxPhone:  'Phone',
        spName:  'Name',    spCity:  'City', spAddr:  'Address', spPhone:  'Phone',
        note:         'Notes: (Optional)',
        itemNo:       '#',
        description:  'Description',
        unit:         'Unit',
        quantity:     'Qty',
        unitPrice:    'Unit Price',
        totalPrice:   'Total',
        payTitle:     'Payment',
        cash:         'Cash',
        check:        'Check',
        apprTitle:    'Approval',
        approval:     'Approval',
        date:         'Date',
        subtotal:     'Subtotal',
        tax:          'Tax',
        grandTotal:   'Grand Total',
        sig1:         'Purchase Manager',
        sig2:         'Production Manager',
        sig3:         'Accountant',
        docCode:      'OMEGA-PUR-05'
      }
    };
    return labels[lang] || labels.ar;
  }

  hasData(value) {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    return true;
  }

  hasItemsData(items) {
    if (!items || items.length === 0) return false;
    return items.some(item =>
      this.hasData(item.description) ||
      this.hasData(item.unit)        ||
      this.hasData(item.quantity)    ||
      this.hasData(item.unitPrice)
    );
  }

  hasSupplierInfoData(po) {
    return this.hasData(po.supplier) ||
           this.hasData(po.supplierAddress) ||
           this.hasData(po.supplierPhone);
  }

  hasReceiverInfoData(po) {
    return this.hasData(po.receiver) ||
           this.hasData(po.receiverCity) ||
           this.hasData(po.receiverAddress) ||
           this.hasData(po.receiverPhone);
  }

  calculateTotals(items, taxRate = 0) {
    if (!items || items.length === 0) return { subtotal: 0, tax: 0, grandTotal: 0 };
    let subtotal = 0;
    items.forEach(item => {
      subtotal += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0);
    });
    const tax        = (subtotal * taxRate) / 100;
    const grandTotal = subtotal + tax;
    return {
      subtotal:   subtotal.toFixed(2),
      tax:        tax.toFixed(2),
      grandTotal: grandTotal.toFixed(2)
    };
  }

  // ── Returns true only when taxRate is a positive number ──────────────────
  hasTax(po) {
    const rate = parseFloat(po.taxRate);
    return !isNaN(rate) && rate > 0;
  }

  generateHTML(po) {
    const language = this.detectLanguage(po);
    const labels   = this.getLabels(language);
    const isRTL    = language === 'ar';
    const dir      = isRTL ? 'rtl' : 'ltr';
    const formattedDate      = po.date || new Date().toISOString().split('T')[0];
    const totals             = this.calculateTotals(po.items, po.taxRate || 0);
    const translatedSupplier = po.supplier ? this.getSupplierTranslation(po.supplier, language) : '';

    // ── Key flag: show tax row only when taxRate > 0 ──────────────────────
    const showTax = this.hasTax(po);

    // HTML-escape helper
    const esc = v => String(v || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // ── Items rows ────────────────────────────────────────────────────────────
    const itemsHTML = (po.items || []).map((item, i) => {
      const hasRowData = this.hasData(item.description) || this.hasData(item.unit) ||
                         this.hasData(item.quantity)    || this.hasData(item.unitPrice);
      if (!hasRowData) return '';
      const qty   = parseFloat(item.quantity)  || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return `
        <tr>
          <td class="num">${i + 1}</td>
          <td class="desc" style="text-align:${isRTL ? 'right' : 'left'}">${esc(item.description)}</td>
          <td class="num">${esc(item.unit)}</td>
          <td class="qty">${esc(item.quantity)}</td>
          <td class="price">${esc(item.unitPrice)}</td>
          <td class="total">${(qty * price).toFixed(2)}</td>
        </tr>`;
    }).join('');

    // ── Party grid rows (only show filled fields) ─────────────────────────────
    const makeRows = fields => fields
      .filter(([, v]) => this.hasData(v))
      .map(([l, v]) => `<div class="label">${esc(l)}</div><div class="value">${esc(v)}</div>`)
      .join('');

    const rxRows = makeRows([
      [labels.rxName,  po.receiver],
      [labels.rxCity,  po.receiverCity],
      [labels.rxAddr,  po.receiverAddress],
      [labels.rxPhone, po.receiverPhone],
    ]);
    const spRows = makeRows([
      [labels.spName,  translatedSupplier],
      [labels.spCity,  po.supplierCity],
      [labels.spAddr,  po.supplierAddress],
      [labels.spPhone, po.supplierPhone],
    ]);

    const showPartyTable = this.hasReceiverInfoData(po) || this.hasSupplierInfoData(po);
    const hasItems       = this.hasItemsData(po.items);
    const hasNotes       = this.hasData(po.notes);

    // ── Grand total: when no tax, grand total equals subtotal exactly ────────
    const grandTotalDisplay = hasItems
      ? (showTax ? totals.grandTotal : totals.subtotal)
      : '—';

    return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="UTF-8">
<title>${labels.title} - OMEGA</title>
<style>
  :root {
    --ink:   #1b2a41;
    --muted: #6b7280;
    --line:  #d7dde5;
    --blue:  #1f4aa8;
    --pill:  #eef4ff;
    --warn:  #f6c74e;
    --warnbg:#fff8e8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, "Segoe UI", Tahoma, sans-serif; color: var(--ink); background: #fff; }

  /* PAGE */
  @page { size: A4; margin: 35mm 20mm 25mm 20mm; }
  .page { width: 100%; background: #fff; }

  /* ── COMPANY HEADER ──────────────────────────────────────────────────── */
  .company-info { padding: 5px 0 10px; margin-bottom: 10px; }
  .company-row  { display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; }
  .company-col  { width: 48%; font-size: 12px; line-height: 1.6; }
  .company-col-right { text-align: right; direction: rtl; }
  .company-col-left  { text-align: left;  direction: ltr; }
  .company-col p { margin: 4px 0; }

  /* ── SEPARATOR ───────────────────────────────────────────────────────── */
  .separator-line {
    width: 100%;
    height: 3px;
    background: #2B4C8C;
    margin: 10px 0 14px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── TITLE BAR ───────────────────────────────────────────────────────── */
  .titlebar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    width: 100%;
  }
  .po-meta { font-size: 11px; color: var(--muted); line-height: 1.6; flex-shrink: 0; }
  .po-meta strong { color: var(--ink); }
  .doc-title {
    text-align: center;
    font-weight: 900;
    color: var(--blue);
    font-size: 22px;
    letter-spacing: .3px;
    line-height: 1.1;
    white-space: nowrap;
    flex: 1;
  }

  /* ── PARTY TABLE ─────────────────────────────────────────────────────── */
  .party {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    margin: 8px 0 10px;
    border-collapse: separate;
    border-spacing: 0;
  }
  .party thead th {
    background: var(--pill);
    padding: 8px 10px;
    font-size: 12px;
    border-bottom: 1px solid var(--line);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .party tbody td {
    padding: 6px 10px;
    vertical-align: top;
    font-size: 11.5px;
    width: 50%;
  }
  .party .grid {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 6px 10px;
    align-items: center;
  }
  .label { color: var(--muted); font-size: 11px; }
  .value { border-bottom: 1px dotted var(--line); padding-bottom: 2px; min-height: 14px; }

  /* ── NOTES ───────────────────────────────────────────────────────────── */
  .note {
    margin: 8px 0 10px;
    border-left: 5px solid var(--warn);
    background: var(--warnbg);
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11.5px;
    color: #5b4b1b;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── ITEMS TABLE ─────────────────────────────────────────────────────── */
  .items {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 10px;
  }
  .items thead { display: table-header-group; }
  .items thead th {
    background: var(--blue);
    color: #fff;
    padding: 7px 8px;
    font-size: 11px;
    white-space: nowrap;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .items tbody td { border-top: 1px solid var(--line); padding: 5px 8px; font-size: 11px; vertical-align: top; }
  .items tr { page-break-inside: avoid; }
  .num, .qty, .price, .total { text-align: center; white-space: nowrap; }
  .desc { width: 100%; }

  /* ── FOOTER GRID ─────────────────────────────────────────────────────── */
  .footer-grid {
    display: grid;
    grid-template-columns: 1.2fr 1.2fr 1fr;
    gap: 10px;
    align-items: stretch;
    margin-top: 6px;
    page-break-inside: avoid;
  }
  .box { border: 1px solid var(--line); border-radius: 10px; padding: 10px; font-size: 11.5px; }
  .box h4 { margin: 0 0 8px; font-size: 12px; color: var(--blue); }
  .frow { display: grid; grid-template-columns: 88px 1fr; gap: 8px; align-items: center; margin-bottom: 6px; }
  .frow:last-child { margin-bottom: 0; }
  .fline { border-bottom: 1px dotted var(--line); height: 14px; font-size: 11px; padding-bottom: 2px; }

  /* ── TOTALS ──────────────────────────────────────────────────────────── */
  .totals { border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }
  .trow { display: flex; justify-content: space-between; gap: 10px; padding: 8px 10px; font-size: 11.5px; border-top: 1px solid var(--line); }
  .trow:first-child { border-top: 0; }
  .grand {
    background: var(--blue);
    color: #fff;
    font-weight: 900;
    font-size: 12px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── SIGNATURES ──────────────────────────────────────────────────────── */
  .sigs {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 18px;
    margin-top: 14px;
    font-size: 11px;
    color: var(--muted);
    page-break-inside: avoid;
  }
  .sig { text-align: center; }
  .sig .sline { border-bottom: 1px dotted var(--line); height: 16px; margin-top: 20px; }

  /* ── PRINT ───────────────────────────────────────────────────────────── */
  @media print {
    .page { margin: 0; padding: 0; width: auto; }
    .party, .items, .totals, .footer-grid { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- ══ COMPANY HEADER ═══════════════════════════════════════════════════ -->
  <div class="company-info">
    <div class="company-row">
      ${isRTL ? `
      <div class="company-col company-col-right">
        <p><strong>شركة أوميغا للصناعات الهندسية</strong></p>
        <p>تصميم – تصنيع – تركيب</p>
        <p>المملكة الأردنية الهاشمية</p>
        <p>تلفون: 96264161060+ | فاكس: 96264162060+</p>
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
        <p>تلفون: 96264161060+ | فاكس: 96264162060+</p>
      </div>
      `}
    </div>
  </div>

  <!-- ══ BLUE SEPARATOR ═══════════════════════════════════════════════════ -->
  <div class="separator-line"></div>

  <!-- ══ TITLE BAR ════════════════════════════════════════════════════════ -->
  <div class="titlebar">

    <!-- أقصى اليسار -->
    ${isRTL ? `
    <div class="po-meta" style="text-align: left; direction: ltr;">
      ${this.hasData(po.date) ? `<div>${labels.issueDate}: <strong>${esc(formattedDate)}</strong></div>` : ''}
      <div>${labels.revNo}: <strong>01</strong></div>
    </div>
    ` : `
    <div class="po-meta" style="text-align: left; direction: ltr;">
      ${this.hasData(po.poNumber) ? `<div>${labels.poNo}: <strong>${esc(po.poNumber)}</strong></div>` : ''}
    </div>
    `}

    <!-- وسط: العنوان فقط -->
    <div class="doc-title">
      ${esc(labels.title)}
    </div>

    <!-- أقصى اليمين -->
    ${isRTL ? `
    <div class="po-meta" style="text-align: right; direction: rtl;">
      ${this.hasData(po.poNumber) ? `<div>${labels.poNo}: <strong>${esc(po.poNumber)}</strong></div>` : ''}
    </div>
    ` : `
    <div class="po-meta" style="text-align: right; direction: ltr;">
      ${this.hasData(po.date) ? `<div>${labels.issueDate}: <strong>${esc(formattedDate)}</strong></div>` : ''}
      <div>${labels.revNo}: <strong>01</strong></div>
    </div>
    `}

  </div>

  <!-- ══ SUPPLIER / RECEIVER PARTY TABLE ══════════════════════════════════ -->
  ${showPartyTable ? `
  <table class="party">
    <thead>
      <tr>
        <th style="text-align:${isRTL ? 'right' : 'left'}; direction:${dir}">${labels.receiverInfo}</th>
        <th style="text-align:${isRTL ? 'left'  : 'right'}; direction:${dir}">${labels.supplierInfo}</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="grid" style="direction:${dir}; text-align:${isRTL ? 'right' : 'left'}">
            ${rxRows}
          </div>
        </td>
        <td>
          <div class="grid" style="direction:${dir}; text-align:${isRTL ? 'right' : 'left'}">
            ${spRows}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
  ` : ''}

  <!-- ══ NOTES ════════════════════════════════════════════════════════════ -->
  ${hasNotes ? `<div class="note" dir="${dir}">${esc(po.notes)}</div>` : ''}

  <!-- ══ ITEMS TABLE ══════════════════════════════════════════════════════ -->
  ${hasItems ? `
  <table class="items">
    <thead>
      <tr>
        <th style="width:34px">${labels.itemNo}</th>
        <th>${labels.description}</th>
        <th style="width:70px">${labels.unit}</th>
        <th style="width:60px">${labels.quantity}</th>
        <th style="width:80px">${labels.unitPrice}</th>
        <th style="width:85px">${labels.totalPrice}</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHTML}
    </tbody>
  </table>
  ` : ''}

  <!-- ══ FOOTER: PAYMENT + APPROVAL + TOTALS ══════════════════════════════ -->
  <div class="footer-grid">

    <!-- Payment -->
    <div class="box">
      <h4>${labels.payTitle}</h4>
      <div class="frow">
        <div class="label">${labels.cash}</div>
        <div class="fline">${esc(po.paymentCash)}</div>
      </div>
      <div class="frow">
        <div class="label">${labels.check}</div>
        <div class="fline">${esc(po.paymentCheck)}</div>
      </div>
    </div>

    <!-- Approval -->
    <div class="box">
      <h4>${labels.apprTitle}</h4>
      <div class="frow">
        <div class="label">${labels.approval}</div>
        <div class="fline">${esc(po.approvalDate)}</div>
      </div>
      <div class="frow">
        <div class="label">${labels.date}</div>
        <div class="fline">${esc(po.approvalTheDate)}</div>
      </div>
    </div>

    <!-- ══ TOTALS ══════════════════════════════════════════════════════════
         • Tax row is HIDDEN when taxRate = 0 or not provided
         • Grand Total equals Subtotal when there is no tax
    ═════════════════════════════════════════════════════════════════════ -->
    <div class="totals">

      <!-- Subtotal row: always shown -->
      <div class="trow">
        <span>${labels.subtotal}</span>
        <strong>${hasItems ? totals.subtotal : '—'}</strong>
      </div>

      <!-- Tax row: only shown when taxRate > 0 -->
      ${showTax ? `
      <div class="trow">
        <span>${labels.tax} (${po.taxRate}%)</span>
        <strong>${hasItems ? totals.tax : '—'}</strong>
      </div>
      ` : ''}

      <!-- Grand Total row: always shown -->
      <div class="trow grand">
        <span>${labels.grandTotal}</span>
        <strong>${grandTotalDisplay}</strong>
      </div>

    </div>

  </div><!-- /footer-grid -->

  <!-- ══ SIGNATURES ═══════════════════════════════════════════════════════ -->
  <div class="sigs">
    <div class="sig"><span>${labels.sig1}</span><div class="sline"></div></div>
    <div class="sig"><span>${labels.sig2}</span><div class="sline"></div></div>
    <div class="sig"><span>${labels.sig3}</span><div class="sline"></div></div>
  </div>

</div><!-- /page -->
</body>
</html>`;
  }

  generateTermsHTML(termsText, language = 'ar') {
    console.log('🔨 Generating Purchase Order Terms HTML...');
    console.log('   Language:', language);
    console.log('   Text length:', termsText?.length || 0);

    const isRTL = language === 'ar';

    const escapeHtml = (text) => text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

    const formattedText = escapeHtml(termsText).replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html lang="${language}" dir="${isRTL ? 'rtl' : 'ltr'}">
<head>
<meta charset="UTF-8">
<title>${language === 'ar' ? 'الشروط والأحكام' : 'Terms and Conditions'} - OMEGA</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
body { background: #fff; }
@page { size: A4; margin: 35mm 20mm 25mm 20mm; }
.page-content  { width: 100%; background: #fff; }
.company-info  { padding: 5px 0 10px; margin-bottom: 10px; }
.company-row   { display: flex; justify-content: space-between; align-items: flex-start; gap: 30px; }
.company-col   { width: 48%; font-size: 12px; line-height: 1.6; }
.company-col-right { text-align: right; direction: rtl; }
.company-col-left  { text-align: left;  direction: ltr; }
.company-col p { margin: 4px 0; }
.separator-line {
  width: 100%; height: 3px; background: #2B4C8C; margin: 10px 0 20px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.title { text-align: center; margin: 0 0 25px; font-size: 24px; color: #2B4C8C; font-weight: bold; }
.terms-content {
  padding: 20px 0;
  font-size: 12px;
  line-height: 1.8;
  color: #333;
  white-space: pre-wrap;
  word-wrap: break-word;
  text-align: ${isRTL ? 'right' : 'left'};
}
</style>
</head>
<body>
<div class="page-content">
    <h1 class="title">${language === 'ar' ? 'الشروط والأحكام' : 'Terms and Conditions'}</h1>
  <div class="terms-content">${formattedText}</div>
</div>
</body>
</html>`;
  }

  async addTermsAndConditionsPage(existingPdfPath, termsText, language = 'ar') {
    let browser;
    try {
      console.log('╔══════════════════════════════════════════════════════════╗');
      console.log('║       ADDING PO TERMS & CONDITIONS PAGE                  ║');
      console.log('╚══════════════════════════════════════════════════════════╝');
      console.log('📄 Existing PDF:', existingPdfPath);
      console.log('📄 Terms Text Length:', termsText?.length || 0);
      console.log('📄 Language:', language);

      const termsHTML     = this.generateTermsHTML(termsText, language);
      const tempTermsPath = existingPdfPath.replace('.pdf', '_terms_temp.pdf');

      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      const page = await browser.newPage();
      await page.setContent(termsHTML, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.pdf({
        path: tempTermsPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        preferCSSPageSize: true
      });
      await browser.close();
      browser = null;

      const existingPdfBytes = fs.readFileSync(existingPdfPath);
      const termsPdfBytes    = fs.readFileSync(tempTermsPath);
      const existingPdf      = await PDFDocument.load(existingPdfBytes);
      const termsPdf         = await PDFDocument.load(termsPdfBytes);
      const mergedPdf        = await PDFDocument.create();

      console.log('   - Existing PDF pages:', existingPdf.getPageCount());
      console.log('   - Terms PDF pages:',    termsPdf.getPageCount());

      const existingPages = await mergedPdf.copyPages(existingPdf, existingPdf.getPageIndices());
      existingPages.forEach(p => mergedPdf.addPage(p));
      const termsPages = await mergedPdf.copyPages(termsPdf, termsPdf.getPageIndices());
      termsPages.forEach(p => mergedPdf.addPage(p));

      fs.writeFileSync(existingPdfPath, await mergedPdf.save());
      fs.unlinkSync(tempTermsPath);

      console.log('✅ TERMS & CONDITIONS PAGE ADDED SUCCESSFULLY');
      console.log('   Total pages in merged PDF:', mergedPdf.getPageCount());
      console.log('════════════════════════════════════════════════════════════\n');
    } catch (error) {
      if (browser) await browser.close();
      console.error('❌ Error adding Terms & Conditions page:', error);
      throw error;
    }
  }

  async generatePOPDF(po, customFilename = null, termsAndConditionsText = null, includeTermsAndConditions = false) {
    const language = this.detectLanguage(po);

    return new Promise(async (resolve, reject) => {
      let browser;
      try {
        const pdfDir = path.join(__dirname, '../../data/purchases/pdfs');
        if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

        const filename = customFilename
          ? `${customFilename}.pdf`
          : `${po.poNumber || 'po'}_${Date.now()}.pdf`;
        const filepath = path.join(pdfDir, filename);

        console.log('╔══════════════════════════════════════════════════════════╗');
        console.log('║       GENERATING PURCHASE ORDER PDF                      ║');
        console.log('╚══════════════════════════════════════════════════════════╝');
        console.log('📄 Filename:', filename);
        console.log('📄 Language:', language);
        console.log('📄 Include T&C:', includeTermsAndConditions);
        console.log('📄 Tax Rate:', po.taxRate, '| Show Tax Row:', this.hasTax(po));

        let finalTermsText = null;
        if (includeTermsAndConditions) {
          if (termsAndConditionsText && termsAndConditionsText.trim()) {
            finalTermsText = termsAndConditionsText;
            console.log('📄 Using custom T&C text');
          } else {
            finalTermsText = language === 'ar' ? this.DEFAULT_TERMS_AR : this.DEFAULT_TERMS_EN;
            console.log('📄 Using default T&C for language:', language);
          }
        }
        console.log('════════════════════════════════════════════════════════════');

        const html = this.generateHTML(po);

        browser = await puppeteer.launch({
          headless: 'new',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.pdf({
          path: filepath,
          format: 'A4',
          printBackground: true,
          margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
          preferCSSPageSize: true
        });
        await browser.close();
        browser = null;

        if (finalTermsText && finalTermsText.trim()) {
          console.log('📄 Adding Terms & Conditions page...');
          await this.addTermsAndConditionsPage(filepath, finalTermsText, language);
          console.log('✅ Terms & Conditions page added');
        }

        console.log('✅ PDF generation complete\n');
        resolve({
          filename,
          filepath,
          language,
          success: true,
          hasTermsAndConditions: !!(finalTermsText && finalTermsText.trim())
        });
      } catch (error) {
        if (browser) await browser.close();
        reject({ success: false, error: error.message, stack: error.stack });
      }
    });
  }

  getA4Dimensions() {
    return { width: 595.28, height: 841.89 };
  }

  async resizePageToA4(page) {
    const a4 = this.getA4Dimensions();
    const { width, height } = page.getSize();
    const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
    if (isA4) return page;
    const scale = Math.min(a4.width / width, a4.height / height, 1);
    page.setSize(a4.width, a4.height);
    if (scale < 1) {
      page.scaleContent(scale, scale);
      page.translateContent(
        (a4.width  - width  * scale) / 2,
        (a4.height - height * scale) / 2
      );
    }
    return page;
  }

  async addHeadersFootersToAllPages(pdfDoc, language = 'ar') {
    const pages      = pdfDoc.getPages();
    const totalPages = pages.length;
    const font       = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const isRTL      = language === 'ar';
    const a4         = this.getA4Dimensions();

    const primaryBlue = rgb(0.169, 0.298, 0.549);
    const textGray    = rgb(0.333, 0.333, 0.333);
    const lightGray   = rgb(0.8, 0.8, 0.8);
    const white       = rgb(1, 1, 1);

    let logoImage = null;
    try {
      const logoPath = path.join(__dirname, '../../assets/images/OmegaLogo.png');
      if (fs.existsSync(logoPath)) {
        logoImage = await pdfDoc.embedPng(fs.readFileSync(logoPath));
      }
    } catch (error) { console.log('Logo not found'); }

    for (let i = 0; i < totalPages; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      const isA4 = Math.abs(width - a4.width) < 1 && Math.abs(height - a4.height) < 1;
      if (!isA4) {
        console.log(`Page ${i + 1} is not A4, skipping header/footer`);
        continue;
      }

      const dateOfIssue = `DATE OF ISSUE: ${new Date().toISOString().split('T')[0]}`;
      const docCode     = 'OMEGA-PUR-05';
      const pageNumber  = `Page ${i + 1} of ${totalPages}`;

      if (i > 0) {
        page.drawRectangle({ x: 0, y: height - 100, width, height: 100, color: white });
      }

      if (logoImage) {
        page.drawImage(logoImage, {
          x:      isRTL ? 60 : width - 140,
          y:      height - 70,
          width:  80,
          height: 50
        });
      }

      page.drawLine({
        start: { x: 50,         y: height - 90 },
        end:   { x: width - 50, y: height - 90 },
        thickness: 2,
        color: primaryBlue
      });

      page.drawText(dateOfIssue, {
        x:    isRTL ? width - 200 : 60,
        y:    height - 63,
        size: 9,
        font,
        color: textGray
      });

      page.drawLine({
        start: { x: 50,         y: 50 },
        end:   { x: width - 50, y: 50 },
        thickness: 1,
        color: lightGray
      });

      if (isRTL) {
        page.drawText(docCode,    { x: width - 150, y: 35, size: 9, font, color: textGray });
        page.drawText(pageNumber, { x: 60,          y: 35, size: 9, font, color: textGray });
      } else {
        page.drawText(pageNumber, { x: 60,          y: 35, size: 9, font, color: textGray });
        page.drawText(docCode,    { x: width - 150, y: 35, size: 9, font, color: textGray });
      }
    }
    return pdfDoc;
  }

  async mergePDFs(generatedPdfPath, attachmentPdf = null, outputFilename = null, language = 'ar') {
    try {
      if (!attachmentPdf) {
        const pdfBytes = fs.readFileSync(generatedPdfPath);
        const pdfDoc   = await PDFDocument.load(pdfBytes);
        await this.addHeadersFootersToAllPages(pdfDoc, language);
        fs.writeFileSync(generatedPdfPath, await pdfDoc.save());
        return {
          filepath:  generatedPdfPath,
          filename:  path.basename(generatedPdfPath),
          merged:    false,
          pageCount: { total: pdfDoc.getPageCount() }
        };
      }

      const generatedPdfBytes  = fs.readFileSync(generatedPdfPath);
      const generatedPdf       = await PDFDocument.load(generatedPdfBytes);
      const attachmentPdfBytes = Buffer.isBuffer(attachmentPdf)
        ? attachmentPdf
        : fs.readFileSync(attachmentPdf);
      const attachmentPdfDoc   = await PDFDocument.load(attachmentPdfBytes);
      const mergedPdf          = await PDFDocument.create();
      const a4                 = this.getA4Dimensions();

      const genPages = await mergedPdf.copyPages(generatedPdf, generatedPdf.getPageIndices());
      genPages.forEach(p => mergedPdf.addPage(p));

      for (const index of attachmentPdfDoc.getPageIndices()) {
        const [copiedPage] = await mergedPdf.copyPages(attachmentPdfDoc, [index]);
        const { width, height } = copiedPage.getSize();
        if (Math.abs(width - a4.width) >= 1 || Math.abs(height - a4.height) >= 1) {
          await this.resizePageToA4(copiedPage);
        }
        mergedPdf.addPage(copiedPage);
      }

      await this.addHeadersFootersToAllPages(mergedPdf, language);

      const finalFilename = outputFilename ||
        path.basename(generatedPdfPath).replace('.pdf', `_merged_${Date.now()}.pdf`);
      const outputPath = path.join(path.dirname(generatedPdfPath), finalFilename);
      fs.writeFileSync(outputPath, await mergedPdf.save());

      try { fs.unlinkSync(generatedPdfPath); } catch (err) { console.log('Could not delete original:', err.message); }

      return {
        filepath:  outputPath,
        filename:  finalFilename,
        merged:    true,
        pageCount: {
          generated:  generatedPdf.getPageCount(),
          attachment: attachmentPdfDoc.getPageCount(),
          total:      mergedPdf.getPageCount()
        }
      };
    } catch (error) {
      throw new Error(`PDF merge failed: ${error.message}`);
    }
  }

  async isValidPDF(pdfData) {
    try {
      const pdfBytes = Buffer.isBuffer(pdfData) ? pdfData : fs.readFileSync(pdfData);
      await PDFDocument.load(pdfBytes);
      return true;
    } catch { return false; }
  }
}

module.exports = new POPDFGenerator();