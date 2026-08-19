import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { calculateLinearRegressionForecast, calculateRecommendedOrder } from '../utils/forecastEngine';
import SaveRecordModal from './SaveRecordModal';
import { Download, Sliders, TrendingUp, Info, UploadCloud, BookmarkPlus } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function Forecasting() {
  const {
    forecastItems,
    parts,
    selectedCategory,
    updateForecastOverride,
    setActiveTab,
    showToast
  } = useApp();

  const [safetyBufferPct, setSafetyBufferPct] = useState(5); // 5% default
  const [showSaveModal, setShowSaveModal] = useState(false);

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];

  // Filter items by category
  const filteredItems = forecastItems.filter(item => {
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'BATTERY') return item.category_id === 'cat-battery';
    if (selectedCategory === 'DISPLAY') return item.category_id === 'cat-display';
    if (selectedCategory === 'CAMERA') return item.category_id === 'cat-camera';
    if (selectedCategory === 'BACK_GLASS') return item.category_id === 'cat-backglass';
    return true;
  });

  const exportForecastExcel = () => {
    if (filteredItems.length === 0) {
      showToast('No forecast items to export', 'warning');
      return;
    }

    const data = filteredItems.map(item => {
      const counts = item.ytd_monthly_counts || [];
      const computed = calculateLinearRegressionForecast(counts, counts.length + 1);
      const rec = calculateRecommendedOrder(computed, safetyBufferPct / 100, item.admin_override);

      const rowObj = {
        'Part Number': item.part_number,
        'Description': item.description
      };
      months.forEach((m, idx) => {
        rowObj[m] = counts[idx] || 0;
      });
      rowObj['Next Period Forecast'] = computed;
      rowObj['Admin Override'] = item.admin_override !== null ? item.admin_override : '';
      rowObj['Safety Stock Units'] = rec.safetyUnits;
      rowObj['Recommended Order'] = rec.recommendedOrder;

      return rowObj;
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'August Forecast');
    XLSX.writeFile(wb, `August_2026_Demand_Forecast.xlsx`);
    showToast('Exported August Forecast to Excel', 'success');
  };

  return (
    <div className="forecasting-view">
      {/* Controls & Metrics Header */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3>Demand Forecasting Engine</h3>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Linear regression ($y = \alpha + \beta x$) computed over historical repair counts with safety stock buffers
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Safety Stock Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Safety Stock Buffer:
              </span>
              <input
                type="range"
                min="0"
                max="20"
                value={safetyBufferPct}
                onChange={(e) => setSafetyBufferPct(parseInt(e.target.value))}
                style={{ width: '100px', cursor: 'pointer' }}
                disabled={filteredItems.length === 0}
              />
              <span className="badge badge-primary" style={{ width: '40px', justifyContent: 'center' }}>
                {safetyBufferPct}%
              </span>
            </div>

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
              onClick={exportForecastExcel}
              disabled={filteredItems.length === 0}
            >
              <Download size={14} />
              <span>Export Excel</span>
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
                <th style={{ textAlign: 'center' }}>Buffer ({safetyBufferPct}%)</th>
                <th style={{ textAlign: 'center', background: '#ecfdf5', color: '#065f46' }}>Recommended Order</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => {
                const counts = item.ytd_monthly_counts || [];
                const computed = calculateLinearRegressionForecast(counts, counts.length + 1);
                const rec = calculateRecommendedOrder(computed, safetyBufferPct / 100, item.admin_override);
                const hasOverride = item.admin_override !== null && item.admin_override !== undefined && item.admin_override !== '';

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
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                      +{rec.safetyUnits}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', background: '#f0fdf4', color: '#15803d', fontSize: '15px' }}>
                      {rec.recommendedOrder}
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
