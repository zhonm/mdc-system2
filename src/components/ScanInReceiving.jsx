import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Barcode,
  CheckCircle2,
  AlertCircle,
  Zap,
  ArrowRight,
  UploadCloud,
  FileSpreadsheet,
  Download,
  X,
  FileText,
  AlertTriangle,
  RefreshCw,
  Layers,
  Sparkles,
  Search,
  Database,
  Check
} from 'lucide-react';
import { parseScanInPartsFile, downloadScanInTemplate } from '../utils/excelParser';

export default function ScanInReceiving() {
  const {
    addScanInUnit,
    batchAddScanInUnits,
    purchaseOrders,
    parts,
    inventoryUnits,
    showToast
  } = useApp();

  const [selectedPoId, setSelectedPoId] = useState(purchaseOrders[0]?.id || '');
  const [partNumberInput, setPartNumberInput] = useState('');
  const [serialInput, setSerialInput] = useState('');
  const [scanResult, setScanResult] = useState(null); // { type: 'success' | 'error', message: '' }

  // Persistent Recent Scans state
  const [sessionScans, setSessionScans] = useState(() => {
    try {
      const saved = localStorage.getItem('mdc_recent_scans');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Could not read mdc_recent_scans:', e);
    }
    // Fallback: take latest items from inventoryUnits
    return (inventoryUnits || []).slice(0, 100);
  });

  // Keep sessionScans in sync with inventoryUnits updates
  useEffect(() => {
    try {
      localStorage.setItem('mdc_recent_scans', JSON.stringify(sessionScans.slice(0, 500)));
    } catch (e) {
      console.warn('Could not save mdc_recent_scans:', e);
    }
  }, [sessionScans]);

  // View & Filter States for Table
  const [activeTableView, setActiveTableView] = useState('ALL_DC_STOCK'); // 'ALL_DC_STOCK' | 'SESSION_SCANS'
  const [tableSearch, setTableSearch] = useState('');

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedBatch, setParsedBatch] = useState(null);
  const [modalPoId, setModalPoId] = useState(purchaseOrders[0]?.id || '');
  const [importFilter, setImportFilter] = useState('ALL'); // 'ALL' | 'VALID' | 'DUPLICATE'

  const pnInputRef = useRef(null);
  const serialInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-focus Part Number input on mount
  useEffect(() => {
    pnInputRef.current?.focus();
  }, []);

  // Sync modal PO with hero PO when opening
  useEffect(() => {
    if (isImportModalOpen) {
      setModalPoId(selectedPoId);
    }
  }, [isImportModalOpen, selectedPoId]);

  // Handle Part Number submission (Enter key from scanner)
  const handlePnKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (partNumberInput.trim()) {
        serialInputRef.current?.focus();
      }
    }
  };

  // Handle Serial submission (Enter key from scanner)
  const handleSerialKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeScan();
    }
  };

  const executeScan = () => {
    if (!partNumberInput.trim() || !serialInput.trim()) {
      setScanResult({
        type: 'error',
        message: 'Please provide both Part Number and Serial Number'
      });
      return;
    }

    const res = addScanInUnit({
      partNumber: partNumberInput.trim(),
      serialNumber: serialInput.trim(),
      poId: selectedPoId || null
    });

    if (res.success) {
      setScanResult({
        type: 'success',
        message: `Successfully received: ${res.unit.description} (SN: ${res.unit.serial_number})`
      });
      setSessionScans(prev => [res.unit, ...prev]);
      
      // Clear inputs and refocus Part Number or keep Part Number for batch scanning
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

  // Quick Mock Scanner Simulator (for testing without a physical barcode scanner)
  const testSampleParts = [
    { pn: '661-21991', desc: 'Battery, iPhone 13', sampleSerial: `DN8${Date.now().toString().slice(-6)}MCN3R` },
    { pn: '661-21996', desc: 'Battery, iPhone 13 Pro', sampleSerial: `DNM${Date.now().toString().slice(-6)}33817` },
    { pn: '661-22294', desc: 'Battery, iPhone 13 Pro Max', sampleSerial: `F8Y${Date.now().toString().slice(-6)}13XCB` },
    { pn: '661-30401', desc: 'Display, iPhone 14 Pro Max', sampleSerial: `GH3${Date.now().toString().slice(-6)}00MUZ` }
  ];

  const handleSimulateScan = (pn, serial) => {
    setPartNumberInput(pn);
    setSerialInput(serial);
    setTimeout(() => {
      const res = addScanInUnit({
        partNumber: pn,
        serialNumber: serial,
        poId: selectedPoId || null
      });
      if (res.success) {
        setScanResult({
          type: 'success',
          message: `[SIMULATED SCAN] Received: ${res.unit.description} (SN: ${res.unit.serial_number})`
        });
        setSessionScans(prev => [res.unit, ...prev]);
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
      const res = await parseScanInPartsFile(file, parts, inventoryUnits, purchaseOrders);
      if (res.success) {
        setParsedBatch(res);
        showToast(`Parsed ${res.summary.total} rows (${res.summary.valid} ready to import)`, 'info');
      } else {
        showToast(res.error || 'Failed to parse parts file', 'error');
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

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await handleFileSelect(files[0]);
    }
  };

  const handleDownloadTemplate = (format) => {
    downloadScanInTemplate(format, parts, purchaseOrders);
    showToast(`Downloaded sample template (${format.toUpperCase()})`, 'info');
  };

  const handleConfirmBatchImport = () => {
    if (!parsedBatch || !parsedBatch.items) return;

    const validItems = parsedBatch.items.filter(it => it.status === 'VALID' || it.status === 'NEW_PART');
    if (validItems.length === 0) {
      showToast('No valid parts to import.', 'error');
      return;
    }

    const res = batchAddScanInUnits(validItems, modalPoId || selectedPoId || null);
    if (res.success) {
      // Mark imported units with import source badge
      const importedWithFlag = res.units.map(u => ({ ...u, isImported: true }));
      setSessionScans(prev => [...importedWithFlag, ...prev]);

      setScanResult({
        type: 'success',
        message: `[BATCH IMPORT COMPLETE] Successfully received & saved ${res.count} parts from "${parsedBatch.fileName}" into DC Database!`
      });

      // Switch view to show the newly imported items
      setActiveTableView('ALL_DC_STOCK');

      // Reset and close modal
      setParsedBatch(null);
      setIsImportModalOpen(false);
      pnInputRef.current?.focus();
    } else {
      showToast(res.error || 'Batch import failed', 'error');
    }
  };

  const filteredPreviewItems = (parsedBatch?.items || []).filter(item => {
    if (importFilter === 'VALID') return item.status === 'VALID' || item.status === 'NEW_PART';
    if (importFilter === 'DUPLICATE') return item.status === 'DUPLICATE';
    return true;
  });

  // Table items calculation
  const displayedUnits = useMemo(() => {
    let sourceList = activeTableView === 'ALL_DC_STOCK' ? inventoryUnits : sessionScans;
    if (!sourceList) sourceList = [];

    if (!tableSearch.trim()) return sourceList;

    const q = tableSearch.toLowerCase().trim();
    return sourceList.filter(u =>
      (u.part_number && u.part_number.toLowerCase().includes(q)) ||
      (u.serial_number && u.serial_number.toLowerCase().includes(q)) ||
      (u.description && u.description.toLowerCase().includes(q))
    );
  }, [activeTableView, inventoryUnits, sessionScans, tableSearch]);

  const handleClearSessionHistory = () => {
    setSessionScans([]);
    localStorage.removeItem('mdc_recent_scans');
    showToast('Cleared session view history (Stock inventory remains intact in Database)', 'info');
  };

  return (
    <div className="scanner-container">
      {/* Scanner Workstation Hero Card */}
      <div className="scanner-hero">
        <div className="scanner-hero-header">
          <div>
            <h2 style={{ color: '#fff', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Barcode size={22} color="#38bdf8" />
              <span>DC Receive Scan-In Station</span>
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '12.5px', marginTop: '2px' }}>
              Physical Keyboard HID Barcode Scanner Active • Auto-Advance on Enter • Persistent Database Storage
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 'var(--radius-full)',
              padding: '4px 10px',
              fontSize: '11.5px',
              color: '#38bdf8'
            }}>
              <Database size={13} />
              <span>DC Stock: <strong>{inventoryUnits.length} units</strong></span>
            </div>

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

            <div className="scanner-status-indicator">
              <div className="pulse-dot" />
              <span>Scanner Ready (HID)</span>
            </div>
          </div>
        </div>

        {/* PO Selector */}
        <div style={{ marginBottom: '20px', maxWidth: '400px' }}>
          <label className="scanner-field-label">Linked Purchase Order (Optional)</label>
          <select
            className="form-select"
            style={{ width: '100%', background: '#1e293b', color: '#fff', borderColor: '#334155' }}
            value={selectedPoId}
            onChange={(e) => setSelectedPoId(e.target.value)}
          >
            <option value="">-- No PO (Direct Intake) --</option>
            {purchaseOrders.map(po => (
              <option key={po.id} value={po.id}>
                {po.po_number} ({po.status})
              </option>
            ))}
          </select>
        </div>

        {/* Dual Input Fields for Barcode Scans */}
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
            <button className="btn btn-primary btn-lg" onClick={executeScan} style={{ height: '54px' }}>
              <span>Receive</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Real-Time Scan Feedback Box */}
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

      {/* Simulator Tools for Rapid Paired Testing */}
      <div className="card" style={{ marginBottom: '24px', background: '#f8fafc' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={16} color="var(--primary)" />
            <strong style={{ fontSize: '13px' }}>Scanner Simulator & Quick Tools</strong>
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>No hardware required</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {testSampleParts.map((sample, idx) => (
            <button
              key={idx}
              className="btn btn-secondary btn-sm"
              onClick={() => handleSimulateScan(sample.pn, sample.sampleSerial)}
            >
              <span>+ Scan {sample.desc}</span>
            </button>
          ))}

          <div style={{ marginLeft: 'auto' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setIsImportModalOpen(true)}
              style={{ background: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UploadCloud size={14} color="var(--primary)" />
              <span>Upload Parts Spreadsheet</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inventory & Intake History Table (Persistent & Live) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0 }}>Received DC Stock & Intake History</h3>
              <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                <Check size={11} style={{ display: 'inline', marginRight: '3px' }} />
                Database Persisted
              </span>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
              Total DC In-Stock Units: <strong>{inventoryUnits.length}</strong> • Recent Session Intake: <strong>{sessionScans.length}</strong>
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* View Filter Switcher */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: 'var(--radius-md)' }}>
              <button
                className={`btn btn-sm ${activeTableView === 'ALL_DC_STOCK' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTableView('ALL_DC_STOCK')}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '4px' }}
              >
                All DC Stock ({inventoryUnits.length})
              </button>
              <button
                className={`btn btn-sm ${activeTableView === 'SESSION_SCANS' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTableView('SESSION_SCANS')}
                style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '4px' }}
              >
                Recent Session ({sessionScans.length})
              </button>
            </div>

            {/* Quick Search */}
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search P/N, serial..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '30px', paddingRight: '10px', height: '34px', fontSize: '12.5px', width: '100%' }}
              />
            </div>

            {sessionScans.length > 0 && activeTableView === 'SESSION_SCANS' && (
              <button className="btn btn-secondary btn-sm" onClick={handleClearSessionHistory} style={{ height: '34px' }}>
                Clear Session View
              </button>
            )}
          </div>
        </div>

        {displayedUnits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '13.5px' }}>
            {tableSearch ? (
              <span>No parts found matching "{tableSearch}". Try a different search term.</span>
            ) : activeTableView === 'ALL_DC_STOCK' ? (
              <span>No parts currently in DC inventory. Scan barcode or upload XLSX/CSV to receive parts.</span>
            ) : (
              <span>No units in recent session view. Switch to "All DC Stock ({inventoryUnits.length})" above to see all inventory.</span>
            )}
          </div>
        ) : (
          <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Part Number</th>
                  <th>Description</th>
                  <th>Serial Number</th>
                  <th>Intake Source</th>
                  <th>Timestamp</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {displayedUnits.map((unit, idx) => (
                  <tr key={unit.id || `${unit.serial_number}-${idx}`}>
                    <td className="font-mono">{idx + 1}</td>
                    <td className="font-mono"><strong>{unit.part_number}</strong></td>
                    <td>{unit.description}</td>
                    <td className="font-mono">{unit.serial_number}</td>
                    <td>
                      {unit.isImported || (unit.received_by && unit.received_by.includes('Import')) ? (
                        <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' }}>
                          <FileSpreadsheet size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          Spreadsheet Import
                        </span>
                      ) : (
                        <span className="badge" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
                          <Barcode size={12} style={{ display: 'inline', marginRight: '4px' }} />
                          Barcode Scan
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {unit.received_at ? new Date(unit.received_at).toLocaleTimeString() : 'Recent'}
                    </td>
                    <td>
                      <span className="badge badge-success">In Stock</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- XLSX / CSV Import Modal Dialog --- */}
      {isImportModalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setIsImportModalOpen(false); }}>
          <div className="modal-content">
            {/* Modal Header */}
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '8px' }}>
                  <FileSpreadsheet size={22} color="#38bdf8" />
                </div>
                <div>
                  <h3 style={{ color: '#fff', fontSize: '17px', margin: 0 }}>Import Parts (XLSX / CSV)</h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0 0' }}>
                    Bulk receive parts with serial numbers and save directly to persistent database
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Template Download & Options Row */}
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
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-main)' }}>Need a formatted template?</span>
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

              {/* Linked PO Selector inside modal */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px', color: 'var(--text-main)' }}>
                  Default Purchase Order for this Intake:
                </label>
                <select
                  className="form-select"
                  style={{ width: '100%', maxWidth: '450px' }}
                  value={modalPoId}
                  onChange={(e) => setModalPoId(e.target.value)}
                >
                  <option value="">-- No PO (Direct DC Intake) --</option>
                  {purchaseOrders.map(po => (
                    <option key={po.id} value={po.id}>
                      {po.po_number} ({po.status}) - {po.supplier || 'Apple Direct'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dropzone Area */}
              {!parsedBatch ? (
                <div
                  className={`dropzone ${isDragging ? 'active' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
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
                    {isDragging ? 'Drop your file here' : 'Click to browse or drag & drop file'}
                  </h4>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                    Supports Microsoft Excel (<strong>.xlsx, .xls</strong>) and <strong>.csv</strong> files
                  </p>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)', marginTop: '8px' }}>
                    Columns detected: Part Number, Serial Number, Description, PO Number, Box Number
                  </span>
                </div>
              ) : (
                /* Parsed Batch Results & Preview */
                <div>
                  {/* File Info Bar */}
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
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setParsedBatch(null); }}
                      style={{ fontSize: '12px', background: '#fff' }}
                    >
                      <RefreshCw size={12} style={{ display: 'inline', marginRight: '4px' }} />
                      Choose Different File
                    </button>
                  </div>

                  {/* Summary Metric Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    <div className="import-stat-card">
                      <span className="import-stat-label">Total Rows</span>
                      <span className="import-stat-value">{parsedBatch.summary.total}</span>
                    </div>
                    <div className="import-stat-card" style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
                      <span className="import-stat-label" style={{ color: '#16a34a' }}>Ready to Receive</span>
                      <span className="import-stat-value" style={{ color: '#16a34a' }}>{parsedBatch.summary.valid}</span>
                    </div>
                    <div className="import-stat-card" style={{ borderColor: parsedBatch.summary.duplicates > 0 ? '#fed7aa' : '#e2e8f0' }}>
                      <span className="import-stat-label" style={{ color: parsedBatch.summary.duplicates > 0 ? '#ea580c' : 'var(--text-muted)' }}>
                        Duplicates (Skip)
                      </span>
                      <span className="import-stat-value" style={{ color: parsedBatch.summary.duplicates > 0 ? '#ea580c' : 'var(--text-muted)' }}>
                        {parsedBatch.summary.duplicates}
                      </span>
                    </div>
                    <div className="import-stat-card" style={{ borderColor: parsedBatch.summary.newParts > 0 ? '#bae6fd' : '#e2e8f0' }}>
                      <span className="import-stat-label" style={{ color: parsedBatch.summary.newParts > 0 ? '#0284c7' : 'var(--text-muted)' }}>
                        New Catalog Parts
                      </span>
                      <span className="import-stat-value" style={{ color: parsedBatch.summary.newParts > 0 ? '#0284c7' : 'var(--text-muted)' }}>
                        {parsedBatch.summary.newParts}
                      </span>
                    </div>
                  </div>

                  {/* Filter tabs */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button
                      className={`btn btn-sm ${importFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setImportFilter('ALL')}
                    >
                      All ({parsedBatch.items.length})
                    </button>
                    <button
                      className={`btn btn-sm ${importFilter === 'VALID' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setImportFilter('VALID')}
                    >
                      Valid Only ({parsedBatch.summary.valid})
                    </button>
                    {parsedBatch.summary.duplicates > 0 && (
                      <button
                        className={`btn btn-sm ${importFilter === 'DUPLICATE' ? 'btn-danger' : 'btn-secondary'}`}
                        onClick={() => setImportFilter('DUPLICATE')}
                      >
                        Duplicates ({parsedBatch.summary.duplicates})
                      </button>
                    )}
                  </div>

                  {/* Preview Table */}
                  <div className="table-container" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    <table className="data-table" style={{ fontSize: '12.5px' }}>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Status</th>
                          <th>Part Number</th>
                          <th>Description</th>
                          <th>Serial Number</th>
                          <th>Target PO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPreviewItems.map((item) => (
                          <tr key={item.id}>
                            <td className="font-mono" style={{ fontSize: '11.5px' }}>#{item.rowNumber}</td>
                            <td>
                              {item.status === 'VALID' && (
                                <span className="badge badge-success" style={{ fontSize: '11px' }}>
                                  Ready
                                </span>
                              )}
                              {item.status === 'NEW_PART' && (
                                <span className="badge" style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '11px' }}>
                                  New Part
                                </span>
                              )}
                              {item.status === 'DUPLICATE' && (
                                <span className="badge" style={{ background: '#fee2e2', color: '#dc2626', fontSize: '11px' }}>
                                  Duplicate S/N
                                </span>
                              )}
                              {item.status === 'ERROR' && (
                                <span className="badge badge-danger" style={{ fontSize: '11px' }}>
                                  Error
                                </span>
                              )}
                            </td>
                            <td className="font-mono"><strong>{item.partNumber}</strong></td>
                            <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.description}
                            </td>
                            <td className="font-mono" style={{ fontSize: '11.5px' }}>{item.serialNumber}</td>
                            <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                              {item.poNumber || (modalPoId ? purchaseOrders.find(p => p.id === modalPoId)?.po_number : 'Direct Intake')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setIsImportModalOpen(false)}
              >
                Cancel
              </button>

              {parsedBatch && (
                <button
                  className="btn btn-primary"
                  onClick={handleConfirmBatchImport}
                  disabled={parsedBatch.summary.valid === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckCircle2 size={16} />
                  <span>Import & Receive {parsedBatch.summary.valid} Valid Parts</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
