import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { calculateLinearRegressionForecast } from '../utils/forecastEngine';
import { exportForecastToExcel } from '../utils/excelParser';
import SaveRecordModal from './SaveRecordModal';
import { Download, TrendingUp, UploadCloud, BookmarkPlus, Printer } from 'lucide-react';

export default function Forecasting() {
  const {
    forecastItems,
    parts,
    selectedCategory,
    updateForecastOverride,
    setActiveTab,
    showToast
  } = useApp();

  const [showSaveModal, setShowSaveModal] = useState(false);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];

  // Filter items by category
  const filteredItems = forecastItems.filter(item => {
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'BATTERY') return item.category_id === 'cat-battery';
    if (selectedCategory === 'DISPLAY') return item.category_id === 'cat-display';
    if (selectedCategory === 'CAMERA') return item.category_id === 'cat-camera';
    if (selectedCategory === 'BACK_GLASS') return item.category_id === 'cat-backglass';
    return true;
  });

  const exportForecastExcelHandler = async () => {
    if (filteredItems.length === 0) {
      showToast('No forecast items to export', 'warning');
      return;
    }
    await exportForecastToExcel(filteredItems, 'August 2026');
    showToast('Exported August Forecast with styled Excel format', 'success');
  };

  const handlePrint = () => {
    if (filteredItems.length === 0) {
      showToast('No forecast items to print', 'warning');
      return;
    }
    window.print();
  };

  return (
    <div className="forecasting-view">
      {/* Controls & Metrics Header */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3>Demand Forecasting Engine</h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Linear regression ($y = \alpha + \beta x$) computed over historical repair counts
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowSaveModal(true)}
              disabled={filteredItems.length === 0}
              title="Save current forecast as a dated historical record"
            >
              <BookmarkPlus size={14} />
              <span>Save as Record</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={exportForecastExcelHandler}
              disabled={filteredItems.length === 0}
              title="Export styled Excel spreadsheet (.xlsx)"
            >
              <Download size={14} />
              <span>Export Excel</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={handlePrint}
              disabled={filteredItems.length === 0}
              title="Print Forecast Report"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
          </div>
        </div>
      </div>

      {/* Save Record Modal Dialog */}
      {showSaveModal && (
        <SaveRecordModal
          isOpen={showSaveModal}
          onClose={() => setShowSaveModal(false)}
          defaultType="forecast"
        />
      )}

      {/* Empty State or Forecasting Grid */}
      {filteredItems.length === 0 ? (
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
            <TrendingUp size={30} />
          </div>
          <h3 style={{ fontSize: '18px', marginBottom: '8px', color: 'var(--text-main)' }}>
            No Demand Forecasts Yet
          </h3>
          <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '480px', margin: '0 auto 20px', lineHeight: 1.5 }}>
            Upload a raw Fixably / GSX service usage file (<code>.csv</code> or <code>.xlsx</code>) or a forecasting workbook in Data Import to automatically compute linear regression forecasts across parts.
          </p>
          <button className="btn btn-primary" onClick={() => setActiveTab('import')}>
            <UploadCloud size={16} />
            <span>Go to Fixably / GSX Data Import</span>
          </button>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Part Number</th>
                <th>Part Description</th>
                {months.map(m => (
                  <th key={m} style={{ textAlign: 'center' }}>{m}</th>
                ))}
                <th style={{ textAlign: 'center', background: '#f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <span>Aug Forecast</span>
                    <TrendingUp size={13} color="var(--primary)" />
                  </div>
                </th>
                <th style={{ textAlign: 'center' }}>Admin Override</th>
                <th style={{ textAlign: 'center', background: '#ecfdf5', color: '#065f46' }}>Recommended Order</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const rawCounts = item.ytd_monthly_counts || [];
                const counts = rawCounts.slice(0, 7);
                while (counts.length < 7) counts.push(0);
                const computed = calculateLinearRegressionForecast(counts, 8);
                const hasOverride = item.admin_override !== null && item.admin_override !== undefined && item.admin_override !== '';
                const finalOrder = hasOverride ? parseInt(item.admin_override) : (item.final_forecast || computed);

                return (
                  <tr key={item.part_id}>
                    <td className="font-mono"><strong>{item.part_number}</strong></td>
                    <td>{item.description}</td>
                    {counts.map((cnt, idx) => (
                      <td key={idx} style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                        {cnt}
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', background: '#f8fafc' }}>
                      {computed}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="number"
                        className="forecast-override-input"
                        placeholder={String(computed)}
                        value={hasOverride ? item.admin_override : ''}
                        onChange={(e) => updateForecastOverride(item.part_id, e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', background: '#f0fdf4', color: '#15803d', fontSize: '15px' }}>
                      {finalOrder}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
