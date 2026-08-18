import React from 'react';
import { useApp } from '../context/AppContext';
import { Search, Plus, Barcode, PackageCheck } from 'lucide-react';

export default function Header() {
  const {
    activeTab,
    setActiveTab,
    selectedCategory,
    setSelectedCategory,
    categories,
    searchQuery,
    setSearchQuery
  } = useApp();

  const tabTitles = {
    dashboard: 'Distribution Center Overview',
    import: 'GSX & Fixably Data Import (ETL)',
    forecast: 'Demand Forecasting & PO Recommendations',
    orders: 'Purchase Order Tracking',
    'scan-in': 'Receive Scan-In (Physical Barcode Scanner)',
    allocation: 'Master Allocation Matrix & Weekly Batches',
    'scan-out': 'Pack Scan-Out & Packing List Generator',
    shipments: 'Shipment Manifests & Proof of Delivery',
    audit: 'Serialized Lifecycle & Traceability Audit',
    settings: 'Parts Catalog & Site Configuration'
  };

  return (
    <header className="header-bar no-print">
      <div className="header-left">
        <div>
          <h1 style={{ fontSize: '18px', margin: 0, lineHeight: 1.2 }}>
            {tabTitles[activeTab] || 'MDC System 2'}
          </h1>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Period: August 2026 • Mobile Care Services Phils. Inc.
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
        <div className="search-input-box">
          <Search size={15} />
          <input
            type="text"
            placeholder="Search part # or serial..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

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
