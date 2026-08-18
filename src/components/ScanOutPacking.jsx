import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { generatePackingListPDF, printPackingListDirect } from '../utils/pdfGenerator';
import {
  PackageCheck,
  Printer,
  Download,
  AlertCircle,
  CheckCircle2,
  Boxes,
  ArrowRight,
  Zap,
  Trash2,
  FileSpreadsheet,
  UploadCloud,
  FileText,
  X,
  RefreshCw,
  Search,
  Check,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { parseScanOutPartsFile, downloadScanOutTemplate } from '../utils/excelParser';

export default function ScanOutPacking() {
  const {
    sites,
    parts,
    inventoryUnits,
    allocations,
    shipments,
    saveShipment,
    addScanOutUnit,
    batchAddScanOutUnits,
    clearShipmentDraftItems,
    currentUser,
    showToast
  } = useApp();

  const serviceSites = sites.filter(s => !s.is_dc);
  const [selectedSiteId, setSelectedSiteId] = useState(serviceSites[0]?.id || '');
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [boxNumber, setBoxNumber] = useState(1);

  // Active Shipment Draft with LocalStorage persistence
  const [currentShipment, setCurrentShipment] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_active_pack_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) return parsed;
      }
    } catch (e) {
      console.warn('Could not read mdc_active_pack_draft:', e);
    }
    const existing = shipments.find(s => s.site_id === serviceSites[0]?.id && s.status === 'draft');
    if (existing) return existing;
    return {
      id: `ship-${Date.now()}`,
      shipment_number: `SHIP-202608-${String(shipments.length + 1).padStart(3, '0')}`,
      invoice_ref: `DCMSPIOWNED#20260808G`,
      site_id: serviceSites[0]?.id,
      week_number: 1,
      shipment_date: new Date().toLocaleDateString('en-US'),
      carrier: 'Lite Express',
      tracking_number: '20227258',
      total_boxes: 1,
      status: 'draft',
      prepared_by_name: currentUser?.fullName || 'Joshua Juvida',
      verified_by_name: 'Anjo Alcazar',
      receiving_signature: serviceSites[0]?.code || 'ASP NPM',
      remarks: 'KGB PARTS',
      items: []
    };
  });

  // Keep active draft synced to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('mdc_active_pack_draft', JSON.stringify(currentShipment));
    } catch (e) {
      console.warn('Could not persist pack draft:', e);
    }
  }, [currentShipment]);

  const [partNumberInput, setPartNumberInput] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [manifestSearch, setManifestSearch] = useState('');

  // Clear Confirmation Modal State
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedBatch, setParsedBatch] = useState(null);
  const [importFilter, setImportFilter] = useState('ALL'); // 'ALL' | 'VALID' | 'NOT_FOUND'

  const pnInputRef = useRef(null);
  const serialInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const selectedSite = sites.find(s => s.id === selectedSiteId) || serviceSites[0] || {};

  // Auto-focus Part Number input on mount
  useEffect(() => {
    pnInputRef.current?.focus();
  }, []);

  // Update shipment when site changes
  const handleSiteChange = (newSiteId) => {
    setSelectedSiteId(newSiteId);
    const siteObj = sites.find(s => s.id === newSiteId);
    setCurrentShipment(prev => ({
      ...prev,
      site_id: newSiteId,
      receiving_signature: siteObj?.code || 'ASP NPM'
    }));
  };

  // Keyboard HID submission handlers
  const handlePnKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (partNumberInput.trim()) {
        serialInputRef.current?.focus();
      }
    }
  };

  const handleSerialKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executePackScan();
    }
  };

  const executePackScan = () => {
    const cleanPN = partNumberInput.trim().toUpperCase();
    const cleanSerial = serialInput.trim().toUpperCase();

    if (!cleanPN || !cleanSerial) {
      setScanResult({ type: 'error', message: 'Please scan both Part Number and Serial Number' });
      return;
    }

    const res = addScanOutUnit({
      shipmentId: currentShipment.id,
      siteId: selectedSiteId,
      partNumber: cleanPN,
      serialNumber: cleanSerial,
      boxNumber: boxNumber
    });

    if (res.success) {
      setScanResult({
        type: 'success',
        message: `Packed: ${res.item.description} (SN: ${res.item.serial_number}) into Box ${boxNumber}`
      });

      setCurrentShipment(prev => ({
        ...prev,
        items: [...(prev.items || []), res.item]
      }));

      setSerialInput('');
      serialInputRef.current?.focus();
    } else {
      setScanResult({
        type: 'error',
        message: res.error
      });
      serialInputRef.current?.select();
    }
  };

  // Quick simulator for testing pack-out
  const availableStockUnits = inventoryUnits.filter(u => u.status === 'in_stock');
  const handleSimulatePack = (unit) => {
    setPartNumberInput(unit.part_number);
    setSerialInput(unit.serial_number);
    setTimeout(() => {
      const res = addScanOutUnit({
        shipmentId: currentShipment.id,
        siteId: selectedSiteId,
        partNumber: unit.part_number,
        serialNumber: unit.serial_number,
        boxNumber: boxNumber
      });
      if (res.success) {
        setScanResult({
          type: 'success',
          message: `[PACKED] ${res.item.description} (#${res.item.serial_number})`
        });
        setCurrentShipment(prev => ({
          ...prev,
          items: [...(prev.items || []), res.item]
        }));
      } else {
        setScanResult({ type: 'error', message: res.error });
      }
    }, 150);
  };

  // --- XLSX / CSV File Import Handling ---
  const handleFileSelect = async (file) => {
    if (!file) return;
    setIsParsing(true);
    try {
      const res = await parseScanOutPartsFile(file, inventoryUnits, sites, selectedSiteId);
      if (res.success) {
        setParsedBatch(res);
        showToast(`Parsed ${res.summary.total} rows (${res.summary.valid} ready to pack)`, 'info');
      } else {
        showToast(res.error || 'Failed to parse pack file', 'error');
        setParsedBatch(null);
      }
    } catch (err) {
      console.error(err);
      showToast('Error processing file: ' + err.message, 'error');
      setParsedBatch(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleDownloadTemplate = (format) => {
    downloadScanOutTemplate(format, sites, inventoryUnits);
    showToast(`Downloaded Scan-Out template (${format.toUpperCase()})`, 'info');
  };

  const handleConfirmBatchPack = () => {
    if (!parsedBatch || !parsedBatch.items) return;

    const validItems = parsedBatch.items.filter(it => it.status === 'VALID');
    if (validItems.length === 0) {
      showToast('No valid parts ready to pack.', 'error');
      return;
    }

    const res = batchAddScanOutUnits({
      shipmentId: currentShipment.id,
      siteId: selectedSiteId,
      items: validItems
    });

    if (res.success) {
      setCurrentShipment(prev => ({
        ...prev,
        items: [...(prev.items || []), ...res.items]
      }));

      setScanResult({
        type: 'success',
        message: `[BATCH PACK COMPLETE] Packed ${res.count} units from "${parsedBatch.fileName}" into Manifest ${currentShipment.invoice_ref}!`
      });

      setParsedBatch(null);
      setIsImportModalOpen(false);
      pnInputRef.current?.focus();
    } else {
      showToast(res.error || 'Batch pack failed', 'error');
    }
  };

  // --- Safe Clear / Unpack Handling ---
  const handleConfirmClearDraft = () => {
    clearShipmentDraftItems(currentShipment.id);
    setCurrentShipment(prev => ({
      ...prev,
      items: []
    }));
    setIsClearModalOpen(false);
    setScanResult(null);
    showToast('Cleared packing list draft. All units restored to DC stock.', 'info');
  };

  // Finalize Manifest
  const handleFinalizeShipment = () => {
    if (!currentShipment.items || currentShipment.items.length === 0) {
      showToast('Cannot finalize empty packing list', 'error');
      return;
    }
    const finalized = {
      ...currentShipment,
      status: 'shipped',
      total_boxes: boxNumber
    };
    saveShipment(finalized);
    generatePackingListPDF(finalized, finalized.items, selectedSite);
    
    // Reset draft for next shipment
    localStorage.removeItem('mdc_active_pack_draft');
    setCurrentShipment({
      id: `ship-${Date.now()}`,
      shipment_number: `SHIP-202608-${String(shipments.length + 2).padStart(3, '0')}`,
      invoice_ref: `DCMSPIOWNED#${Date.now().toString().slice(-6)}G`,
      site_id: selectedSiteId,
      week_number: selectedWeek,
      shipment_date: new Date().toLocaleDateString('en-US'),
      carrier: 'Lite Express',
      tracking_number: '20227258',
      total_boxes: 1,
      status: 'draft',
      prepared_by_name: currentUser?.fullName || 'Joshua Juvida',
      verified_by_name: 'Anjo Alcazar',
      receiving_signature: selectedSite?.code || 'ASP NPM',
      remarks: 'KGB PARTS',
      items: []
    });

    showToast(`Manifest ${finalized.invoice_ref} finalized and PDF downloaded!`, 'success');
  };

  const filteredManifestItems = useMemo(() => {
    const items = currentShipment.items || [];
    if (!manifestSearch.trim()) return items;
    const q = manifestSearch.toLowerCase().trim();
    return items.filter(it =>
      (it.part_number && it.part_number.toLowerCase().includes(q)) ||
      (it.serial_number && it.serial_number.toLowerCase().includes(q)) ||
      (it.description && it.description.toLowerCase().includes(q))
    );
  }, [currentShipment.items, manifestSearch]);

  const filteredPreviewItems = (parsedBatch?.items || []).filter(item => {
    if (importFilter === 'VALID') return item.status === 'VALID';
    if (importFilter === 'NOT_FOUND') return item.status === 'NOT_FOUND' || item.status === 'ALREADY_PACKED';
    return true;
  });

  return (
    <div className="scan-out-packing-view" style={{ maxWidth: '1150px', margin: '0 auto' }}>
      {/* Scanner & Manifest Config Banner */}
      <div className="scanner-hero" style={{ marginBottom: '24px' }}>
        <div className="scanner-hero-header">
          <div>
            <h2 style={{ color: '#fff', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PackageCheck size={22} color="#38bdf8" />
              <span>Pack Scan-Out & Packing List Generator</span>
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '12.5px', marginTop: '2px' }}>
              Serialized Verification against DC Stock • Batch XLSX/CSV Scan-Out • Real-Time Database Sync
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setIsImportModalOpen(true)}
              style={{
                background: '#1e293b',
                color: '#38bdf8',
                borderColor: '#38bdf8',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileSpreadsheet size={16} />
              <span>Import XLSX / CSV</span>
            </button>

            {currentShipment.items && currentShipment.items.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setIsClearModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={14} />
                <span>Clear Draft ({currentShipment.items.length})</span>
              </button>
            )}

            <div className="scanner-status-indicator">
              <div className="pulse-dot" />
              <span>HID Scanner Ready</span>
            </div>
          </div>
        </div>

        {/* Site & Batch Selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          <div>
            <label className="scanner-field-label">Destination Service Site</label>
            <select
              className="form-select"
              style={{ width: '100%', background: '#1e293b', color: '#fff', borderColor: '#334155' }}
              value={selectedSiteId}
              onChange={(e) => handleSiteChange(e.target.value)}
            >
              {serviceSites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="scanner-field-label">Allocation Week</label>
            <select
              className="form-select"
              style={{ width: '100%', background: '#1e293b', color: '#fff', borderColor: '#334155' }}
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
            >
              <option value={1}>Week 1</option>
              <option value={2}>Week 2</option>
              <option value={3}>Week 3</option>
              <option value={4}>Week 4</option>
            </select>
          </div>

          <div>
            <label className="scanner-field-label">Current Box #</label>
            <select
              className="form-select"
              style={{ width: '100%', background: '#1e293b', color: '#fff', borderColor: '#334155' }}
              value={boxNumber}
              onChange={(e) => setBoxNumber(parseInt(e.target.value))}
            >
              <option value={1}>Box 1</option>
              <option value={2}>Box 2</option>
              <option value={3}>Box 3</option>
              <option value={4}>Box 4</option>
            </select>
          </div>

          <div>
            <label className="scanner-field-label">Carrier</label>
            <input
              type="text"
              className="form-input"
              style={{ width: '100%', background: '#1e293b', color: '#fff', borderColor: '#334155' }}
              value={currentShipment.carrier || 'Lite Express'}
              onChange={(e) => setCurrentShipment(prev => ({ ...prev, carrier: e.target.value }))}
            />
          </div>
        </div>

        {/* HID Scan Inputs */}
        <div className="scan-input-grid">
          <div>
            <label className="scanner-field-label">1. Part Number (P/N)</label>
            <input
              ref={pnInputRef}
              type="text"
              className="scanner-input"
              placeholder="e.g. 661-21991"
              value={partNumberInput}
              onChange={(e) => setPartNumberInput(e.target.value)}
              onKeyDown={handlePnKeyDown}
            />
          </div>

          <div>
            <label className="scanner-field-label">2. Serial Number (S/N)</label>
            <input
              ref={serialInputRef}
              type="text"
              className="scanner-input"
              placeholder="e.g. F8Y6276C1UQ13XCB1"
              value={serialInput}
              onChange={(e) => setSerialInput(e.target.value)}
              onKeyDown={handleSerialKeyDown}
            />
          </div>

          <div>
            <button className="btn btn-primary btn-lg" onClick={executePackScan} style={{ height: '54px' }}>
              <span>Pack Unit</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {scanResult && (
          <div
            className={`scanner-feedback-box ${
              scanResult.type === 'success' ? 'scanner-feedback-success' : 'scanner-feedback-error'
            }`}
          >
            {scanResult.type === 'success' ? (
              <CheckCircle2 size={20} color="#10b981" />
            ) : (
              <AlertCircle size={20} color="#ef4444" />
            )}
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{scanResult.message}</span>
          </div>
        )}
      </div>

      {/* Simulator for Available DC Stock */}
      <div className="card" style={{ marginBottom: '24px', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} color="var(--primary)" />
            <strong style={{ fontSize: '13px' }}>Available Stock Units in DC ({availableStockUnits.length} in-stock)</strong>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Click to test single unit packing
          </span>
        </div>

        {availableStockUnits.length === 0 ? (
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', padding: '8px 0' }}>
            No units in DC stock. Receive or import parts in the Receive Scan-In page first.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '90px', overflowY: 'auto' }}>
            {availableStockUnits.slice(0, 10).map(unit => (
              <button
                key={unit.id}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11.5px', background: '#fff' }}
                onClick={() => handleSimulatePack(unit)}
              >
                <span>+ {unit.part_number} ({unit.serial_number.slice(0, 8)}...)</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Corporate Packing List Live Preview */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>Live Packing Manifest Preview</h3>
              <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                <Check size={11} style={{ display: 'inline', marginRight: '3px' }} />
                Persistent Draft
              </span>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Formatted identically to Apple Authorized Service Partner corporate standard
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Quick Search */}
            <div style={{ position: 'relative', width: '200px' }}>
              <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search packed items..."
                value={manifestSearch}
                onChange={(e) => setManifestSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '26px', height: '34px', fontSize: '12px', width: '100%' }}
              />
            </div>

            {currentShipment.items && currentShipment.items.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setIsClearModalOpen(true)}
                style={{ height: '34px' }}
              >
                <RotateCcw size={13} />
                <span>Clear Draft</span>
              </button>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => printPackingListDirect(currentShipment, currentShipment.items, selectedSite)}
              style={{ height: '34px' }}
            >
              <Printer size={14} />
              <span>Print Preview</span>
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleFinalizeShipment}
              disabled={!currentShipment.items || currentShipment.items.length === 0}
              style={{ height: '34px' }}
            >
              <Download size={14} />
              <span>Finalize & Download PDF</span>
            </button>
          </div>
        </div>

        {/* Exact HTML Sheet Preview matching Packing List.png */}
        <div className="packing-list-sheet">
          <div className="packing-list-header">
            <h2>Packing List</h2>
          </div>

          <div className="packing-company-meta">
            <div>
              <h3>MOBILE CARE SERVICES PHILS. INC.</h3>
              <p>Business and Distribution Center</p>
              <p>2/L Northeast Square, #47</p>
              <p>Connecticut St. Northeast Greenhills</p>
              <p>San Juan City, Metro Manila</p>
            </div>

            <div className="packing-invoice-meta">
              <div className="packing-invoice-meta-row">
                <strong>INVOICE REF:</strong>
                <span className="font-mono">{currentShipment.invoice_ref}</span>
              </div>
              <div className="packing-invoice-meta-row">
                <strong>SHIPMENT DATE:</strong>
                <span>{currentShipment.shipment_date}</span>
              </div>
              <div className="packing-invoice-meta-row">
                <strong>BOX/S #:</strong>
                <span>{boxNumber}</span>
              </div>
              <div className="packing-invoice-meta-row">
                <strong>CARRIER:</strong>
                <span>{currentShipment.carrier || 'Lite Express'}</span>
              </div>
              <div className="packing-invoice-meta-row">
                <strong>TRACKING NUMBER:</strong>
                <span className="font-mono">{currentShipment.tracking_number}</span>
              </div>
            </div>
          </div>

          {/* Ship To */}
          <div style={{ marginBottom: '20px', fontSize: '12.5px' }}>
            <div style={{ display: 'flex', gap: '16px' }}>
              <strong>Ship To</strong>
              <div>
                <strong>{selectedSite.name}</strong>
                <div style={{ color: '#475569', fontSize: '11.5px', marginTop: '2px' }}>
                  {selectedSite.address}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="packing-table-container">
            <table className="packing-manifest-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ width: '130px' }}>PART NUMBER</th>
                  <th>DESCRIPTION</th>
                  <th style={{ width: '220px' }}>SERIAL NUMBER</th>
                  <th style={{ width: '60px' }}>BOX #</th>
                </tr>
              </thead>
              <tbody>
                {filteredManifestItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      {manifestSearch ? `No packed items match "${manifestSearch}"` : 'No items packed yet. Scan parts or import spreadsheet above.'}
                    </td>
                  </tr>
                ) : (
                  filteredManifestItems.map((it, i) => (
                    <tr key={i}>
                      <td style={{ textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{it.part_number}</td>
                      <td>{it.description}</td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{it.serial_number}</td>
                      <td style={{ textAlign: 'center' }}>{it.box_number || 1}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Remarks and Totals Box */}
          <div className="packing-summary-bar">
            <div>
              <span style={{ fontWeight: 700, fontSize: '12px' }}>Remarks: </span>
              <span style={{ fontSize: '12px' }}>{currentShipment.remarks || 'KGB PARTS'}</span>
            </div>

            <div className="packing-totals-box">
              <div className="packing-total-row">
                <div className="packing-total-label">TOTAL QTY</div>
                <div className="packing-total-val">{currentShipment.items?.length || 0}</div>
              </div>
              <div className="packing-total-row">
                <div className="packing-total-label">TOTAL BOXES</div>
                <div className="packing-total-val">{boxNumber}</div>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="packing-signatures">
            <div>
              <strong>Prepared and Counted by: </strong>
              <span>{currentShipment.prepared_by_name || 'Joshua Juvida'}</span>
            </div>
            <div>
              <strong>Verified by: </strong>
              <span>{currentShipment.verified_by_name || 'Anjo Alcazar'}</span>
            </div>
            <div>
              <strong>Receiving Branch Signature: </strong>
              <span>{selectedSite.code}</span>
            </div>
          </div>
        </div>
      </div>

      {/* --- Safety Confirmation Modal: Clear Packing Draft --- */}
      {isClearModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setIsClearModalOpen(false); }}>
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ background: '#991b1b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} color="#fff" />
                <h3 style={{ color: '#fff', fontSize: '16px', margin: 0 }}>Clear Active Packing Draft?</h3>
              </div>
              <button onClick={() => setIsClearModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <p style={{ fontSize: '13.5px', color: 'var(--text-main)', marginBottom: '12px' }}>
                Are you sure you want to remove all <strong>{currentShipment.items?.length || 0} items</strong> from this packing draft?
              </p>
              <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '12px', color: '#991b1b' }}>
                <strong>Safety Note:</strong> All packed parts will be safely returned to <strong>In-Stock DC inventory</strong> so no stock is lost.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsClearModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleConfirmClearDraft}>
                Yes, Clear Draft & Restore Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- XLSX / CSV Import Modal Dialog --- */}
      {isImportModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setIsImportModalOpen(false); }}>
          <div className="modal-content">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '8px' }}>
                  <FileSpreadsheet size={22} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '17px', margin: 0 }}>Batch Pack Scan-Out (XLSX / CSV)</h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0 0' }}>
                    Bulk pack parts into Manifest for {selectedSite.name}
                  </p>
                </div>
              </div>
              <button onClick={() => setIsImportModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Template Download Row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '12px 16px',
                background: '#f8fafc',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Download size={16} color="var(--primary)" />
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>Need a formatted scan-out template?</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownloadTemplate('xlsx')}
                    style={{ background: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <FileSpreadsheet size={13} color="#16a34a" />
                    <span>Download Excel (.xlsx)</span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownloadTemplate('csv')}
                    style={{ background: '#fff', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <FileText size={13} color="#0284c7" />
                    <span>Download CSV (.csv)</span>
                  </button>
                </div>
              </div>

              {!parsedBatch ? (
                <div
                  className={`dropzone ${isDragging ? 'active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.[0]) await handleFileSelect(e.dataTransfer.files[0]);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  style={{ minHeight: '180px' }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileSelect(e.target.files?.[0])}
                  />
                  <div style={{ background: 'var(--primary-light)', padding: '14px', borderRadius: '50%', marginBottom: '12px' }}>
                    <UploadCloud size={32} color="var(--primary)" />
                  </div>
                  <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                    {isDragging ? 'Drop pack file here' : 'Click to browse or drag & drop scan-out file'}
                  </h4>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                    Supports Microsoft Excel (<strong>.xlsx, .xls</strong>) and <strong>.csv</strong> files
                  </p>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)', marginTop: '8px' }}>
                    Columns: Part Number, Serial Number, Box Number, Destination Site
                  </span>
                </div>
              ) : (
                <div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f1f5f9',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileSpreadsheet size={18} color="var(--primary)" />
                      <strong style={{ fontSize: '13px' }}>{parsedBatch.fileName}</strong>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => setParsedBatch(null)} style={{ fontSize: '12px', background: '#fff' }}>
                      <RefreshCw size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Choose Different File
                    </button>
                  </div>

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div className="import-stat-card">
                      <span className="import-stat-label">Total Rows</span>
                      <span className="import-stat-value">{parsedBatch.summary.total}</span>
                    </div>
                    <div className="import-stat-card" style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
                      <span className="import-stat-label" style={{ color: '#16a34a' }}>Ready to Pack</span>
                      <span className="import-stat-value" style={{ color: '#16a34a' }}>{parsedBatch.summary.valid}</span>
                    </div>
                    <div className="import-stat-card" style={{ borderColor: parsedBatch.summary.notFound > 0 ? '#fed7aa' : '#e2e8f0' }}>
                      <span className="import-stat-label" style={{ color: parsedBatch.summary.notFound > 0 ? '#ea580c' : 'var(--text-muted)' }}>
                        Not In DC Stock (Skip)
                      </span>
                      <span className="import-stat-value" style={{ color: parsedBatch.summary.notFound > 0 ? '#ea580c' : 'var(--text-muted)' }}>
                        {parsedBatch.summary.notFound}
                      </span>
                    </div>
                  </div>

                  {/* Filter tabs */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button className={`btn btn-sm ${importFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setImportFilter('ALL')}>
                      All ({parsedBatch.items.length})
                    </button>
                    <button className={`btn btn-sm ${importFilter === 'VALID' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setImportFilter('VALID')}>
                      Ready ({parsedBatch.summary.valid})
                    </button>
                    {parsedBatch.summary.notFound > 0 && (
                      <button className={`btn btn-sm ${importFilter === 'NOT_FOUND' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setImportFilter('NOT_FOUND')}>
                        Not in Stock ({parsedBatch.summary.notFound})
                      </button>
                    )}
                  </div>

                  {/* Table */}
                  <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Status</th>
                          <th>Part Number</th>
                          <th>Description</th>
                          <th>Serial Number</th>
                          <th>Box #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPreviewItems.map(item => (
                          <tr key={item.id}>
                            <td className="font-mono" style={{ fontSize: '11.5px' }}>#{item.rowNumber}</td>
                            <td>
                              {item.status === 'VALID' && (
                                <span className="badge badge-success" style={{ fontSize: '11px' }}>In Stock</span>
                              )}
                              {item.status === 'NOT_FOUND' && (
                                <span className="badge" style={{ background: '#fee2e2', color: '#dc2626', fontSize: '11px' }}>Not in Stock</span>
                              )}
                              {item.status === 'ALREADY_PACKED' && (
                                <span className="badge" style={{ background: '#fef3c7', color: '#b45309', fontSize: '11px' }}>Already Packed</span>
                              )}
                            </td>
                            <td className="font-mono"><strong>{item.partNumber}</strong></td>
                            <td>{item.description}</td>
                            <td className="font-mono" style={{ fontSize: '11.5px' }}>{item.serialNumber}</td>
                            <td>{item.boxNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setIsImportModalOpen(false)}>
                Cancel
              </button>
              {parsedBatch && (
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmBatchPack}
                  disabled={parsedBatch.summary.valid === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle2 size={16} />
                  <span>Pack {parsedBatch.summary.valid} Valid Units into Manifest</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
