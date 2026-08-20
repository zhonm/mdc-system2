import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Search, Plus, Barcode, PackageCheck, Database, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function Header() {
  const {
    activeTab,
    setActiveTab,
    selectedCategory,
    setSelectedCategory,
    categories,
    searchQuery,
    setSearchQuery,
    cloudSyncStatus,
    refreshDataFromCloud,
    showToast,
    activePeriod
  } = useApp();

  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      if (refreshDataFromCloud) {
        await refreshDataFromCloud();
      }
    } catch (err) {
      console.error('Manual sync error:', err);
      showToast('Error syncing with cloud database', 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 800);
    }
  };

  const tabTitles = {
    dashboard: 'Distribution Center Overview',
    import: 'GSX & Fixably Data Import (ETL)',
    forecast: 'Demand Forecasting & PO Recommendations',
    records: 'Saved Period Records & Historical Archives',
    orders: 'Purchase Order Tracking',
    'scan-in': 'Receive Scan-In (Physical Barcode Scanner)',
    'intake-records': 'DC Intake Records & Verification',
    allocation: 'Master Allocation Matrix & Weekly Batches',
    'scan-out': 'Pack Scan-Out & Packing List Generator',
    shipments: 'Shipment Manifests & Proof of Delivery',
    reports: 'Fixably Stock Transfer Reports & Analytics',
    audit: 'Serialized Lifecycle & Traceability Audit',
    settings: 'Parts Catalog & Site Configuration',
    'user-access': 'User Access & Permissions Management'
  };

  return (
    <header className="header-bar no-print">
      <div className="header-left">
        <div>
          <h1 style={{ fontSize: '18px', margin: 0, lineHeight: 1.2 }}>
            {tabTitles[activeTab] || 'DC System'}
          </h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Period: {activePeriod?.label || 'September 2026'} • Mobile Care Services Phils. Inc.
          </span>
        </div>

        {/* Category Switcher Pills */}
        <div className="category-pills" style={{ marginLeft: '16px' }}>
          <button
            className={`category-pill ${selectedCategory === 'ALL' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            All Categories
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`category-pill ${selectedCategory === cat.code ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.code)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="header-right">
        {/* Google Sheets-style Live Cloud Auto-Save Indicator */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: cloudSyncStatus?.isSaving ? 'rgba(56, 189, 248, 0.12)' : 'rgba(16, 185, 129, 0.1)',
            border: `1px solid ${cloudSyncStatus?.isSaving ? '#38bdf8' : 'rgba(16, 185, 129, 0.3)'}`,
            borderRadius: 'var(--radius-full)',
            padding: '5px 12px',
            fontSize: '12px',
            color: cloudSyncStatus?.isSaving ? '#0284c7' : '#059669',
            fontWeight: 600,
            cursor: 'default',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
          title={cloudSyncStatus?.isSaving ? "Saving changes directly to Supabase Cloud Database..." : "All changes are automatically saved to Supabase Cloud Database"}
        >
          {cloudSyncStatus?.isSaving ? (
            <>
              <RefreshCw size={13} className="spin" color="#0284c7" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={13} color="#10b981" />
              <span>Cloud Synced</span>
            </>
          )}
        </div>

        <div className="search-input-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search part # or serial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Live Cloud DB Sync Button */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleManualSync}
          disabled={isSyncing}
          title="Synchronize and refresh all latest live data from Supabase Cloud Database"
          style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)' }}
        >
          {isSyncing ? <RefreshCw size={14} className="spin" /> : <Database size={14} />}
          <span>{isSyncing ? 'Syncing...' : 'Sync Cloud DB'}</span>
        </button>

        <button
          className="btn btn-primary btn-sm"
          onClick={() => setActiveTab('scan-in')}
          title="Shortcut: F1"
        >
          <Barcode size={15} />
          <span>Scan-In (F1)</span>
        </button>

        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setActiveTab('scan-out')}
          title="Shortcut: F2"
        >
          <PackageCheck size={15} />
          <span>Scan-Out (F2)</span>
        </button>
      </div>
    </header>
  );
}
