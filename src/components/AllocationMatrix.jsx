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
  Package,
  Building2,
  TrendingUp,
  Percent,
  CheckCircle2,
  Smartphone,
  BatteryCharging
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

  const [activeViewMode, setActiveViewMode] = useState('sheet'); // 'sheet' | 'shares'

  // Sort and filter service sites to match canonical Google Sheet order
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

  // Split into Displays, Batteries, and Other
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
    const rowBg = isOrderRequired ? '#ffffff' : '#fef2f2';

    return (
      <tr key={item.part_id || item.part_number} style={{ background: rowBg }}>
        {/* Sticky 1: Commodity Label */}
        <td className="matrix-col-sticky-1" style={{ background: rowBg, textAlign: 'center' }}>
          <span style={{
            display: 'inline-block',
            fontSize: '10.5px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '4px',
            background: commodityLabel === 'DISPLAY' ? '#e0f2fe' : commodityLabel === 'BATTERY' ? '#dcfce7' : '#f1f5f9',
            color: commodityLabel === 'DISPLAY' ? '#0369a1' : commodityLabel === 'BATTERY' ? '#15803d' : '#475569',
            letterSpacing: '0.02em'
          }}>
            {commodityLabel}
          </span>
        </td>

        {/* Sticky 2: Part # */}
        <td className="matrix-col-sticky-2 font-mono" style={{ background: rowBg, fontWeight: 700, color: '#0f172a', fontSize: '11.5px' }}>
          {item.part_number}
        </td>

        {/* Sticky 3: Description */}
        <td className="matrix-col-sticky-3" style={{ background: rowBg, color: '#1e293b', fontSize: '12px', fontWeight: 500 }}>
          {item.description}
        </td>

        {/* Stock Price */}
        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: '#0f172a' }}>
          ${stockPrice.toFixed(2)}
        </td>

        {/* Exch Price */}
        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500, color: '#475569' }}>
          ${exchangePrice.toFixed(2)}
        </td>

        {/* 26 Site Branch Quantities or Shares */}
        {activeViewMode === 'shares' ? (
          orderedServiceSites.map(s => {
            const qty = item.site_quantities?.[s.id] || 0;
            const share = item.total_allocated_qty > 0 ? ((qty / item.total_allocated_qty) * 100).toFixed(1) : '0.0';
            const hasShare = qty > 0;
            return (
              <td key={s.id} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: hasShare ? 700 : 400, color: hasShare ? '#0284c7' : '#94a3b8' }}>
                {share}%
              </td>
            );
          })
        ) : (
          orderedServiceSites.map(s => {
            const qty = item.site_quantities?.[s.id] || 0;
            const hasValue = qty > 0;
            return (
              <td key={s.id} style={{ textAlign: 'center', padding: '3px 2px' }}>
                <input
                  type="number"
                  className={`matrix-cell-input ${hasValue ? 'has-value' : 'is-zero'}`}
                  value={qty === 0 ? '' : qty}
                  placeholder="0"
                  onChange={(e) => updateSiteAllocation(item.part_id, s.id, e.target.value)}
                />
              </td>
            );
          })
        )}

        {/* Total Alloc */}
        <td style={{
          textAlign: 'center',
          fontWeight: 800,
          fontFamily: 'var(--font-mono)',
          fontSize: '12.5px',
          background: isOrderRequired ? '#e0f2fe' : '#fee2e2',
          color: isOrderRequired ? '#0369a1' : '#b91c1c'
        }}>
          {item.total_allocated_qty || 0}
        </td>

        {/* Total Value */}
        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#0f172a' }}>
          ${totalStockPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>

        {/* 4-Week Split */}
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: '#334155', background: '#f8fafc' }}>{split.week1}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: '#334155', background: '#f8fafc' }}>{split.week2}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: '#334155', background: '#f8fafc' }}>{split.week3}</td>
        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: '#334155', background: '#f8fafc' }}>{split.week4}</td>

        {/* Remarks Badge */}
        <td style={{ textAlign: 'center' }}>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              letterSpacing: '0.03em',
              display: 'inline-block',
              background: isOrderRequired ? '#dcfce7' : '#f1f5f9',
              color: isOrderRequired ? '#15803d' : '#64748b',
              border: isOrderRequired ? '1px solid #86efac' : '1px solid #cbd5e1'
            }}
          >
            {isOrderRequired ? 'ORDER REQUIRED' : 'NO NEED TO ORDER'}
          </span>
        </td>

        {/* Auto Allocate Trigger */}
        <td style={{ textAlign: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '11px', padding: '3px 8px', borderColor: '#cbd5e1', color: '#0369a1', fontWeight: 600 }}
            onClick={() => runAutoAllocation(item.part_id, item.total_allocated_qty || 10)}
            title="Distribute proportionally using Hamilton-Hare quota allocation"
          >
            <Sparkles size={12} color="#0284c7" />
            <span>Fair Split</span>
          </button>
        </td>
      </tr>
    );
  };

  return (
    <div className="allocation-view" style={{ maxWidth: '100%' }}>
      {/* Header & Controls Card */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Split size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                  Master Parts Allocation Matrix
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
                  Multi-site proportional distribution across 26 branches matching Google Sheet Master Allocation structure.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* View Mode Switcher */}
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 'var(--radius-sm)', padding: '3px', border: '1px solid #e2e8f0' }}>
              <button
                className={`btn btn-sm ${activeViewMode === 'sheet' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveViewMode('sheet')}
                style={{ border: 'none', fontSize: '12px', padding: '5px 12px', fontWeight: 600 }}
                disabled={filteredAllocations.length === 0}
              >
                Full Master Matrix
              </button>
              <button
                className={`btn btn-sm ${activeViewMode === 'shares' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveViewMode('shares')}
                style={{ border: 'none', fontSize: '12px', padding: '5px 12px', fontWeight: 600 }}
                disabled={filteredAllocations.length === 0}
              >
                Site Share %
              </button>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExport}
              disabled={filteredAllocations.length === 0}
              style={{ fontWeight: 600, padding: '6px 14px' }}
            >
              <Download size={14} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* High Contrast KPI Summary Bar */}
        {filteredAllocations.length > 0 && (
          <div className="matrix-kpi-grid">
            <div className="matrix-kpi-card">
              <div className="matrix-kpi-icon-wrap" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                <Package size={22} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Total Parts Allocated
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0369a1', fontFamily: 'var(--font-mono)' }}>
                  {totalAllocatedAllParts.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>units</span>
                </div>
              </div>
            </div>

            <div className="matrix-kpi-card">
              <div className="matrix-kpi-icon-wrap" style={{ background: '#f1f5f9', color: '#334155' }}>
                <Building2 size={22} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Active Service Branches
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
                  {orderedServiceSites.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>sites</span>
                </div>
              </div>
            </div>

            <div className="matrix-kpi-card">
              <div className="matrix-kpi-icon-wrap" style={{ background: '#dcfce7', color: '#15803d' }}>
                <DollarSign size={22} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                  Total Master Value
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: '#15803d', fontFamily: 'var(--font-mono)' }}>
                  ${grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
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
        <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: 'var(--shadow-md)', border: '1px solid #cbd5e1' }}>
          <div className="allocation-matrix-container">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="matrix-th-sticky-1" style={{ width: '80px', minWidth: '80px', textAlign: 'center' }}>
                    Commodity
                  </th>
                  <th className="matrix-th-sticky-2" style={{ width: '100px', minWidth: '100px' }}>
                    Part #
                  </th>
                  <th className="matrix-th-sticky-3" style={{ minWidth: '240px', maxWidth: '280px' }}>
                    Description
                  </th>
                  <th style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#f8fafc', textAlign: 'right', zIndex: 12, minWidth: '85px' }}>
                    Stock Price
                  </th>
                  <th style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#cbd5e1', textAlign: 'right', zIndex: 12, minWidth: '85px' }}>
                    Exch Price
                  </th>

                  {/* 26 Site Branch Headers */}
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
                        fontWeight: 700,
                        padding: '10px 4px',
                        whiteSpace: 'nowrap',
                        zIndex: 12,
                        minWidth: '46px'
                      }}
                      title={s.name}
                    >
                      {s.code}
                    </th>
                  ))}

                  <th style={{ position: 'sticky', top: 0, background: '#0369a1', color: '#ffffff', textAlign: 'center', zIndex: 12, minWidth: '80px', fontWeight: 700 }}>
                    Total Alloc
                  </th>
                  <th style={{ position: 'sticky', top: 0, background: '#0284c7', color: '#ffffff', textAlign: 'right', zIndex: 12, minWidth: '95px', fontWeight: 700 }}>
                    Total Value
                  </th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#f8fafc', textAlign: 'center', zIndex: 12, width: '38px' }}>W1</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#f8fafc', textAlign: 'center', zIndex: 12, width: '38px' }}>W2</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#f8fafc', textAlign: 'center', zIndex: 12, width: '38px' }}>W3</th>
                  <th style={{ position: 'sticky', top: 0, background: '#334155', color: '#f8fafc', textAlign: 'center', zIndex: 12, width: '38px' }}>W4</th>
                  <th style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#f8fafc', textAlign: 'center', zIndex: 12, minWidth: '140px' }}>
                    Remarks
                  </th>
                  <th style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#f8fafc', textAlign: 'center', zIndex: 12, minWidth: '95px' }}>
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {/* DISPLAY SECTION */}
                {displayItems.length > 0 && (
                  <>
                    <tr className="matrix-category-header">
                      <td colSpan={orderedServiceSites.length + 12}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Smartphone size={16} color="#0284c7" />
                          <span>DISPLAY COMMODITY</span>
                          <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '999px', fontWeight: 700 }}>
                            {displayItems.length} Parts
                          </span>
                        </div>
                      </td>
                    </tr>
                    {displayItems.map((item, idx) => renderItemRow(item, 'DISPLAY', idx))}
                  </>
                )}

                {/* BATTERY SECTION */}
                {batteryItems.length > 0 && (
                  <>
                    <tr className="matrix-category-header">
                      <td colSpan={orderedServiceSites.length + 12}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <BatteryCharging size={16} color="#15803d" />
                          <span>BATTERY COMMODITY</span>
                          <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '999px', fontWeight: 700 }}>
                            {batteryItems.length} Parts
                          </span>
                        </div>
                      </td>
                    </tr>
                    {batteryItems.map((item, idx) => renderItemRow(item, 'BATTERY', idx + displayItems.length))}
                  </>
                )}

                {/* OTHER ITEMS */}
                {otherItems.length > 0 && (
                  <>
                    <tr className="matrix-category-header">
                      <td colSpan={orderedServiceSites.length + 12}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} color="#64748b" />
                          <span>OTHER COMMODITIES</span>
                          <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '999px', fontWeight: 700 }}>
                            {otherItems.length} Parts
                          </span>
                        </div>
                      </td>
                    </tr>
                    {otherItems.map((item, idx) => renderItemRow(item, 'OTHER', idx + displayItems.length + batteryItems.length))}
                  </>
                )}
              </tbody>

              {/* FOOTER TOTAL ROWS WITH MAXIMUM CONTRAST & LEGIBILITY */}
              <tfoot>
                {/* 1. Total Parts per Site Row */}
                <tr className="matrix-footer-row-1">
                  <td colSpan={3} className="matrix-footer-sticky-label" style={{ paddingLeft: '14px', fontSize: '11.5px', letterSpacing: '0.04em' }}>
                    TOTAL PARTS PER SITE
                  </td>
                  <td style={{ textAlign: 'right', color: '#64748b', fontSize: '11px' }}>—</td>
                  <td style={{ textAlign: 'right', color: '#64748b', fontSize: '11px' }}>—</td>
                  {orderedServiceSites.map(s => (
                    <td key={s.id} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: '#38bdf8', fontSize: '12px', fontWeight: 800 }}>
                      {siteTotals[s.id] || 0}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', background: '#0284c7', color: '#ffffff', fontSize: '13px', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                    {totalAllocatedAllParts}
                  </td>
                  <td style={{ textAlign: 'right', color: '#4ade80', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    ${grandTotalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td colSpan={6} style={{ background: '#0f172a' }}></td>
                </tr>

                {/* 2. Total Cost Breakdown per Site Row - FULLY HIGH-CONTRAST & READABLE */}
                <tr className="matrix-footer-row-2">
                  <td colSpan={3} className="matrix-footer-sticky-label" style={{ paddingLeft: '14px', color: '#f8fafc', fontSize: '11px', letterSpacing: '0.04em', background: '#1e293b' }}>
                    TOTAL COST BREAKDOWN PER SITE
                  </td>
                  <td style={{ textAlign: 'right', color: '#64748b', fontSize: '10px' }}>—</td>
                  <td style={{ textAlign: 'right', color: '#64748b', fontSize: '10px' }}>—</td>
                  {orderedServiceSites.map(s => (
                    <td key={s.id} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: '#e2e8f0', fontWeight: 600, padding: '6px 2px' }}>
                      ${Math.round(siteCostTotals[s.id] || 0).toLocaleString()}
                    </td>
                  ))}
                  <td style={{ textAlign: 'center', background: '#0369a1', color: '#ffffff', fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    ${Math.round(grandTotalCost).toLocaleString()}
                  </td>
                  <td colSpan={6} style={{ background: '#1e293b' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
