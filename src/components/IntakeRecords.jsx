import { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import SaveIntakeRecordModal from './SaveIntakeRecordModal';
import * as XLSX from 'xlsx';
import {
  BookmarkPlus,
  Package,
  Calendar,
  User,
  Search,
  Printer,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Barcode,
  FileSpreadsheet,
  X,
  Tag,
  Plus
} from 'lucide-react';

export default function IntakeRecords() {
  const {
    dcIntakeRecords,
    deleteIntakeRecord,
    inventoryUnits,
    setActiveTab,
    showToast
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [yearFilter, setYearFilter] = useState('ALL');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [selectedRecordToInspect, setSelectedRecordToInspect] = useState(null);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [inspectSearch, setInspectSearch] = useState('');

  // Active in-stock units currently in DC (e.g. today's scans)
  const todayDateStr = new Date().toISOString().split('T')[0];
  const todayScannedUnits = useMemo(() => {
    return (inventoryUnits || []).filter(u => {
      if (!u.received_at) return false;
      return u.received_at.startsWith(todayDateStr);
    });
  }, [inventoryUnits, todayDateStr]);

  // Overall metric calculations
  const totalRecordsCount = dcIntakeRecords.length;
  const totalUnitsAcrossBatches = useMemo(() => {
    return dcIntakeRecords.reduce((sum, r) => sum + (r.total_units || (r.items ? r.items.length : 0)), 0);
  }, [dcIntakeRecords]);

  // Derive unique years for filter
  const availableYears = useMemo(() => {
    const years = new Set();
    dcIntakeRecords.forEach(r => {
      if (r.intake_date) {
        const y = new Date(r.intake_date).getFullYear();
        if (!isNaN(y)) years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [dcIntakeRecords]);

  // Filtered records
  const filteredRecords = useMemo(() => {
    return dcIntakeRecords.filter(rec => {
      // Year filter
      if (yearFilter !== 'ALL' && rec.intake_date) {
        const y = new Date(rec.intake_date).getFullYear();
        if (String(y) !== String(yearFilter)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchId = rec.id?.toLowerCase().includes(q);
        const matchName = rec.record_name?.toLowerCase().includes(q);
        const matchUser = rec.saved_by_name?.toLowerCase().includes(q);
        const matchPo = rec.po_number?.toLowerCase().includes(q);
        const matchNotes = rec.notes?.toLowerCase().includes(q);
        const matchSupplier = rec.supplier?.toLowerCase().includes(q);

        // Also search within items (part numbers / serial numbers)
        const matchItems = (rec.items || []).some(
          it =>
            it.part_number?.toLowerCase().includes(q) ||
            it.serial_number?.toLowerCase().includes(q) ||
            it.description?.toLowerCase().includes(q)
        );

        if (!matchId && !matchName && !matchUser && !matchPo && !matchNotes && !matchSupplier && !matchItems) {
          return false;
        }
      }
      return true;
    });
  }, [dcIntakeRecords, yearFilter, searchQuery]);

  // Export batch to Excel (.xlsx)
  const handleExportExcel = (record) => {
    if (!record || !record.items || record.items.length === 0) {
      showToast('No items in this intake record to export', 'error');
      return;
    }

    const rows = record.items.map((it, idx) => ({
      '#': idx + 1,
      'Batch Record ID': record.id,
      'Intake Date': record.intake_date,
      'Part Number': it.part_number,
      'Description': it.description || 'Service Replacement Part',
      'Serial Number': it.serial_number,
      'Received At': it.received_at ? new Date(it.received_at).toLocaleString() : '',
      'Received By': it.received_by || record.saved_by_name || 'Warehouse Staff',
      'Linked PO': record.po_number || 'Direct Intake'
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Intake Manifest');
    XLSX.writeFile(wb, `${record.id}_Intake_Manifest.xlsx`);
    showToast(`Downloaded ${record.id} Excel Intake Manifest`, 'success');
  };

  // Direct Print Intake Slip
  const handlePrintSlip = (record) => {
    if (!record) return;
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) {
      showToast('Please allow popups to print intake slip', 'warning');
      return;
    }

    const itemsHtml = (record.items || [])
      .map(
        (it, idx) => `
      <tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${idx + 1}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: bold;">${it.part_number}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0;">${it.description || ''}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace;">${it.serial_number}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">${it.received_at ? new Date(it.received_at).toLocaleTimeString() : ''}</td>
      </tr>
    `
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DC Intake Slip - ${record.id}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #0f172a; }
            .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
            .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 20px; background: #f8fafc; padding: 14px; border-radius: 6px; }
            table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12px; }
            th { background: #f1f5f9; padding: 8px 10px; border-bottom: 2px solid #cbd5e1; text-transform: uppercase; font-size: 11px; }
            .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #cbd5e1; display: flex; justify-content: space-between; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h2 style="margin: 0 0 4px 0;">MOBILE CARE SERVICES PHILS. INC.</h2>
              <p style="margin: 0; color: #475569; font-size: 13px;">Distribution Center Intake & Verification Manifest</p>
            </div>
            <div style="text-align: right;">
              <h3 style="margin: 0; color: #0284c7; font-family: monospace;">${record.id}</h3>
              <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Intake Date: ${record.intake_date}</p>
            </div>
          </div>

          <div class="meta-grid">
            <div><strong>Recorded By:</strong><br>${record.saved_by_name || 'Warehouse Staff'}</div>
            <div><strong>Linked PO:</strong><br>${record.po_number || 'Direct Intake'}</div>
            <div><strong>Total Parts Received:</strong><br><span style="font-size: 16px; font-weight: bold; color: #0284c7;">${record.total_units} units</span></div>
          </div>

          ${record.notes ? `<div style="margin-bottom: 16px; font-size: 12.5px;"><strong>Remarks / Notes:</strong> ${record.notes}</div>` : ''}

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Part Number</th>
                <th>Description</th>
                <th>Serial Number</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="footer">
            <div>Received & Verified by: _______________________</div>
            <div>Authorized Signature: _______________________</div>
          </div>

          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleConfirmDelete = async () => {
    if (!recordToDelete) return;
    await deleteIntakeRecord(recordToDelete.id);
    setRecordToDelete(null);
    if (selectedRecordToInspect?.id === recordToDelete.id) {
      setSelectedRecordToInspect(null);
    }
  };

  // Inspect modal filtered items
  const filteredInspectItems = useMemo(() => {
    if (!selectedRecordToInspect || !selectedRecordToInspect.items) return [];
    if (!inspectSearch.trim()) return selectedRecordToInspect.items;
    const q = inspectSearch.toLowerCase().trim();
    return selectedRecordToInspect.items.filter(
      it =>
        it.part_number?.toLowerCase().includes(q) ||
        it.serial_number?.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q)
    );
  }, [selectedRecordToInspect, inspectSearch]);

  return (
    <div className="intake-records-container" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Top Banner / Hero Header */}
      <div style={{
        background: '#0f172a',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 30px',
        color: '#fff',
        marginBottom: '24px',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '6px', borderRadius: '8px' }}>
              <BookmarkPlus size={24} color="#38bdf8" />
            </div>
            <h2 style={{ color: '#fff', margin: 0, fontSize: '22px' }}>DC Intake Batch Records</h2>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
            Standardized Intake History (<code>MDC[YYYY][00000]</code>) • Serialized Part Tracking • Cloud Database Persisted
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setActiveTab('scan-in')}
            style={{
              background: '#1e293b',
              color: '#38bdf8',
              borderColor: '#38bdf8',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '36px'
            }}
          >
            <Barcode size={16} />
            <span>Scan-In Workstation (F1)</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => setIsSaveModalOpen(true)}
            disabled={todayScannedUnits.length === 0}
            style={{
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600
            }}
            title={todayScannedUnits.length > 0 ? "Save currently scanned parts as a permanent Intake Record" : "Scan parts first in Receive Scan-In page to save a record"}
          >
            <Plus size={16} />
            <span>Save Intake Record ({todayScannedUnits.length})</span>
          </button>
        </div>
      </div>

      {/* Summary Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: 600 }}>Total Saved Batches</span>
            <BookmarkPlus size={18} color="var(--primary)" />
          </div>
          <h3 style={{ fontSize: '24px', margin: '6px 0 2px 0', fontWeight: 700 }}>{totalRecordsCount}</h3>
          <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>Permanent records archived</span>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', color: '#047857', fontWeight: 600 }}>Total Units Archived</span>
            <Package size={18} color="#10b981" />
          </div>
          <h3 style={{ fontSize: '24px', margin: '6px 0 2px 0', fontWeight: 700, color: '#047857' }}>
            {totalUnitsAcrossBatches}
          </h3>
          <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>Serialized parts verified</span>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', color: '#0284c7', fontWeight: 600 }}>Today's Scanned Stock</span>
            <Calendar size={18} color="#0284c7" />
          </div>
          <h3 style={{ fontSize: '24px', margin: '6px 0 2px 0', fontWeight: 700, color: '#0284c7' }}>
            {todayScannedUnits.length}
          </h3>
          <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>Units received on {todayDateStr}</span>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12.5px', color: '#6d28d9', fontWeight: 600 }}>Latest Record Sequence</span>
            <Tag size={18} color="#8b5cf6" />
          </div>
          <h3 style={{ fontSize: '20px', margin: '6px 0 2px 0', fontWeight: 700, color: '#6d28d9', fontFamily: 'var(--font-mono)' }}>
            {dcIntakeRecords[0]?.id || 'MDC202600001'}
          </h3>
          <span style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>
            {dcIntakeRecords[0] ? `Saved by ${dcIntakeRecords[0].saved_by_name}` : 'Ready to create'}
          </span>
        </div>
      </div>

      {/* Main Card with Records Table */}
      <div className="card">
        {/* Table Header & Controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0 }}>All DC Intake Records</h3>
              <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
                <CheckCircle2 size={11} style={{ display: 'inline', marginRight: '3px' }} />
                Multi-User Synced
              </span>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Showing {filteredRecords.length} of {totalRecordsCount} intake batch records
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Year filter */}
            {availableYears.length > 0 && (
              <select
                className="form-select"
                style={{ width: 'auto', height: '34px', fontSize: '12.5px' }}
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
              >
                <option value="ALL">All Years</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}

            {/* Quick Search */}
            <div style={{ position: 'relative', width: '260px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search record ID, S/N, P/N, PO..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12.5px', width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Data Table */}
        {filteredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <BookmarkPlus size={36} color="var(--border-strong)" style={{ marginBottom: '12px' }} />
            <h4 style={{ fontSize: '16px', color: 'var(--text-main)', marginBottom: '4px' }}>No Intake Records Found</h4>
            <p style={{ fontSize: '13px', maxWidth: '440px', margin: '0 auto 16px auto' }}>
              {searchQuery
                ? `No records matching "${searchQuery}". Try a different search term.`
                : 'Receive parts in the Scan-In Station and click "Save Intake Record" to create your first permanent intake batch record.'}
            </p>
            {todayScannedUnits.length > 0 && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setIsSaveModalOpen(true)}
              >
                <Plus size={14} />
                <span>Save Today's {todayScannedUnits.length} Scanned Parts</span>
              </button>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Record ID / Batch</th>
                  <th>Intake Date</th>
                  <th>Operator (Saved By)</th>
                  <th>Total Units</th>
                  <th>Parts Breakdown</th>
                  <th>Linked PO</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec, idx) => (
                  <tr key={rec.id}>
                    <td className="font-mono">{idx + 1}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          border: '1px solid #bae6fd',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSelectedRecordToInspect(rec)}
                        title="Click to inspect batch details"
                      >
                        <Tag size={11} style={{ display: 'inline', marginRight: '3px' }} />
                        {rec.id}
                      </span>
                    </td>
                    <td style={{ fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                      {rec.intake_date}
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px' }}>
                        <User size={13} color="var(--text-muted)" />
                        <strong>{rec.saved_by_name || 'Warehouse Staff'}</strong>
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-success" style={{ fontSize: '11.5px' }}>
                        {rec.total_units} units
                      </span>
                    </td>
                    <td style={{ maxWidth: '240px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {Object.entries(rec.category_breakdown || {}).map(([cat, cnt]) => (
                          <span
                            key={cat}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              borderRadius: '4px',
                              padding: '1px 6px',
                              fontSize: '11px',
                              color: '#475569'
                            }}
                          >
                            <strong>{cnt}</strong> {cat}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {rec.po_number || rec.supplier || 'Direct Intake'}
                    </td>
                    <td style={{ maxWidth: '200px', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {rec.notes || '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedRecordToInspect(rec)}
                          style={{ padding: '4px 8px', fontSize: '11.5px' }}
                          title="Inspect full serialized units"
                        >
                          <Eye size={13} />
                          <span>Inspect</span>
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleExportExcel(rec)}
                          style={{ padding: '4px 8px', fontSize: '11.5px' }}
                          title="Export to Excel (.xlsx)"
                        >
                          <FileSpreadsheet size={13} color="#16a34a" />
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handlePrintSlip(rec)}
                          style={{ padding: '4px 8px', fontSize: '11.5px' }}
                          title="Print Intake Slip"
                        >
                          <Printer size={13} color="#0284c7" />
                        </button>

                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setRecordToDelete(rec)}
                          style={{ padding: '4px 8px', color: '#ef4444', borderColor: '#fca5a5' }}
                          title="Delete Record"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Save Intake Record Modal */}
      <SaveIntakeRecordModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        initialUnits={todayScannedUnits.length > 0 ? todayScannedUnits : (inventoryUnits || []).slice(0, 50)}
        onSaved={(newRec) => {
          try {
            localStorage.removeItem('mdc_recent_scans');
          } catch (e) {}
          setSelectedRecordToInspect(newRec);
        }}
      />

      {/* Serialized Batch Inspector Modal */}
      {selectedRecordToInspect && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setSelectedRecordToInspect(null); }}>
          <div className="modal-content" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: '8px', borderRadius: '8px' }}>
                  <Tag size={22} color="#38bdf8" />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ color: '#fff', fontSize: '18px', margin: 0, fontFamily: 'var(--font-mono)' }}>
                      {selectedRecordToInspect.id}
                    </h3>
                    <span className="badge badge-success" style={{ fontSize: '11px' }}>
                      {selectedRecordToInspect.total_units} Parts
                    </span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0 0' }}>
                    Intake Date: {selectedRecordToInspect.intake_date} • Recorded by: {selectedRecordToInspect.saved_by_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecordToInspect(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto' }}>
              {/* Batch Metadata Row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                background: '#f8fafc',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                border: '1px solid #e2e8f0',
                fontSize: '12.5px'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Purchase Order</span>
                  <strong>{selectedRecordToInspect.po_number || 'Direct Intake'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Supplier / Source</span>
                  <strong>{selectedRecordToInspect.supplier || 'Apple Direct'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '11px', textTransform: 'uppercase' }}>Record Created</span>
                  <strong>{new Date(selectedRecordToInspect.created_at).toLocaleString()}</strong>
                </div>
              </div>

              {selectedRecordToInspect.notes && (
                <div style={{ background: '#f1f5f9', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '12.5px' }}>
                  <strong>Notes:</strong> {selectedRecordToInspect.notes}
                </div>
              )}

              {/* Items Search and Action Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: '240px' }}>
                  <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search serial / part in batch..."
                    value={inspectSearch}
                    onChange={(e) => setInspectSearch(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '28px', height: '32px', fontSize: '12px', width: '100%' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleExportExcel(selectedRecordToInspect)}
                    style={{ fontSize: '12px' }}
                  >
                    <FileSpreadsheet size={13} color="#16a34a" />
                    <span>Export Excel</span>
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handlePrintSlip(selectedRecordToInspect)}
                    style={{ fontSize: '12px' }}
                  >
                    <Printer size={13} color="#0284c7" />
                    <span>Print Slip</span>
                  </button>
                </div>
              </div>

              {/* Serialized Table */}
              <div className="table-container" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                <table className="data-table" style={{ fontSize: '12.5px' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Part Number</th>
                      <th>Description</th>
                      <th>Serial Number</th>
                      <th>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInspectItems.map((it, idx) => (
                      <tr key={it.id || `${it.serial_number}-${idx}`}>
                        <td className="font-mono">{idx + 1}</td>
                        <td className="font-mono"><strong>{it.part_number}</strong></td>
                        <td>{it.description || 'Replacement Part'}</td>
                        <td className="font-mono">{it.serial_number}</td>
                        <td style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {it.received_at ? new Date(it.received_at).toLocaleTimeString() : 'Recent'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setSelectedRecordToInspect(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {recordToDelete && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setRecordToDelete(null); }}>
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={20} color="#ef4444" />
                <h3 style={{ color: '#fff', fontSize: '17px', margin: 0 }}>Delete Intake Record?</h3>
              </div>
              <button
                onClick={() => setRecordToDelete(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '13.5px', color: 'var(--text-main)', margin: '0 0 10px 0' }}>
                Are you sure you want to delete record <strong>{recordToDelete.id}</strong>?
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                This will remove the saved intake batch from the database archive. Actual in-stock inventory units will remain intact in DC.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setRecordToDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleConfirmDelete}>Delete Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
