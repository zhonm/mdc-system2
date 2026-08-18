import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { exportAllocationToExcel } from '../utils/excelParser';
import { calculateWeeklySplit } from '../utils/allocationEngine';
import {
  Split,
  Download,
  Sparkles,
  UploadCloud,
  Layers,
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle
} from 'lucide-react';

const CANONICAL_SITE_CODES = [
  'APP BHS', 'APP GB3', 'APP PPM', 'ASP GL5', 'ASP SMS', 'APP MOA', 'ASP POD',
  'APP MEG', 'APP ANX', 'APP TRI', 'ASP VN', 'ASP NES', 'APP PAM', 'ASP MRK',
  'APP ROB', 'ASP CEB', 'APP CDO', 'APP DAV', 'ASP TAC', 'ASP ILO', 'ASP BAC',
  'ASP ZAM', 'ASP BGO', 'ASP SGO', 'ASP LMA', 'ASP NPM'
];

export default function AllocationMatrix() {
  const {
    allocations,
    sites,
    parts,
    selectedCategory,
    updateSiteAllocation,
    runAutoAllocation,
    inventoryUnits,
    setActiveTab,
    showToast
  } = useApp();

  const [activeViewMode, setActiveViewMode] = useState('sheet'); // 'sheet' | 'monthly' | 'weekly' | 'shares'

  // Sort and filter service sites to match the canonical Google Sheet order
  const nonDcSites = sites.filter(s => !s.is_dc);
  const orderedServiceSites = [...nonDcSites].sort((a, b) => {
    const idxA = CANONICAL_SITE_CODES.findIndex(c => c.includes(a.code) || a.code.includes(c) || a.name.includes(c));
    const idxB = CANONICAL_SITE_CODES.findIndex(c => c.includes(b.code) || b.code.includes(c) || b.name.includes(c));
    if (idxA >= 0 && idxB >= 0) return idxA - idxB;
    if (idxA >= 0) return -1;
    if (idxB >= 0) return 1;
    return a.code.localeCompare(b.code);
  });

  // Filter items by category
  const filteredAllocations = allocations.filter(item => {
    const part = parts.find(p => p.id === item.part_id || p.part_number === item.part_number);
    if (!part) return true;
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'BATTERY') return part.category_id === 'cat-battery';
    if (selectedCategory === 'DISPLAY') return part.category_id === 'cat-display';
    if (selectedCategory === 'CAMERA') return part.category_id === 'cat-camera';
    if (selectedCategory === 'BACK_GLASS') return part.category_id === 'cat-backglass';
    return true;
  });

  // Split into Displays and Batteries
  const displayItems = filteredAllocations.filter(item => {
    const part = parts.find(p => p.id === item.part_id || p.part_number === item.part_number);
    return part?.category_id === 'cat-display' || item.description?.toLowerCase().includes('display') || item.description?.toLowerCase().includes('screen');
  });

  const batteryItems = filteredAllocations.filter(item => {
    const part = parts.find(p => p.id === item.part_id || p.part_number === item.part_number);
    return part?.category_id === 'cat-battery' || (!displayItems.includes(item) && (item.description?.toLowerCase().includes('battery') || item.description?.toLowerCase().includes('batt')));
  });

  const otherItems = filteredAllocations.filter(item => !displayItems.includes(item) && !batteryItems.includes(item));

  // Compute site column totals & financial breakdowns
  const totalAllocatedAllParts = filteredAllocations.reduce((sum, item) => sum + (item.total_allocated_qty || 0), 0);

  const siteTotals = {};
  const siteCostTotals = {};
  orderedServiceSites.forEach(s => {
    let sumQty = 0;
    let sumCost = 0;
    filteredAllocations.forEach(item => {
      const qty = item.site_quantities?.[s.id] || 0;
      const part = parts.find(p => p.id === item.part_id || p.part_number === item.part_number);
      const price = part?.stocking_price || (item.description?.toLowerCase().includes('display') ? 280 : 150);
      sumQty += qty;
      sumCost += qty * price;
    });
    siteTotals[s.id] = sumQty;
    siteCostTotals[s.id] = sumCost;
  });

  const grandTotalCost = Object.values(siteCostTotals).reduce((sum, c) => sum + c, 0);

  const handleExport = () => {
    if (filteredAllocations.length === 0) {
      showToast('No allocations available to export', 'warning');
      return;
    }
    exportAllocationToExcel(filteredAllocations, orderedServiceSites, 'August 2026');
    showToast('Exported Master Allocation to Excel', 'success');
  };

  const renderItemRow = (item, commodityLabel, index) => {
    const part = parts.find(p => p.id === item.part_id || p.part_number === item.part_number);
    const stockPrice = part?.stocking_price || (commodityLabel === 'DISPLAY' ? 280 : 150);
    const exchangePrice = part?.exchange_price || (commodityLabel === 'DISPLAY' ? 230 : 120);
    const split = calculateWeeklySplit(item.total_allocated_qty, index);
    const totalStockPrice = (item.total_allocated_qty || 0) * stockPrice;
    const isOrderRequired = (item.total_allocated_qty || 0) > 0;

    return (
      <tr key={item.part_id || item.part_number} style={{ background: isOrderRequired ? 'transparent' : '#fff5f5' }}>
        {/* Sticky Part Info */}
        <td style={{ position: 'sticky', left: 0, background: isOrderRequired ? '#fff' : '#fff5f5', zIndex: 5, fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
          {commodityLabel}
        </td>
        <td style={{ position: 'sticky', left: '70px', background: isOrderRequired ? '#fff' : '#fff5f5', zIndex: 5 }} className="font-mono">
          <strong>{item.part_number}</strong>
        </td>
        <td style={{ position: 'sticky', left: '170px', background: isOrderRequired ? '#fff' : '#fff5f5', zIndex: 5, whiteSpace: 'nowrap', fontSize: '12.5px' }}>
          {item.description}
        </td>

        {/* Pricing */}
        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          ${stockPrice.toFixed(2)}
        </td>
        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          ${exchangePrice.toFixed(2)}
        </td>

        {/* 26 Site Branch Quantities or Shares */}
        {activeViewMode === 'shares' ? (
          orderedServiceSites.map(s => {
            const qty = item.site_quantities?.[s.id] || 0;
            const share = item.total_allocated_qty > 0 ? ((qty / item.total_allocated_qty) * 100).toFixed(1) : '0.0';
            return (
              <td key={s.id} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11px', color: qty > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
                {share}%
              </td>
            );
          })
        ) : (
          orderedServiceSites.map(s => {
            const qty = item.site_quantities?.[s.id] || 0;
            return (
              <td key={s.id} style={{ textAlign: 'center', padding: '3px' }}>
                <input
                  type="number"
                  className="matrix-cell-input"
                  value={qty === 0 ? '' : qty}
                  placeholder="0"
                  onChange={(e) => updateSiteAllocation(item.part_id, s.id, e.target.value)}
                  style={{
                    width: '36px',
                    height: '24px',
                    fontSize: '11px',
                    textAlign: 'center',
                    background: qty > 0 ? '#eff6ff' : '#fff',
                    borderColor: qty > 0 ? '#93c5fd' : '#e2e8f0',
                    fontWeight: qty > 0 ? 600 : 400
                  }}
                />
              </td>
            );
          })
        )}

        {/* Total Alloc */}
        <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', background: isOrderRequired ? '#e0f2fe' : '#fee2e2', color: isOrderRequired ? '#0369a1' : '#b91c1c' }}>
          {item.total_allocated_qty || 0}
        </td>

        {/* Total Value */}
        <td style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
          ${totalStockPrice.toLocaleString()}
        </td>

        {/* 4-Week Split */}
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{split.week1}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{split.week2}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{split.week3}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{split.week4}</td>

        {/* Remarks Badge */}
        <td style={{ textAlign: 'center' }}>
          <span
            className={`badge ${isOrderRequired ? 'badge-success' : 'badge-neutral'}`}
            style={{ fontSize: '10px', padding: '3px 6px', whiteSpace: 'nowrap' }}
          >
            {isOrderRequired ? 'ORDER REQUIRED' : 'NO NEED TO ORDER'}
          </span>
        </td>

        {/* Auto Allocate Trigger */}
        <td style={{ textAlign: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '10.5px', padding: '2px 6px' }}
            onClick={() => runAutoAllocation(item.part_id, item.total_allocated_qty || 10)}
            title="Distribute proportionally using Hamilton-Hare quota allocation"
          >
            <Sparkles size={11} color="var(--primary)" />
            <span>Fair Split</span>
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="allocation-view" style={{ maxWidth: '100%' }}>
      {/* Header & Controls */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Split size={20} color="var(--primary)" />
              <h3 style={{ margin: 0, fontSize: '18px' }}>Master Parts Allocation Matrix</h3>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Multi-site proportional distribution across 26 branches matching Google Sheet Master Allocation structure.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* View Modes */}
            <div style={{ display: 'flex', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '3px' }}>
              <button
                className={`btn btn-sm ${activeViewMode === 'sheet' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveViewMode('sheet')}
                style={{ border: 'none', fontSize: '12px' }}
                disabled={filteredAllocations.length === 0}
              >
                Full Master Matrix
              </button>
              <button
                className={`btn btn-sm ${activeViewMode === 'shares' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveViewMode('shares')}
                style={{ border: 'none', fontSize: '12px' }}
                disabled={filteredAllocations.length === 0}
              >
                Site Share %
              </button>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExport}
              disabled={filteredAllocations.length === 0}
            >
              <Download size={14} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Summary Bar */}
        {filteredAllocations.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Parts Allocated</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--primary)' }}>{totalAllocatedAllParts} units</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Service Branches</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>{orderedServiceSites.length} sites</div>
            </div>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Master Value</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#15803d' }}>${grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>
        )}
      </div>

      {/* Empty State or Master Matrix Grid */}
      {filteredAllocations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px', border: '1px dashed var(--border-strong)' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px'
            }}
          >
            <Split size={30} />
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--text-main)' }}>
            No Master Allocations Yet
          </h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            Upload your masterlist / allocation file in Fixably / GSX Data Import to populate the 26-site allocation grid and 4-week splits.
          </p>
          <button className="btn btn-primary" onClick={() => setActiveTab('import')}>
            <UploadCloud size={16} />
            <span>Go to Fixably / GSX Data Import</span>
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
          <div className="allocation-matrix-container" style={{ maxHeight: '720px', overflowX: 'auto', overflowY: 'auto' }}>
            <table className="data-table" style={{ fontSize: '12px', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', top: 0, left: 0, background: '#1e293b', color: '#fff', zIndex: 20 }}>Commodity</th>
                  <th style={{ position: 'sticky', top: 0, left: '70px', background: '#1e293b', color: '#fff', zIndex: 20 }}>Part #</th>
                  <th style={{ position: 'sticky', top: 0, left: '170px', background: '#1e293b', color: '#fff', zIndex: 20 }}>Description</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#fff', textAlign: 'right', zIndex: 10 }}>Stock Price</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#fff', textAlign: 'right', zIndex: 10 }}>Exch Price</th>

                  {/* 26 Site Columns */}
                  {orderedServiceSites.map(s => (
                    <th
                      key={s.id}
                      style={{
                        position: 'sticky',
                        top: 0,
                        background: '#0f172a',
                        color: '#38bdf8',
                        textAlign: 'center',
                        fontSize: '11px',
                        padding: '8px 4px',
                        whiteSpace: 'nowrap',
                        zIndex: 10
                      }}
                      title={s.name}
                    >
                      {s.code}
                    </th>
                  ))}

                  <th style={{ position: 'sticky', top: 0, background: '#0369a1', color: '#fff', textAlign: 'center', zIndex: 10 }}>Total Alloc</th>
                  <th style={{ position: 'sticky', top: 0, background: '#0284c7', color: '#fff', textAlign: 'right', zIndex: 10 }}>Total Value</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#fff', textAlign: 'center', zIndex: 10 }}>W1</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#fff', textAlign: 'center', zIndex: 10 }}>W2</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#fff', textAlign: 'center', zIndex: 10 }}>W3</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#fff', textAlign: 'center', zIndex: 10 }}>W4</th>
                  <th style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#fff', textAlign: 'center', zIndex: 10 }}>Remarks</th>
                  <th style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#fff', textAlign: 'center', zIndex: 10 }}>Action</th>
                </tr>
              </thead>

              <tbody>
                {/* DISPLAY SECTION */}
                {displayItems.length > 0 && (
                  <>
                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid var(--border-strong)' }}>
                      <td colSpan={orderedServiceSites.length + 12} style={{ padding: '8px 12px', fontWeight: 800, fontSize: '13px', color: '#0f172a', letterSpacing: '0.05em' }}>
                        📱 DISPLAY COMMODITY ({displayItems.length} Parts)
                      </td>
                    </tr>
                    {displayItems.map((item, idx) => renderItemRow(item, 'DISPLAY', idx))}
                  </>
                )}

                {/* BATTERY SECTION */}
                {batteryItems.length > 0 && (
                  <>
                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid var(--border-strong)' }}>
                      <td colSpan={orderedServiceSites.length + 12} style={{ padding: '8px 12px', fontWeight: 800, fontSize: '13px', color: '#0f172a', letterSpacing: '0.05em' }}>
                        🔋 BATTERY COMMODITY ({batteryItems.length} Parts)
                      </td>
                    </tr>
                    {batteryItems.map((item, idx) => renderItemRow(item, 'BATTERY', idx + displayItems.length))}
                  </>
                )}

                {/* OTHER ITEMS */}
                {otherItems.length > 0 && (
                  <>
                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid var(--border-strong)' }}>
                      <td colSpan={orderedServiceSites.length + 12} style={{ padding: '8px 12px', fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>
                        OTHER COMMODITIES ({otherItems.length} Parts)
                      </td>
                    </tr>
                    {otherItems.map((item, idx) => renderItemRow(item, 'OTHER', idx + displayItems.length + batteryItems.length))}
                  </>
                )}
              </tbody>

              {/* FOOTER TOTAL ROWS MATCHING GOOGLE SHEET */}
              <tfoot>
                {/* 1. Total Parts per Site Row */}
                <tr style={{ position: 'sticky', bottom: '34px', background: '#0f172a', color: '#f8fafc', fontWeight: 700, zIndex: 15 }}>
                  <td colSpan={3} style={{ position: 'sticky', left: 0, background: '#0f172a', zIndex: 16 }}>
                    TOTAL PARTS PER SITE
                  </td>
                  <td></td>
                  <td></td>
                  {orderedServiceSites.map(s => (
                    <td key={s.id} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontSize: '12px' }}>
                      {siteTotals[s.id] || 0}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', background: '#0284c7', color: '#fff', fontSize: '13px' }}>
                    {totalAllocatedAllParts}
                  </td>
                  <td style={{ textAlign: 'right', color: '#4ade80' }}>
                    ${grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={6}></td>
                </tr>

                {/* 2. Total Cost Breakdown per Site Row */}
                <tr style={{ position: 'sticky', bottom: 0, background: '#1e293b', color: '#cbd5e1', fontWeight: 600, zIndex: 15, fontSize: '11px' }}>
                  <td colSpan={3} style={{ position: 'sticky', left: 0, background: '#1e293b', zIndex: 16 }}>
                    TOTAL COST BREAKDOWN PER SITE
                  </td>
                  <td></td>
                  <td></td>
                  {orderedServiceSites.map(s => (
                    <td key={s.id} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                      ${Math.round(siteCostTotals[s.id] || 0).toLocaleString()}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', background: '#0369a1', color: '#fff' }}>
                    ${grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td colSpan={7}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
