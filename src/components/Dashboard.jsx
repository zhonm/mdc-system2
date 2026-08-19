import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Boxes,
  ShoppingCart,
  TrendingUp,
  Truck,
  ArrowUpRight,
  Barcode,
  PackageCheck,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  UploadCloud
} from 'lucide-react';
import { generatePackingListPDF } from '../utils/pdfGenerator';

export default function Dashboard() {
  const {
    inventoryUnits,
    purchaseOrders,
    forecastItems,
    shipments,
    scanLogs,
    parts,
    sites,
    setActiveTab,
    selectedCategory
  } = useApp();

  // Filtered Parts
  const filteredParts = parts.filter(p => {
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'BATTERY') return p.category_id === 'cat-battery';
    if (selectedCategory === 'DISPLAY') return p.category_id === 'cat-display';
    if (selectedCategory === 'CAMERA') return p.category_id === 'cat-camera';
    if (selectedCategory === 'BACK_GLASS') return p.category_id === 'cat-backglass';
    return true;
  });

  const filteredPartIds = new Set(filteredParts.map(p => p.id));

  // KPIs
  const inStockUnits = inventoryUnits.filter(u => u.status === 'in_stock' && (filteredPartIds.size === 0 || filteredPartIds.has(u.part_id))).length;
  const packedUnits = inventoryUnits.filter(u => u.status === 'packed' && (filteredPartIds.size === 0 || filteredPartIds.has(u.part_id))).length;
  const totalForecast = forecastItems
    .filter(f => filteredPartIds.size === 0 || filteredPartIds.has(f.part_id))
    .reduce((sum, f) => sum + (f.final_forecast || f.computed_forecast || 0), 0);

  const openPOs = purchaseOrders.filter(po => po.status !== 'closed' && po.status !== 'received');
  const recentShipments = shipments.slice(0, 5);

  return (
    <div className="dashboard-view">
      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-title">DC In-Stock Units</span>
          <div className="kpi-value">{inStockUnits.toLocaleString()}</div>
          <div className="kpi-sub">
            <span style={{ color: packedUnits > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
              {packedUnits} units
            </span>{' '}
            ready in packing queue
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Total Demand Forecast</span>
          <div className="kpi-value">{totalForecast.toLocaleString()}</div>
          <div className="kpi-sub">
            <TrendingUp size={14} color="var(--primary)" />
            <span>{forecastItems.length > 0 ? 'Linear regression model across 26 sites' : 'No forecast data imported yet'}</span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Active Purchase Orders</span>
          <div className="kpi-value">{openPOs.length}</div>
          <div className="kpi-sub">
            <span style={{ color: openPOs.length > 0 ? 'var(--warning-dark)' : 'var(--text-muted)', fontWeight: 600 }}>
              {purchaseOrders.filter(p => p.status === 'partially_received').length} partially received
            </span>
          </div>
        </div>

        <div className="kpi-card">
          <span className="kpi-title">Shipment Manifests</span>
          <div className="kpi-value">{shipments.length}</div>
          <div className="kpi-sub">
            <Truck size={14} color="var(--primary)" />
            <span>{shipments.filter(s => s.status === 'shipped').length} dispatched via Lite Express</span>
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts Banner */}
      <div className="card" style={{ marginBottom: '24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '4px' }}>Warehouse Station Operations</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>
              Connect your Mac HID physical barcode scanner. Part Number & Serial are auto-captured with audible cues.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setActiveTab('import')}
              style={{ background: '#0284c7' }}
            >
              <UploadCloud size={18} />
              <span>Import Usage Data</span>
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => setActiveTab('scan-in')}
              style={{ background: '#334155', color: '#fff', borderColor: '#475569' }}
            >
              <Barcode size={18} />
              <span>Receive Parts (F1)</span>
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => setActiveTab('scan-out')}
              style={{ background: '#334155', color: '#fff', borderColor: '#475569' }}
            >
              <PackageCheck size={18} />
              <span>Packing List Scan (F2)</span>
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => setActiveTab('reports')}
              style={{ background: '#0369a1', color: '#fff', borderColor: '#0284c7' }}
            >
              <FileSpreadsheet size={18} />
              <span>Stock Transfer Reports</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2-Column Operational View */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        {/* Left Column: Purchase Orders & Inbound Pipeline */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3>Inbound Purchase Orders</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ordered parts awaiting scan-in receipt</p>
            </div>
            {purchaseOrders.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('orders')}>
                <span>View All</span>
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          {purchaseOrders.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-light)' }}>
              <ShoppingCart size={28} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>No Inbound Purchase Orders</div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 14px' }}>
                Import Fixably/GSX usage data to generate replenishment orders.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('import')}>
                <span>Go to Data Import</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {purchaseOrders.map(po => {
                const totalOrd = po.items?.reduce((s, it) => s + it.quantity_ordered, 0) || 0;
                const totalRec = po.items?.reduce((s, it) => s + it.quantity_received, 0) || 0;
                const pct = totalOrd > 0 ? Math.round((totalRec / totalOrd) * 100) : 0;

                return (
                  <div
                    key={po.id}
                    style={{
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '12px 14px',
                      background: 'var(--bg-primary)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '13.5px' }}>{po.po_number}</strong>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Expected: {po.expected_date}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className={`badge ${po.status === 'received' ? 'badge-success' : 'badge-warning'}`}>
                          {po.status.replace('_', ' ')}
                        </span>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                          {totalRec} / {totalOrd} ({pct}%)
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: '6px', width: '100%', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: pct === 100 ? 'var(--success)' : 'var(--primary)',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Recent Packing Lists & Shipments */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3>Recent Packing Lists</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Exported manifests for branch delivery</p>
            </div>
            {shipments.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('shipments')}>
                <span>View All</span>
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>

          {shipments.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border-light)' }}>
              <Truck size={28} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>No Packing Lists Yet</div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 14px' }}>
                Scan serialized parts to generate delivery manifests for service branches.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('scan-out')}>
                <span>Open Pack Scan-Out (F2)</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {recentShipments.map(sh => {
                const destSite = sites.find(s => s.id === sh.site_id) || {};
                return (
                  <div
                    key={sh.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface)'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{sh.invoice_ref || sh.shipment_number}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        To: {destSite.name || sh.site_name} • {sh.items?.length || 0} units
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="badge badge-primary">{sh.status}</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => generatePackingListPDF(sh, sh.items, destSite)}
                        title="Download PDF matching Packing List.png"
                      >
                        PDF
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
