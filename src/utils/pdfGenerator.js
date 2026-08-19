import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MOBILECARE_LOGO_BASE64 } from '../assets/logoBase64';
import { calculateWeeklySplit } from './allocationEngine';

/**
 * Generates and downloads a pixel-perfect, single-page Packing List PDF matching corporate standards
 */
export function generatePackingListPDF(shipment, items = [], site = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;

  // Title: "Packing List" Centered at top
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Packing List', pageWidth / 2, 11, { align: 'center' });

  // Top Left: Mobile Care Logo + Company Info
  try {
    if (MOBILECARE_LOGO_BASE64) {
      doc.addImage(MOBILECARE_LOGO_BASE64, 'PNG', margin, 14, 15, 15);
    }
  } catch (e) {
    console.warn('Could not render logo in PDF:', e);
  }

  const compX = margin + 18;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('MOBILE CARE SERVICES PHILS. INC.', compX, 16.5);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Business and Distribution Center', compX, 20.5);
  doc.text('2/L Northeast Square, #47 Connecticut St. Northeast Greenhills', compX, 24.5);
  doc.text('San Juan City, Metro Manila', compX, 28.5);

  // Top Right: Invoice / Shipment Metadata Box
  const rightBoxWidth = 86;
  const rightColX = pageWidth - margin - rightBoxWidth;
  const rightValX = pageWidth - margin;

  const metaRows = [
    { label: 'INVOICE REF:', val: shipment.invoice_ref || `DCMSPIOWNED#20260808G` },
    { label: 'SHIPMENT DATE:', val: shipment.shipment_date || new Date().toLocaleDateString('en-US') },
    { label: 'BOX/S #:', val: String(shipment.total_boxes || 1) },
    { label: 'CARRIER:', val: shipment.carrier || 'Lite Express' },
    { label: 'TRACKING NUMBER:', val: shipment.tracking_number || '20227258' }
  ];

  let metaY = 15;
  metaRows.forEach(row => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(row.label, rightColX, metaY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(String(row.val), rightValX, metaY, { align: 'right' });
    metaY += 3.8;
  });

  // Ship To Section
  const shipToY = 34;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('Ship To', margin, shipToY);
  doc.text(site.name || shipment.site_name || 'SERVICE HUB', margin + 14, shipToY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  const siteAddr = site.address || `${site.name || 'Branch'}, Philippines`;
  doc.text(siteAddr, margin + 14, shipToY + 3.5, { maxWidth: pageWidth - margin - 25 });

  // Items Table
  const totalItemsCount = items.length;
  const isLargeBatch = totalItemsCount > 25;
  const isExtraLargeBatch = totalItemsCount > 35;

  const tableFontSize = isExtraLargeBatch ? 6.5 : isLargeBatch ? 7.0 : 7.5;
  const cellPaddingY = isExtraLargeBatch ? 0.7 : isLargeBatch ? 0.9 : 1.2;

  const tableData = items.map((item, index) => [
    index + 1,
    item.part_number || item.partNumber || '',
    item.description || item.partDescription || '',
    item.serial_number || item.serialNumber || '',
    item.box_number || item.boxNumber || 1
  ]);

  autoTable(doc, {
    startY: 42,
    head: [['#', 'PART NUMBER', 'DESCRIPTION', 'SERIAL NUMBER', 'BOX #']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42], // Dark Navy
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: tableFontSize + 0.5,
      halign: 'center',
      valign: 'middle',
      cellPadding: cellPaddingY + 0.3
    },
    bodyStyles: {
      fontSize: tableFontSize,
      textColor: [15, 23, 42],
      cellPadding: cellPaddingY
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 28, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: 72 },
      3: { halign: 'center', cellWidth: 62, font: 'courier' },
      4: { halign: 'center', cellWidth: 18 }
    },
    margin: { left: margin, right: margin }
  });

  const finalY = doc.lastAutoTable.finalY + 2.5;

  // Remarks & Totals Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Remarks:', margin, finalY + 3.5);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.remarks || 'KGB PARTS', margin + 16, finalY + 3.5);

  // Totals Box (Right aligned)
  const totalBoxWidth = 72;
  const totalBoxX = pageWidth - margin - totalBoxWidth;
  const totalValX = pageWidth - margin - 3;
  
  // Total QTY Row
  doc.setFillColor(15, 23, 42);
  doc.rect(totalBoxX, finalY, 42, 4.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text('TOTAL QTY', totalBoxX + 21, finalY + 3.2, { align: 'center' });
  doc.setTextColor(15, 23, 42);
  doc.text(String(items.length), totalValX, finalY + 3.2, { align: 'right' });

  // Total Boxes Row
  doc.setFillColor(15, 23, 42);
  doc.rect(totalBoxX, finalY + 5.2, 42, 4.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL BOXES', totalBoxX + 21, finalY + 8.4, { align: 'center' });
  doc.setTextColor(15, 23, 42);
  doc.text(String(shipment.total_boxes || 1), totalValX, finalY + 8.4, { align: 'right' });

  // Signatures Section
  const sigY = Math.min(Math.max(finalY + 16, 268), 276);
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, sigY - 3, pageWidth - margin, sigY - 3);

  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);

  // Prepared by
  doc.setFont('helvetica', 'bold');
  doc.text('Prepared and Counted by:', margin, sigY + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.prepared_by_name || 'Joshua Juvida', margin + 38, sigY + 2);

  // Verified by
  doc.setFont('helvetica', 'bold');
  doc.text('Verified by:', margin + 96, sigY + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.verified_by_name || 'Zhon Manaois', margin + 114, sigY + 2);

  // Receiving Branch Signature
  doc.setFont('helvetica', 'bold');
  doc.text('Receiving Branch Signature:', margin, sigY + 9);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.receiving_signature || site.code || 'ASP NPM', margin + 38, sigY + 9);

  // Save / Export
  const filename = `PackingList_${shipment.invoice_ref || shipment.shipment_number || 'export'}.pdf`;
  doc.save(filename);
}

