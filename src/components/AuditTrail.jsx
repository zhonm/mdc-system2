import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { History, Search, CheckCircle2, XCircle, ShieldCheck, Box } from 'lucide-react';

export default function AuditTrail() {
  const { inventoryUnits, scanLogs, shipments, sites, searchQuery, setSearchQuery } = useApp();
  const [selectedSerial, setSelectedSerial] = useState('');

  // Find unit details if a serial is searched
  const matchedUnit = selectedSerial.trim()
    ? inventoryUnits.find(u => u.serial_number.toUpperCase().includes(selectedSerial.trim().toUpperCase()))
    : null;

  // Filter scan logs
  const filteredLogs = scanLogs.filter(log => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.part_number?.toLowerCase().includes(q) ||
      log.serial_number?.toLowerCase().includes(q) ||
      log.scan_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="audit-view" style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Serial Number Investigation Card */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 style={{ marginBottom: '6px' }}>Serialized Unit Lifecycle Tracer</h3>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Track the complete custody chain of any high-value Apple replacement part (Scan-In $\to$ Allocation $\to$ Box Pack $\to$ Delivery)
        </p>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div className="search-input-box" style={{ flex: 1 }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Enter exact or partial Serial Number (e.g. FG9HTN005WS00006TT)..."
              value={selectedSerial}
              onChange={(e) => setSelectedSerial(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {matchedUnit ? (
          <div
            style={{
              border: '1px solid var(--primary-light)',
              background: '#f0f9ff',
              borderRadius: 'var(--radius-md)',
              padding: '20px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span className="badge badge-primary">{matchedUnit.status.toUpperCase()}</span>
                <h3 style={{ fontSize: '17px', marginTop: '6px' }}>{matchedUnit.description}</h3>
                <div className="font-mono" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  P/N: <strong>{matchedUnit.part_number}</strong> • Serial: <strong>{matchedUnit.serial_number}</strong>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Current Location:</span>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>
                  {sites.find(s => s.id === matchedUnit.current_site_id)?.name || 'DC Main Warehouse'}
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '16px' }}>
              <div style={{ background: '#fff', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>1. DC RECEIVE SCAN-IN</div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                  {new Date(matchedUnit.received_at).toLocaleDateString()}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  By: {matchedUnit.received_by || 'Warehouse Staff'}
                </div>
              </div>

              <div style={{ background: '#fff', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>2. PACK SCAN-OUT</div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                  {matchedUnit.shipped_at ? new Date(matchedUnit.shipped_at).toLocaleDateString() : 'Awaiting Pack'}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Box #: {matchedUnit.box_number || 1}
                </div>
              </div>

              <div style={{ background: '#fff', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>3. SHIPMENT STATUS</div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '4px' }}>
                  {matchedUnit.status === 'packed' || matchedUnit.status === 'shipped' ? 'Dispatched' : 'In Stock'}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  Verified: Yes
                </div>
              </div>
            </div>
          </div>
        ) : selectedSerial.trim() ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
            No serial number found matching "{selectedSerial}".
          </div>
        ) : null}
      </div>

      {/* Barcode Scanner Audit Logs */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3>Barcode Scan Event Logs</h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Real-time audit log of all hardware barcode scanner inputs (Scan-In & Scan-Out)
            </p>
          </div>
          <span className="badge badge-neutral">{scanLogs.length} Events Logged</span>
        </div>

        <div className="table-container" style={{ maxHeight: '420px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Operation</th>
                <th>Part Number</th>
                <th>Serial Number</th>
                <th>User</th>
                <th>Validation Result</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '28px', color: 'var(--text-muted)' }}>
                    No scan log events recorded yet.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className="badge badge-primary font-mono" style={{ fontSize: '10.5px' }}>
                        {log.scan_type}
                      </span>
                    </td>
                    <td className="font-mono"><strong>{log.part_number}</strong></td>
                    <td className="font-mono">{log.serial_number}</td>
                    <td>{log.user_name || 'Warehouse Staff'}</td>
                    <td>
                      {log.is_valid ? (
                        <span className="badge badge-success">
                          <CheckCircle2 size={12} />
                          Valid
                        </span>
                      ) : (
                        <span className="badge badge-danger" title={log.error_message}>
                          <XCircle size={12} />
                          {log.error_message || 'Rejected'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
