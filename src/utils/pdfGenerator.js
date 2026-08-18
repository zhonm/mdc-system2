import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generates and downloads a pixel-perfect Packing List PDF matching production format (Packing List.png)
 *
 * @param {Object} shipment - The shipment object
 * @param {Array} items - Array of scanned serialized items
 * @param {Object} site - Destination site details
 */
export function generatePackingListPDF(shipment, items = [], site = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Title: "Packing List"
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Packing List', pageWidth / 2, 22, { align: 'center' });

  // Company Information (Left Side)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('MOBILE CARE SERVICES PHILS. INC.', margin, 36);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  doc.text('Business and Distribution Center', margin, 41);
  doc.text('2/L Northeast Square, #47', margin, 46);
  doc.text('Connecticut St. Northeast Greenhills', margin, 51);
  doc.text('San Juan City, Metro Manila', margin, 56);

  // Invoice / Shipment Meta (Right Side)
  const rightColX = pageWidth - margin - 60;
  const rightValX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);

  const metaRows = [
    { label: 'INVOICE REF:', val: shipment.invoice_ref || `DCMSPIOWNED#${new Date().toISOString().slice(0,10).replace(/-/g,'')}G` },
    { label: 'SHIPMENT DATE:', val: shipment.shipment_date || new Date().toLocaleDateString('en-US') },
    { label: 'BOX/S #:', val: String(shipment.total_boxes || 1) },
    { label: 'CARRIER:', val: shipment.carrier || 'Lite Express' },
    { label: 'TRACKING NUMBER:', val: shipment.tracking_number || '20227258' }
  ];

  let metaY = 36;
  metaRows.forEach(row => {
    doc.setFont('helvetica', 'bold');
    doc.text(row.label, rightColX, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(row.val, rightValX, metaY, { align: 'right' });
    metaY += 5;
  });

  // Ship To Section
  const shipToY = 68;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Ship To', margin, shipToY);
  doc.text(site.name || shipment.site_name || 'SERVICE HUB', margin + 18, shipToY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const siteAddr = site.address || `${site.name || 'Branch'}, Philippines`;
  doc.text(siteAddr, margin + 18, shipToY + 4.5, { maxWidth: pageWidth - margin - 35 });

  // Items Table
  const tableData = items.map((item, index) => [
    index + 1,
    item.part_number || item.partNumber || '',
    item.description || item.partDescription || '',
    item.serial_number || item.serialNumber || '',
    item.box_number || item.boxNumber || 1
  ]);

  autoTable(doc, {
    startY: 82,
    head: [['#', 'PART NUMBER', 'DESCRIPTION', 'SERIAL NUMBER', 'BOX #']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [90, 95, 102], // Dark grey matching the template
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
      valign: 'middle',
      cellPadding: 2.5
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 30, 30],
      cellPadding: 2
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 },
      1: { halign: 'center', cellWidth: 32 },
      2: { halign: 'left', cellWidth: 62 },
      3: { halign: 'center', cellWidth: 58 },
      4: { halign: 'center', cellWidth: 16 }
    },
    margin: { left: margin, right: margin }
  });

  const finalY = doc.lastAutoTable.finalY + 4;

  // Remarks & Totals Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Remarks', margin, finalY + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.remarks || 'KGB PARTS', margin + 18, finalY + 4);

  // Totals Box (Right aligned)
  const totalBoxX = pageWidth - margin - 75;
  const totalValX = pageWidth - margin - 5;
  
  // Total QTY Row
  doc.setFillColor(90, 95, 102);
  doc.rect(totalBoxX, finalY, 45, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text('TOTAL QTY', totalBoxX + 22.5, finalY + 4, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  doc.text(String(items.length), totalValX, finalY + 4, { align: 'right' });

  // Total Boxes Row
  doc.setFillColor(90, 95, 102);
  doc.rect(totalBoxX, finalY + 6.5, 45, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL BOXES', totalBoxX + 22.5, finalY + 10.5, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  doc.text(String(shipment.total_boxes || 1), totalValX, finalY + 10.5, { align: 'right' });

  // Signatures Section (Bottom)
  const sigY = Math.max(finalY + 22, 245);
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, sigY - 4, pageWidth - margin, sigY - 4);

  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);

  // Prepared by
  doc.setFont('helvetica', 'bold');
  doc.text('Prepared and Counted by:', margin, sigY + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.prepared_by_name || 'Joshua Juvida', margin + 45, sigY + 2);

  // Verified by
  doc.setFont('helvetica', 'bold');
  doc.text('Verified by:', margin + 100, sigY + 2);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.verified_by_name || 'Anjo Alcazar', margin + 125, sigY + 2);

  // Receiving Branch Signature
  doc.setFont('helvetica', 'bold');
  doc.text('Receiving Branch Signature:', margin, sigY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(shipment.receiving_signature || site.code || 'ASP NPM', margin + 45, sigY + 12);

  // Save / Export
  const filename = `PackingList_${shipment.invoice_ref || shipment.shipment_number || 'export'}.pdf`;
  doc.save(filename);
}

/**
 * Triggers native browser print preview for immediate packing table printing
 */
export function printPackingListDirect(shipment, items = [], site = {}) {
  window.print();
}
