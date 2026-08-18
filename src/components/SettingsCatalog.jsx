import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import UserAccessManagement from './UserAccessManagement';
import { Settings, Plus, Database, Copy, Check, Smartphone, MapPin, Users } from 'lucide-react';

export default function SettingsCatalog() {
  const { parts, categories, sites, savePart, saveSite, syncAllDataToCloud, currentUser, showToast } = useApp();
  const [activeTab, setActiveTab] = useState('parts'); // 'parts' | 'sites' | 'categories' | 'users' | 'sql'
  const [copied, setCopied] = useState(false);

  // New Part Form
  const [newPn, setNewPn] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCatId, setNewCatId] = useState(categories[0]?.id || 'cat-battery');
  const [newStockPrice, setNewStockPrice] = useState(150);
  const [newExchangePrice, setNewExchangePrice] = useState(120);

  const handleAddPart = (e) => {
    e.preventDefault();
    if (!newPn.trim() || !newDesc.trim()) {
      showToast('Part number and description are required', 'error');
      return;
    }
    savePart({
      part_number: newPn.trim(),
      description: newDesc.trim(),
      category_id: newCatId,
      stocking_price: parseFloat(newStockPrice) || 0,
      exchange_price: parseFloat(newExchangePrice) || 0
    });
    setNewPn('');
    setNewDesc('');
  };

  const copySqlSchema = () => {
    const sqlContent = `-- MDC System 2 Supabase Schema with Authentication & RBAC
-- (Refer to src/supabase/schema.sql for the complete script)`;
    navigator.clipboard.writeText(sqlContent);
    setCopied(true);
    showToast('SQL Schema script copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="settings-view" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Sub Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeTab === 'parts' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('parts')}
        >
          <Smartphone size={15} />
          <span>Parts Master Catalog ({parts.length})</span>
        </button>
        <button
          className={`btn ${activeTab === 'sites' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('sites')}
        >
          <MapPin size={15} />
          <span>Service Sites & Branches ({sites.length})</span>
        </button>
        <button
          className={`btn ${activeTab === 'categories' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('categories')}
        >
          <Settings size={15} />
          <span>Part Categories ({categories.length})</span>
        </button>
        {currentUser?.role === 'superadmin' && (
          <button
            className={`btn ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={15} />
            <span>User Access Control</span>
          </button>
        )}
        <button
          className={`btn ${activeTab === 'sql' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('sql')}
        >
          <Database size={15} />
          <span>Supabase SQL Schema</span>
        </button>
      </div>

      {/* 1. Parts Catalog Tab */}
      {activeTab === 'parts' && (
        <div>
          {/* Add Part Form */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <h3 style={{ marginBottom: '12px' }}>Add Part to Catalog</h3>
            <form onSubmit={handleAddPart} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1.2fr 1fr 1fr auto', gap: '12px', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Part Number (P/N)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. 661-36918"
                  value={newPn}
                  onChange={(e) => setNewPn(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Battery, iPhone 15 Pro Max"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Category</label>
                <select
                  className="form-select"
                  value={newCatId}
                  onChange={(e) => setNewCatId(e.target.value)}
                >
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Stock Price ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={newStockPrice}
                  onChange={(e) => setNewStockPrice(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Exchange ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={newExchangePrice}
                  onChange={(e) => setNewExchangePrice(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ height: '42px' }}>
                <Plus size={15} />
                <span>Add</span>
              </button>
            </form>
          </div>

          {/* Parts Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container" style={{ maxHeight: '500px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Part Number</th>
                    <th>Description</th>
                    <th>Model</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Stock Price</th>
                    <th style={{ textAlign: 'right' }}>Exchange Price</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((p, i) => {
                    const cat = categories.find(c => c.id === p.category_id);
                    return (
                      <tr key={p.id}>
                        <td className="font-mono" style={{ fontSize: '12px' }}>{i + 1}</td>
                        <td className="font-mono"><strong>{p.part_number}</strong></td>
                        <td>{p.description}</td>
                        <td>{p.iphone_model || 'iPhone'}</td>
                        <td>
                          <span className="badge badge-neutral">{cat?.name || 'Part'}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${p.stocking_price || 0}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>${p.exchange_price || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. Sites Tab */}
      {activeTab === 'sites' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container" style={{ maxHeight: '600px' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Site / Branch Name</th>
                  <th>Region</th>
                  <th>Address</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {sites.map(s => (
                  <tr key={s.id}>
                    <td className="font-mono"><strong>{s.code}</strong></td>
                    <td>{s.name}</td>
                    <td>
                      <span className={`badge ${s.region === 'Metro Manila' ? 'badge-primary' : 'badge-warning'}`}>
                        {s.region}
                      </span>
                    </td>
                    <td style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{s.address}</td>
                    <td>
                      <span className={`badge ${s.is_dc ? 'badge-success' : 'badge-neutral'}`}>
                        {s.is_dc ? 'Distribution Center' : 'Service Branch'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Categories Tab */}
      {activeTab === 'categories' && (
        <div className="card">
          <h3 style={{ marginBottom: '14px' }}>Extensible Part Categories</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            {categories.map(c => (
              <div
                key={c.id}
                style={{
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '16px',
                  background: 'var(--bg-primary)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <strong>{c.name}</strong>
                  <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.code}</span>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  Serialized: <strong>{c.is_serialized ? 'Yes (Part # + Serial)' : 'No'}</strong>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                  Requires IMEI: <strong>{c.has_imei ? 'Yes' : 'No (Battery/Display)'}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. User Access Management Tab (for Superadmin) */}
      {activeTab === 'users' && (
        <UserAccessManagement />
      )}

      {/* 5. Supabase SQL Schema Tab */}
      {activeTab === 'sql' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3>Supabase PostgreSQL Cloud Database</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Sync all local master data (Parts, Sites, Serialized Inventory, Categories, Users) to Supabase cloud.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-primary"
                onClick={syncAllDataToCloud}
                style={{ background: '#10b981', borderColor: '#059669' }}
              >
                <Database size={14} />
                <span>Sync Local Data to Cloud DB</span>
              </button>
              <button className="btn btn-secondary" onClick={copySqlSchema}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Schema SQL'}</span>
              </button>
            </div>
          </div>

          <div
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              maxHeight: '380px',
              overflowY: 'auto'
            }}
          >
            <pre style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1' }}>
{`-- The complete schema is located at: src/supabase/schema.sql
-- Tables created:
-- 1. profiles (linked to auth.users, includes has_set_password, is_active)
-- 2. user_page_permissions (granular per-user page access matrix)
-- 3. part_categories (BATTERY, DISPLAY, CAMERA, BACK_GLASS, MID_REAR)
-- 4. parts (Part Numbers, descriptions, prices, safety stock)
-- 5. sites (26 retail/service branches + DC)
-- 6. repair_usage_records (GSX / Fixably raw ETL records)
-- 7. forecast_cycles & forecast_entries (Linear regression forecasts)
-- 8. purchase_orders & po_items (DC vendor replenishment)
-- 9. inventory_units (Serialized unit tracking)
-- 10. allocation_cycles & allocation_items (Multi-site Hamilton-Hare splits)
-- 11. shipments & shipment_items (Manifests matching Packing List.png)
-- 12. scan_logs (Hardware HID barcode scanner audit events)`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