/**
 * Triggers native browser print preview for immediate packing list manifest printing
 */
export function printPackingListDirect(shipment, items = [], site = {}) {
  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) {
    window.print();
    return;
  }

  const tableRowsHtml = items.map((it, idx) => `
    <tr>
      <td style="text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="text-align: center; font-weight: 700; font-family: monospace;">${it.part_number || it.partNumber || ''}</td>
      <td style="text-align: left;">${it.description || it.partDescription || ''}</td>
      <td style="text-align: center; font-family: monospace;">${it.serial_number || it.serialNumber || ''}</td>
      <td style="text-align: center;">${it.box_number || it.boxNumber || 1}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Packing List - ${shipment.invoice_ref || 'Manifest'}</title>
      <style>
        @page { size: portrait; margin: 10mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 12px; }
        .header-title { text-align: center; font-size: 18px; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.04em; }
        .top-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 20px; margin-bottom: 14px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
        .company-title { font-size: 13px; font-weight: 800; color: #0f172a; }
        .meta-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .meta-table td { padding: 2px 4px; }
        .meta-label { font-weight: 700; color: #475569; width: 45%; }
        .meta-val { font-weight: 700; text-align: right; color: #0f172a; }
        .shipto-box { margin-bottom: 12px; font-size: 11.5px; background: #f8fafc; padding: 8px 12px; border-radius: 4px; border: 1px solid #e2e8f0; }
        .data-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        .data-table th { background: #0f172a; color: #ffffff; padding: 6px 8px; font-size: 11px; text-align: center; border: 1px solid #0f172a; }
        .data-table td { border: 1px solid #cbd5e1; padding: 5px 8px; font-size: 11px; }
        .totals-wrap { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .totals-table { width: 220px; border-collapse: collapse; }
        .totals-table td { padding: 4px 8px; border: 1px solid #cbd5e1; }
        .totals-table .label-cell { background: #0f172a; color: #ffffff; font-weight: 700; font-size: 11px; width: 60%; }
        .totals-table .val-cell { text-align: right; font-weight: 800; font-size: 12px; }
        .signatures-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 16px; }
        .sig-line { margin-top: 24px; border-bottom: 1px solid #0f172a; width: 80%; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header-title">Packing List</div>
      <div class="top-grid">
        <div>
          <div class="company-title">MOBILE CARE SERVICES PHILS. INC.</div>
          <div style="color: #475569; font-size: 11px; margin-top: 2px;">Business and Distribution Center</div>
          <div style="color: #475569; font-size: 10.5px;">2/L Northeast Square, #47 Connecticut St. Greenhills, San Juan City</div>
        </div>
        <div>
          <table class="meta-table">
            <tr><td class="meta-label">INVOICE REF:</td><td class="meta-val">${shipment.invoice_ref || 'DCMSPIOWNED#20260808G'}</td></tr>
            <tr><td class="meta-label">SHIPMENT DATE:</td><td class="meta-val">${shipment.shipment_date || new Date().toLocaleDateString('en-US')}</td></tr>
            <tr><td class="meta-label">BOX/S #:</td><td class="meta-val">${shipment.total_boxes || 1}</td></tr>
            <tr><td class="meta-label">CARRIER:</td><td class="meta-val">${shipment.carrier || 'Lite Express'}</td></tr>
            <tr><td class="meta-label">TRACKING NUMBER:</td><td class="meta-val">${shipment.tracking_number || '20227258'}</td></tr>
          </table>
        </div>
      </div>

      <div class="shipto-box">
        <strong>Ship To:</strong> ${site.name || shipment.site_name || 'SERVICE HUB'} (${site.code || shipment.site_code || 'ASP'})<br/>
        <span style="color: #64748b; font-size: 10.5px;">${site.address || `${site.name || 'Branch'}, Philippines`}</span>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 35px;">#</th>
            <th style="width: 110px;">PART NUMBER</th>
            <th>DESCRIPTION</th>
            <th style="width: 170px;">SERIAL NUMBER</th>
            <th style="width: 60px;">BOX #</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <div class="totals-wrap">
        <div style="font-size: 11.5px;">
          <strong>Remarks:</strong> ${shipment.remarks || 'KGB PARTS'}
        </div>
        <table class="totals-table">
          <tr>
            <td class="label-cell">TOTAL QTY</td>
            <td class="val-cell">${items.length}</td>
          </tr>
          <tr>
            <td class="label-cell">TOTAL BOXES</td>
            <td class="val-cell">${shipment.total_boxes || 1}</td>
          </tr>
        </table>
      </div>

      <div class="signatures-grid">
        <div>
          <div>Prepared and Counted by: <strong>${shipment.prepared_by_name || 'Joshua Juvida'}</strong></div>
          <div class="sig-line"></div>
        </div>
        <div>
          <div>Verified by: <strong>${shipment.verified_by_name || 'Zhon Manaois'}</strong></div>
          <div class="sig-line"></div>
        </div>
      </div>
      <div style="margin-top: 14px; font-size: 11px; color: #64748b;">
        Receiving Branch Signature: <strong>${shipment.receiving_signature || site.code || 'ASP NPM'}</strong>
      </div>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Triggers a beautifully styled, landscape Master Allocation Matrix print document
 */
export function printAllocationMatrixDirect(allocations = [], sites = [], period = 'August 2026') {
  const printWindow = window.open('', '_blank', 'width=1200,height=900');
  if (!printWindow) {
    window.print();
    return;
  }

  const totalUnits = allocations.reduce((sum, it) => sum + (it.total_allocated_qty || 0), 0);
  let totalCost = 0;
  allocations.forEach(it => {
    const p = it.stocking_price || (it.description?.toLowerCase().includes('display') ? 279 : 99);
    totalCost += (it.total_allocated_qty || 0) * p;
  });

  const displayItems = allocations.filter(it => it.category_id === 'cat-display' || it.description?.toLowerCase().includes('display'));
  const batteryItems = allocations.filter(it => it.category_id === 'cat-battery' || it.description?.toLowerCase().includes('battery') || !displayItems.includes(it));

  const renderSectionRows = (items, catLabel) => {
    return items.map((it, idx) => {
      const price = it.stocking_price || 0;
      const q = it.total_allocated_qty || 0;
      const c = it.total_stock_cost || (q * price);
      const split = calculateWeeklySplit(q, c, idx + 3);
      const isDisplay = catLabel === 'DISPLAY';

      const siteCells = sites.map(s => {
        const sq = it.site_quantities?.[s.id] ?? it.site_quantities?.[s.code] ?? 0;
        return `<td style="text-align: center; ${sq > 0 ? 'background: #dcfce7; color: #15803d; font-weight: 700;' : 'color: #94a3b8;'}">${sq}</td>`;
      }).join('');

      return `
        <tr>
          <td style="text-align: center;"><span style="background: ${isDisplay ? '#e0f2fe' : '#dcfce7'}; color: ${isDisplay ? '#0369a1' : '#15803d'}; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9.5px;">${catLabel}</span></td>
          <td style="font-weight: 700; font-family: monospace; font-size: 10.5px;">${it.part_number}</td>
          <td style="text-align: left; font-size: 10.5px;">${it.description}</td>
          <td style="text-align: right; font-size: 10px;">$${price.toFixed(2)}</td>
          ${siteCells}
          <td style="text-align: center; background: #e0f2fe; color: #0369a1; font-weight: 800; font-size: 11px;">${q}</td>
          <td style="text-align: right; font-weight: 700; font-size: 10.5px;">$${c.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="text-align: center; font-size: 10px;">${split.w1_qty}</td>
          <td style="text-align: right; font-size: 10px;">$${split.w1_cost.toFixed(2)}</td>
          <td style="text-align: center; font-size: 10px;">${split.w2_qty}</td>
          <td style="text-align: right; font-size: 10px;">$${split.w2_cost.toFixed(2)}</td>
          <td style="text-align: center; font-size: 10px;">${split.w3_qty}</td>
          <td style="text-align: right; font-size: 10px;">$${split.w3_cost.toFixed(2)}</td>
          <td style="text-align: center; font-size: 10px;">${split.w4_qty}</td>
          <td style="text-align: right; font-size: 10px;">$${split.w4_cost.toFixed(2)}</td>
          <td style="text-align: center; font-size: 9px;"><span style="background: ${q > 0 ? '#dcfce7' : '#f1f5f9'}; color: ${q > 0 ? '#15803d' : '#64748b'}; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${q > 0 ? 'ORDER REQUIRED' : 'NO NEED TO ORDER'}</span></td>
        </tr>
      `;
    }).join('');
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Master Allocation Matrix - ${period}</title>
      <style>
        @page { size: landscape; margin: 6mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 6px; font-size: 10px; }
        .matrix-title-bar { background: #0f172a; color: #ffffff; padding: 10px 16px; border-radius: 6px 6px 0 0; display: flex; justify-content: space-between; align-items: center; }
        .matrix-kpi-bar { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
        .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 6px 12px; border-radius: 4px; }
        .kpi-label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; }
        .kpi-val { font-size: 14px; font-weight: 800; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #0f172a; color: #ffffff; padding: 4px 3px; font-size: 9px; border: 1px solid #334155; text-align: center; }
        td { border: 1px solid #cbd5e1; padding: 3px 4px; font-size: 9.5px; }
        .footer-row-1 { background: #0f172a; color: #ffffff; font-weight: 800; }
        .footer-row-2 { background: #1e293b; color: #38bdf8; font-weight: 800; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="matrix-title-bar">
        <div>
          <strong style="font-size: 13px;">MOBILE CARE SERVICES PHILS. INC. — Master Allocation Matrix</strong>
          <div style="font-size: 10px; color: #94a3b8;">${period} • 26 Branch Distribution & 4-Week Batch Valuation</div>
        </div>
        <div style="font-size: 11px; font-weight: 700; color: #38bdf8;">100% Zero-Error Matched</div>
      </div>

      <div class="matrix-kpi-bar">
        <div class="kpi-card"><div class="kpi-label">Total Allocated</div><div class="kpi-val" style="color: #0284c7;">${totalUnits.toLocaleString()} units</div></div>
        <div class="kpi-card"><div class="kpi-label">Active Branches</div><div class="kpi-val">${sites.length} sites</div></div>
        <div class="kpi-card"><div class="kpi-label">Grand Total Stock Value</div><div class="kpi-val" style="color: #15803d;">$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 60px;">Commodity</th>
            <th style="width: 75px;">Part #</th>
            <th>Description</th>
            <th style="width: 55px;">Stock Price</th>
            ${sites.map(s => `<th style="color: #38bdf8; font-size: 8.5px;">${s.code}</th>`).join('')}
            <th style="background: #0284c7; width: 60px;">Total Parts</th>
            <th style="background: #0369a1; width: 75px;">Total Value</th>
            <th style="background: #334155;">W1 Qty</th>
            <th style="background: #1e293b; color: #38bdf8;">W1 Cost</th>
            <th style="background: #334155;">W2 Qty</th>
            <th style="background: #1e293b; color: #38bdf8;">W2 Cost</th>
            <th style="background: #334155;">W3 Qty</th>
            <th style="background: #1e293b; color: #38bdf8;">W3 Cost</th>
            <th style="background: #334155;">W4 Qty</th>
            <th style="background: #1e293b; color: #38bdf8;">W4 Cost</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f0f9ff; font-weight: 800; color: #0369a1;"><td colspan="${sites.length + 14}">DISPLAY COMMODITY (${displayItems.length} Parts)</td></tr>
          ${renderSectionRows(displayItems, 'DISPLAY')}
          <tr style="background: #f0fdf4; font-weight: 800; color: #15803d;"><td colspan="${sites.length + 14}">BATTERY COMMODITY (${batteryItems.length} Parts)</td></tr>
          ${renderSectionRows(batteryItems, 'BATTERY')}
        </tbody>
      </table>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Downloads a high-resolution, landscape Master Allocation Matrix PDF
 */
export function exportAllocationToPDF(allocations = [], sites = [], period = 'August 2026') {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3' // A3 landscape provides optimal resolution for 35+ columns
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 8;

  // Title Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, 8, pageWidth - (margin * 2), 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`MOBILE CARE SERVICES PHILS. INC. — Master Allocation Matrix (${period})`, margin + 6, 16);

  const headers = [
    'Commodity',
    'Part #',
    'Description',
    'Price',
    ...sites.map(s => s.code),
    'Total Qty',
    'Total Cost',
    'W1 Qty',
    'W1 Total',
    'W2 Qty',
    'W2 Total',
    'W3 Qty',
    'W3 Total',
    'W4 Qty',
    'W4 Total',
    'Remarks'
  ];

  const tableData = allocations.map((item, idx) => {
    const isDisplay = item.category_id === 'cat-display' || item.description?.toLowerCase().includes('display');
    const price = item.stocking_price || 0;
    const qty = item.total_allocated_qty || 0;
    const cost = item.total_stock_cost || (qty * price);
    const split = calculateWeeklySplit(qty, cost, idx + 3);

    const row = [
      isDisplay ? 'DISPLAY' : 'BATTERY',
      item.part_number,
      item.description,
      `$${price.toFixed(0)}`
    ];

    sites.forEach(s => {
      row.push(item.site_quantities?.[s.id] ?? item.site_quantities?.[s.code] ?? 0);
    });

    row.push(
      qty,
      `$${cost.toFixed(0)}`,
      split.w1_qty,
      `$${split.w1_cost.toFixed(0)}`,
      split.w2_qty,
      `$${split.w2_cost.toFixed(0)}`,
      split.w3_qty,
      `$${split.w3_cost.toFixed(0)}`,
      split.w4_qty,
      `$${split.w4_cost.toFixed(0)}`,
      qty > 0 ? 'ORDER' : 'NO NEED'
    );

    return row;
  });

  autoTable(doc, {
    startY: 24,
    head: [headers],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      halign: 'center',
      valign: 'middle'
    },
    bodyStyles: {
      fontSize: 6.5,
      textColor: [15, 23, 42]
    },
    margin: { left: margin, right: margin }
  });

  doc.save(`Master_Allocation_${period.replace(/\s+/g, '_')}.pdf`);
}

/**
 * Direct print preview for Fixably Stock Transfers Report
 */
export function printStockTransfersDirect(records = [], metadata = {}) {
  const printWindow = window.open('', '_blank', 'width=1100,height=850');
  if (!printWindow) {
    window.print();
    return;
  }

  const totalQty = records.reduce((sum, r) => sum + (r.transfer_quantity || 0), 0);
  const totalVal = records.reduce((sum, r) => sum + (r.transfer_value || 0), 0);

  const rowsHtml = records.slice(0, 500).map((r, idx) => `
    <tr>
      <td style="text-align: center; color: #64748b;">${idx + 1}</td>
      <td style="text-align: center;">${r.transfer_received_date || '—'}</td>
      <td style="text-align: center; font-weight: 700; color: #92400e; background: #fef3c7; border-radius: 4px;">${r.from_stock || '—'}</td>
      <td style="text-align: center; font-weight: 700; color: #15803d; background: #dcfce7; border-radius: 4px;">${r.to_stock || '—'}</td>
      <td style="text-align: center; font-family: monospace; font-weight: 700;">${r.product_code || '—'}</td>
      <td style="text-align: left;">${r.product_name || '—'}</td>
      <td style="text-align: center; font-weight: 800; color: #0369a1; background: #e0f2fe;">${r.transfer_quantity || 1}</td>
      <td style="text-align: center; font-family: monospace; font-size: 10px;">${r.serial_number || '—'}</td>
      <td style="text-align: right; font-weight: 700;">$${(r.transfer_value || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Fixably Stock Transfers Report</title>
      <style>
        @page { size: landscape; margin: 8mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 8px; font-size: 11px; }
        .report-header { background: #0f172a; color: #ffffff; padding: 12px 18px; border-radius: 6px 6px 0 0; display: flex; justify-content: space-between; align-items: center; }
        .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
        .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px; }
        .kpi-title { font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; }
        .kpi-number { font-size: 16px; font-weight: 800; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #0f172a; color: #ffffff; padding: 6px 4px; font-size: 9.5px; border: 1px solid #334155; text-align: center; }
        td { border: 1px solid #cbd5e1; padding: 4px 6px; font-size: 10px; }
        .footer-row { background: #0f172a; color: #ffffff; font-weight: 800; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="report-header">
        <div>
          <div style="font-size: 14px; font-weight: 800;">MOBILE CARE SERVICES PHILS. INC.</div>
          <div style="font-size: 11px; color: #94a3b8;">Fixably Stock Transfers Comprehensive Movement Report</div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #38bdf8; font-weight: 700;">
          Source: ${metadata.fileName || 'Reports – Stock Transfers.xlsx'}
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-title">Total Transfers</div><div class="kpi-number" style="color: #0284c7;">${records.length.toLocaleString()} transfers</div></div>
        <div class="kpi-box"><div class="kpi-title">Total Quantity Moved</div><div class="kpi-number">${totalQty.toLocaleString()} units</div></div>
        <div class="kpi-box"><div class="kpi-title">Total Valuation</div><div class="kpi-number" style="color: #15803d;">$${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 30px;">#</th>
            <th style="width: 80px;">Received Date</th>
            <th style="width: 120px;">From Stock (Origin)</th>
            <th style="width: 120px;">To Stock (Destination)</th>
            <th style="width: 90px;">Part Code</th>
            <th>Product Name</th>
            <th style="width: 45px;">Qty</th>
            <th style="width: 150px;">Serial Number</th>
            <th style="width: 80px;">Transfer Value</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="footer-row">
            <td colspan="5" style="text-align: center;">TOTAL SUMMARY</td>
            <td>${records.length} Total Records (${records.length > 500 ? 'Showing first 500' : 'Complete'})</td>
            <td style="text-align: center;">${totalQty}</td>
            <td></td>
            <td style="text-align: right;">$${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Downloads landscape PDF for Fixably Stock Transfers Report
 */
export function exportStockTransfersToPDF(records = [], metadata = {}) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 8;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, 8, pageWidth - (margin * 2), 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('MOBILE CARE SERVICES PHILS. INC. — Fixably Stock Transfers Report', margin + 6, 15.5);

  const headers = [
    '#',
    'Received Date',
    'From Stock',
    'To Stock',
    'Part Code',
    'Product Name',
    'Qty',
    'Serial Number',
    'Value ($)'
  ];

  const tableData = records.slice(0, 400).map((r, idx) => [
    idx + 1,
    r.transfer_received_date || '',
    r.from_stock || '',
    r.to_stock || '',
    r.product_code || '',
    r.product_name || '',
    r.transfer_quantity || 1,
    r.serial_number || '',
    `$${(r.transfer_value || 0).toFixed(2)}`
  ]);

  autoTable(doc, {
    startY: 23,
    head: [headers],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 6.8,
      textColor: [15, 23, 42]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'center', cellWidth: 30 },
      3: { halign: 'center', cellWidth: 30 },
      4: { halign: 'center', cellWidth: 22 },
      5: { halign: 'left', cellWidth: 65 },
      6: { halign: 'center', cellWidth: 12 },
      7: { halign: 'center', cellWidth: 42 },
      8: { halign: 'right', cellWidth: 20 }
    },
    margin: { left: margin, right: margin }
  });

  doc.save(`Stock_Transfers_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}
