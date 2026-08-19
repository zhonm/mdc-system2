import * as XLSX from 'xlsx';
import { calculateLinearRegressionForecast, calculateRecommendedOrder } from './forecastEngine.js';
import { calculateProportionalAllocation, calculateWeeklySplit } from './allocationEngine.js';

/**
 * Universal Parser for MDC System 2.
 * Intelligently parses:
 * 1. Google Sheets / Excel Multi-Tab Workbooks (Forecasting + Master Allocation)
 * 2. Pre-Aggregated Demand Forecasting Sheets (Jan..Jul..Aug side-by-side Battery & Display)
 * 3. Master Allocation Matrix Sheets (26 Branch distribution columns)
 * 4. Raw GSX / Fixably Repair Event Logs (.csv, .xlsx)
 */

export function isForecastingMatrixSheet(rows) {
  for (let r = 0; r < Math.min(6, rows.length); r++) {
    const str = (rows[r] || []).join(' ').toLowerCase();
    if (
      (str.includes('january') || str.includes('jan')) &&
      (str.includes('february') || str.includes('feb')) &&
      (str.includes('march') || str.includes('mar')) &&
      (str.includes('part') || str.includes('battery') || str.includes('display'))
    ) {
      return true;
    }
  }
  return false;
}

export function isAllocationMatrixSheet(rows) {
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    const str = (rows[r] || []).join(' ').toUpperCase();
    const hasBranchCodes = str.includes('BHS') || str.includes('GB3') || str.includes('PPM') || str.includes('GL5') || str.includes('CEB') || str.includes('MEG') || str.includes('APP ') || str.includes('ASP ') || str.includes('BONIFACIO') || str.includes('GREENBELT');
    const hasMatrixHeaders = str.includes('TOTAL') || str.includes('ALLOCATION') || str.includes('COMMODITY') || str.includes('FORECAST') || str.includes('P/N') || str.includes('PART NUMBER') || str.includes('PART DESCRIPTION');
    if (hasBranchCodes && hasMatrixHeaders) {
      return true;
    }
  }
  return false;
}

export function isRawUsageFile(sampleRows, fileName, sheetName) {
  if (/fixably|gsx|repairs|raw/i.test(fileName) || /repairs|raw/i.test(sheetName)) {
    return true;
  }
  for (let r = 0; r < Math.min(10, sampleRows.length); r++) {
    const rowStr = (sampleRows[r] || []).join(' ').toLowerCase();
    if (
      (rowStr.includes('repair') || rowStr.includes('case') || rowStr.includes('order')) &&
      (rowStr.includes('part') || rowStr.includes('description') || rowStr.includes('p/n')) &&
      (rowStr.includes('site') || rowStr.includes('branch') || rowStr.includes('location') || rowStr.includes('store') || rowStr.includes('asp'))
    ) {
      return true;
    }
  }
  return false;
}

export function isTargetIPhonePart(desc, pn, filterScope = 'IPHONE_13_PLUS_BATTERY_DISPLAY') {
  if (filterScope === 'ALL_PARTS') return true;

  const d = String(desc || '').trim().toLowerCase();
  const p = String(pn || '').trim().toLowerCase();
  const combined = `${d} ${p}`;

  // 1. Exclude non-iPhone hardware, other commodities (camera, back glass, systems), & consumables
  if (/ipad|macbook|mac\s|imac|watch|airpod|vision|pencil|top case|enclosure|housing|logic board|flex|speaker|receiver|screw|adhesive|\btray\b|sensor|camera|truedepth|\bglass\b|rear\s*system|mid\s*system|\bsim\s*tray\b|\bsim\s*eject|battery tape|screw kit/i.test(d)) {
    return false;
  }

  // 2. Must be iPhone
  const isIphone = /iphone/i.test(combined);
  if (!isIphone) return false;

  // 3. Strictly Battery or Display only
  const isBattery = /battery|batt\b/i.test(d);
  const isDisplay = /display|screen|oled|lcd/i.test(d);
  if (!isBattery && !isDisplay) {
    return false;
  }

  // 4. Exclude older iPhones (< iPhone 13)
  if (/\biphone\s*(4|4s|5|5s|5c|6|6s|6\s*plus|6s\s*plus|7|7\s*plus|8|8\s*plus|x|xr|xs|xs\s*max|11|11\s*pro|11\s*pro\s*max|12|12\s*mini|12\s*pro|12\s*pro\s*max)\b/i.test(d)) {
    return false;
  }

  const is13OrNewer = /\biphone\s*(13|14|15|16|17|18|19|20|air|se\s*\(3rd)\b/i.test(d) ||
                      /iphone\s*(13|14|15|16|17|air)/i.test(combined);

  if (!is13OrNewer) {
    return false;
  }

  return true;
}

export async function parseUniversalExcel(file, currentSites = [], currentParts = [], options = {}) {
  const filterScope = options.filterScope || 'IPHONE_13_PLUS_BATTERY_DISPLAY';
  const selectedMonth = options.selectedMonth !== undefined ? options.selectedMonth : 'auto';

  return new Promise((resolve) => {
    const reader = new FileReader();
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    reader.onload = (e) => {
      try {
        let wb;
        if (isCsv) {
          const text = new TextDecoder('utf-8').decode(e.target.result);
          wb = XLSX.read(text, { type: 'string' });
        } else {
          const data = new Uint8Array(e.target.result);
          wb = XLSX.read(data, { type: 'array' });
        }

        const sheetNames = wb.SheetNames;

        // Check for Multi-Tab Comprehensive Workbook (.xlsx)
        const allocSheetName = !isCsv ? sheetNames.find(s =>
          (/master.*alloc|allocation|_alloc/i.test(s) || /july.*alloc|august.*alloc/i.test(s)) && !/forecasting|forecast/i.test(s)
        ) : null;

        const forecastSheetName = !isCsv ? sheetNames.find(s =>
          /forecasting|forecast/i.test(s) && !/allocation|_alloc/i.test(s)
        ) : null;

        const rawSheetName = !isCsv ? sheetNames.find(s =>
          (/master.*list|iphones|iphone|repairs|raw/i.test(s)) && s !== allocSheetName && s !== forecastSheetName
        ) : null;

        // A. Multi-Tab Workbook with Explicit Master Allocation Sheet
        if (allocSheetName) {
          const wsAlloc = wb.Sheets[allocSheetName];
          const rawAllocRows = XLSX.utils.sheet_to_json(wsAlloc, { header: 1, defval: '' });
          const parsedAlloc = parseAllocationSheet(rawAllocRows, currentSites, filterScope);

          let parsedForecast = { forecastItems: [], parts: [] };
          if (forecastSheetName) {
            const wsForecast = wb.Sheets[forecastSheetName];
            const rawForecastRows = XLSX.utils.sheet_to_json(wsForecast, { header: 1, defval: '' });
            parsedForecast = parseForecastingSheet(rawForecastRows, filterScope);
          } else {
            // Build fallback forecast items from allocation data
            parsedForecast.forecastItems = parsedAlloc.allocations.map(a => ({
              part_id: a.part_id,
              part_number: a.part_number,
              description: a.description,
              category_id: a.category_id,
              computed_forecast: a.forecasted_qty || a.total_allocated_qty,
              final_forecast: a.forecasted_qty || a.total_allocated_qty,
              safety_stock_units: 0,
              recommended_order: a.forecasted_qty || a.total_allocated_qty
            }));
          }

          resolve({
            success: true,
            type: 'WORKBOOK_BUNDLE',
            sheetName: forecastSheetName ? `${forecastSheetName} + ${allocSheetName}` : allocSheetName,
            summary: {
              forecastPartsCount: parsedForecast.forecastItems.length,
              allocPartsCount: parsedAlloc.allocations.length,
              sitesCount: parsedAlloc.sites.length,
              totalForecastedUnits: parsedAlloc.allocations.reduce((acc, a) => acc + (a.total_allocated_qty || 0), 0),
              description: `Extracted complete operational system data: ${parsedForecast.forecastItems.length} demand forecasts and ${parsedAlloc.allocations.length} master allocations across ${parsedAlloc.sites.length} service sites from "${allocSheetName}".`
            },
            payload: {
              forecastItems: parsedForecast.forecastItems,
              allocations: parsedAlloc.allocations,
              sites: parsedAlloc.sites,
              parts: parsedAlloc.parts.length > 0 ? parsedAlloc.parts : parsedForecast.parts
            }
          });
          return;
        }

        // B. Multi-Tab Forecasting Workbook (Demand Forecast Matrix + Raw Usage / Masterlist)
        if (forecastSheetName) {
          const wsForecast = wb.Sheets[forecastSheetName];
          const rawForecastRows = XLSX.utils.sheet_to_json(wsForecast, { header: 1, defval: '' });
          const parsedForecast = parseForecastingSheet(rawForecastRows, filterScope);

          const finalSites = currentSites.filter(s => !s.is_dc);

          // Extract branch site distribution from raw repair logs sheet if available
          const partSiteRepairs = new Map();
          if (rawSheetName) {
            const wsRaw = wb.Sheets[rawSheetName];
            const rawRows = XLSX.utils.sheet_to_json(wsRaw, { header: 1, defval: '' });
            let hIdx = 0;
            for (let i = 0; i < Math.min(6, rawRows.length); i++) {
              const s = (rawRows[i] || []).join(' ').toLowerCase();
              if (s.includes('location') || s.includes('site') || s.includes('product code') || s.includes('part')) {
                hIdx = i; break;
              }
            }
            const headers = (rawRows[hIdx] || []).map(h => String(h).toLowerCase());
            const siteCol = headers.findIndex(h => /location|site|branch/i.test(h));
            const pnCol = headers.findIndex(h => /product\s*code|part\s*number|p\/n|code/i.test(h));

            if (siteCol >= 0 && pnCol >= 0) {
              for (let r = hIdx + 1; r < rawRows.length; r++) {
                const row = rawRows[r];
                if (!row) continue;
                const pn = String(row[pnCol] || '').trim();
                const loc = String(row[siteCol] || '').trim();
                if (!pn || !loc) continue;
                if (!partSiteRepairs.has(pn)) partSiteRepairs.set(pn, {});
                const counts = partSiteRepairs.get(pn);
                counts[loc] = (counts[loc] || 0) + 1;
              }
            }
          }

          // Generate fair proportional branch allocations using Excel Cumulative Rounding Formula
          const generatedAllocations = parsedForecast.forecastItems.map((f, idx) => {
            const pn = f.part_number;
            const targetQty = f.final_forecast || f.computed_forecast || 0;
            const siteCounts = partSiteRepairs.get(pn) || {};

            const siteDemands = finalSites.map(s => {
              let count = siteCounts[s.name] || 0;
              if (count === 0) {
                const matchKey = Object.keys(siteCounts).find(k => k.includes(s.code) || s.code.includes(k) || s.name.includes(k) || k.includes(s.name));
                if (matchKey) count = siteCounts[matchKey];
              }
              return { siteId: s.id, historicalDemand: count };
            });

            const allocatedResults = calculateProportionalAllocation(targetQty, siteDemands);
            const siteQuantities = {};
            allocatedResults.forEach(res => { siteQuantities[res.siteId] = res.allocatedQty; });
            const split = calculateWeeklySplit(targetQty, idx);

            return {
              part_id: f.part_id || `part-${pn}`,
              part_number: pn,
              description: f.description,
              category_id: f.category_id,
              forecasted_qty: targetQty,
              stocking_price: f.category_id === 'cat-display' ? 280 : 99,
              total_allocated_qty: targetQty,
              w1_qty: split.week1,
              w2_qty: split.week2,
              w3_qty: split.week3,
              w4_qty: split.week4,
              site_quantities: siteQuantities
            };
          });

          resolve({
            success: true,
            type: 'WORKBOOK_BUNDLE',
            sheetName: rawSheetName ? `${forecastSheetName} + ${rawSheetName}` : forecastSheetName,
            summary: {
              forecastPartsCount: parsedForecast.forecastItems.length,
              allocPartsCount: generatedAllocations.length,
              sitesCount: finalSites.length,
              totalForecastedUnits: generatedAllocations.reduce((acc, a) => acc + (a.total_allocated_qty || 0), 0),
              description: `Extracted ${parsedForecast.forecastItems.length} demand forecasts from "${forecastSheetName}" and generated fair branch allocations across ${finalSites.length} service sites.`
            },
            payload: {
              forecastItems: parsedForecast.forecastItems,
              allocations: generatedAllocations,
              sites: currentSites,
              parts: parsedForecast.parts
            }
          });
          return;
        }

        // C. Single Sheet or CSV Inspection
        const firstWs = wb.Sheets[sheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json(firstWs, { header: 1, defval: '' });

        // 1. Is it a Pre-Aggregated Allocation Matrix Sheet?
        if (isAllocationMatrixSheet(rawRows)) {
          const parsedAlloc = parseAllocationSheet(rawRows, currentSites, filterScope);
          resolve({
            success: true,
            type: 'ALLOCATION',
            sheetName: sheetNames[0],
            summary: {
              partsCount: parsedAlloc.allocations.length,
              sitesCount: parsedAlloc.sites.length,
              description: `Extracted ${parsedAlloc.allocations.length} allocated parts across ${parsedAlloc.sites.length} service sites from "${sheetNames[0]}".`
            },
            payload: parsedAlloc
          });
          return;
        }

        // 2. Is it a Pre-Aggregated Forecasting Sheet?
        if (isForecastingMatrixSheet(rawRows)) {
          const parsedForecast = parseForecastingSheet(rawRows, filterScope);
          const finalSites = currentSites.filter(s => !s.is_dc);
          const generatedAllocations = parsedForecast.forecastItems.map((f, idx) => {
            const targetQty = f.final_forecast || f.computed_forecast || 0;
            const siteDemands = finalSites.map(s => ({ siteId: s.id, historicalDemand: 1 }));
            const allocatedResults = calculateProportionalAllocation(targetQty, siteDemands);
            const siteQuantities = {};
            allocatedResults.forEach(res => { siteQuantities[res.siteId] = res.allocatedQty; });
            const split = calculateWeeklySplit(targetQty, idx);

            return {
              part_id: f.part_id,
              part_number: f.part_number,
              description: f.description,
              category_id: f.category_id,
              forecasted_qty: targetQty,
              stocking_price: f.category_id === 'cat-display' ? 280 : 99,
              total_allocated_qty: targetQty,
              w1_qty: split.week1,
              w2_qty: split.week2,
              w3_qty: split.week3,
              w4_qty: split.week4,
              site_quantities: siteQuantities
            };
          });

          resolve({
            success: true,
            type: 'FORECAST',
            sheetName: sheetNames[0],
            summary: {
              partsCount: parsedForecast.forecastItems.length,
              totalForecastedUnits: parsedForecast.forecastItems.reduce((acc, f) => acc + (f.final_forecast || f.computed_forecast || 0), 0),
              description: `Extracted demand matrix and linear forecasts for ${parsedForecast.forecastItems.length} genuine parts from "${sheetNames[0]}".`
            },
            payload: {
              ...parsedForecast,
              allocations: generatedAllocations
            }
          });
          return;
        }

        // 3. Default: Process as Raw Repair Logs
        const usageResult = processRawUsageSheet(rawRows, currentSites, currentParts, filterScope, selectedMonth, file.name);
        resolve({
          success: true,
          type: 'RAW_USAGE_PIPELINE',
          sheetName: sheetNames[0],
          summary: {
            recordsCount: usageResult.records.length,
            partsCount: usageResult.forecastItems.length,
            sitesCount: usageResult.sites.length,
            totalForecastedUnits: usageResult.forecastItems.reduce((acc, f) => acc + (f.computed_forecast || 0), 0),
            description: `Extracted ${usageResult.records.length} in-scope repair logs for iPhone 13+ Battery & Display parts across ${usageResult.sites.length} branches.`
          },
          payload: usageResult
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    };

    reader.onerror = () => resolve({ success: false, error: 'Failed to read file buffer' });
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Sub-parser: Pre-Aggregated Forecasting Sheet (Matches Google Sheet Screenshot 3 & 4)
 * Handles both dual side-by-side Battery & Display tables and single table formats.
 */
export function parseForecastingSheet(rawRows, filterScope = 'IPHONE_13_PLUS_BATTERY_DISPLAY') {
  const forecastItems = [];
  const parts = [];

  // Find the header row containing month names
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(8, rawRows.length); r++) {
    const rowStr = (rawRows[r] || []).join(' ').toLowerCase();
    if (rowStr.includes('january') || rowStr.includes('jan')) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = rawRows[headerRowIndex] || [];
  const rowStr = headerRow.join(' ').toLowerCase();

  // Check if it's dual side-by-side (Battery on Left, Display on Right)
  const isDualTable = (rowStr.match(/january|jan/g) || []).length >= 2 || rawRows.some(r => (r[0] === 'Battery' || r[11] === 'Display'));

  if (isDualTable) {
    // Dual side-by-side parser
    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      // 1. Left Table: Battery
      const pnBat = String(row[0] || '').trim();
      const descBat = String(row[1] || '').trim();
      if (pnBat && descBat && isTargetIPhonePart(descBat, pnBat, filterScope)) {
        const counts = [];
        for (let c = 2; c <= 9; c++) {
          counts.push(parseInt(row[c]) || 0);
        }
        const augustValue = counts[7] !== undefined ? counts[7] : calculateLinearRegressionForecast(counts);
        const rec = calculateRecommendedOrder(augustValue, 0.05);

        forecastItems.push({
          part_id: `part-${pnBat}`,
          part_number: pnBat,
          description: descBat,
          category_id: 'cat-battery',
          ytd_monthly_counts: counts,
          computed_forecast: augustValue,
          admin_override: null,
          final_forecast: augustValue,
          safety_stock_units: rec.safetyUnits,
          recommended_order: rec.recommendedOrder
        });

        parts.push({
          id: `part-${pnBat}`,
          part_number: pnBat,
          description: descBat,
          category_id: 'cat-battery',
          iphone_model: descBat.replace(/^(Battery),?\s*/i, ''),
          stocking_price: 150,
          is_active: true
        });
      }

      // 2. Right Table: Display
      const pnDisp = String(row[11] || '').trim();
      const descDisp = String(row[12] || '').trim();
      if (pnDisp && descDisp && isTargetIPhonePart(descDisp, pnDisp, filterScope)) {
        const counts = [];
        for (let c = 13; c <= 20; c++) {
          counts.push(parseInt(row[c]) || 0);
        }
        const augustValue = counts[7] !== undefined ? counts[7] : calculateLinearRegressionForecast(counts);
        const rec = calculateRecommendedOrder(augustValue, 0.05);

        forecastItems.push({
          part_id: `part-${pnDisp}`,
          part_number: pnDisp,
          description: descDisp,
          category_id: 'cat-display',
          ytd_monthly_counts: counts,
          computed_forecast: augustValue,
          admin_override: null,
          final_forecast: augustValue,
          safety_stock_units: rec.safetyUnits,
          recommended_order: rec.recommendedOrder
        });

        parts.push({
          id: `part-${pnDisp}`,
          part_number: pnDisp,
          description: descDisp,
          category_id: 'cat-display',
          iphone_model: descDisp.replace(/^(Display),?\s*/i, ''),
          stocking_price: 280,
          is_active: true
        });
      }
    }
  } else {
    // Single Table parser
    const pnCol = headerRow.findIndex(h => /part\s*number|p\/n|part\s*#/i.test(String(h))) || 0;
    const descCol = headerRow.findIndex(h => /description|desc|part\s*name/i.test(String(h))) || 1;
    
    // Month column indices
    const monthCols = [];
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug'].forEach(m => {
      const idx = headerRow.findIndex(h => String(h).toLowerCase().startsWith(m));
      if (idx >= 0) monthCols.push(idx);
    });

    for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.length === 0) continue;

      const pn = String(row[pnCol] || '').trim();
      const desc = String(row[descCol] || '').trim();
      if (!pn && !desc) continue;

      if (!isTargetIPhonePart(desc, pn, filterScope)) continue;

      const counts = monthCols.map(c => parseInt(row[c]) || 0);
      while (counts.length < 8) counts.push(0);

      const isDisplay = desc.toLowerCase().includes('display');
      const catId = isDisplay ? 'cat-display' : 'cat-battery';
      const augustValue = counts[7] > 0 ? counts[7] : calculateLinearRegressionForecast(counts);
      const rec = calculateRecommendedOrder(augustValue, 0.05);

      forecastItems.push({
        part_id: `part-${pn}`,
        part_number: pn,
        description: desc,
        category_id: catId,
        ytd_monthly_counts: counts,
        computed_forecast: augustValue,
        admin_override: null,
        final_forecast: augustValue,
        safety_stock_units: rec.safetyUnits,
        recommended_order: rec.recommendedOrder
      });

      parts.push({
        id: `part-${pn}`,
        part_number: pn,
        description: desc,
        category_id: catId,
        iphone_model: desc.replace(/^(Battery|Display),?\s*/i, ''),
        stocking_price: isDisplay ? 280 : 150,
        is_active: true
      });
    }
  }

  return { forecastItems, parts };
}

/**
 * Sub-parser: Master Allocation Matrix Sheet (Matches Google Sheet Screenshot 1 & MasterList)
 * Dynamically identifies all 26 branch columns.
 */
export function parseAllocationSheet(rawRows, existingSites = [], filterScope = 'IPHONE_13_PLUS_BATTERY_DISPLAY') {
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(8, rawRows.length); r++) {
    const rowStr = (rawRows[r] || []).join(' ').toUpperCase();
    if (rowStr.includes('BHS') || rowStr.includes('GB3') || rowStr.includes('PPM') || rowStr.includes('P/N') || rowStr.includes('PART DESCRIPTION')) {
      headerRowIndex = r;
      break;
    }
  }

  const headerRow = (rawRows[headerRowIndex] || []).map(h => String(h).trim());
  const pnCol = headerRow.findIndex(h => /part\s*number|p\/n|part\s*#|code/i.test(h)) >= 0 ? headerRow.findIndex(h => /part\s*number|p\/n|part\s*#|code/i.test(h)) : 5;
  const descCol = headerRow.findIndex(h => /description|desc|part\s*name/i.test(h)) >= 0 ? headerRow.findIndex(h => /description|desc|part\s*name/i.test(h)) : 6;
  const forecastQtyCol = headerRow.findIndex(h => /forecasted\s*qty|forecast/i.test(h));
  const stockPriceCol = headerRow.findIndex(h => /stocking\s*price|price/i.test(h));
  const totalAllocCol = headerRow.findIndex(h => /total\s*parts|total\s*alloc|total/i.test(h));

  // Map site columns
  const siteCodeMap = {}; // colIdx -> siteObj
  const sites = [...existingSites];

  headerRow.forEach((h, colIdx) => {
    const cleanH = h.toUpperCase().replace(/^MOBILECARE\s*-\s*/i, '').trim();
    if (!cleanH || /commodity|forecast|price|exchange|part|p\/n|desc|total|w1|w2|w3|w4|remark/i.test(cleanH)) {
      return;
    }

    let siteObj = sites.find(s => cleanH.includes(s.code.toUpperCase()) || s.code.toUpperCase().includes(cleanH) || cleanH.includes(s.name.toUpperCase()) || s.name.toUpperCase().includes(cleanH));
    if (!siteObj) {
      const code = cleanH.replace(/[^A-Z0-9]/g, '').substring(0, 7) || `SITE-${colIdx}`;
      siteObj = {
        id: `site-${code.toLowerCase()}`,
        code: code,
        name: cleanH,
        region: /cebu|davao|iloilo|naga|la union|zamboanga|cagayan|lanang|lima|newpoint/i.test(cleanH) ? 'Provincial' : 'Metro Manila',
        address: `${cleanH} Service Branch, Philippines`,
        is_dc: false,
        is_active: true
      };
      sites.push(siteObj);
    }
    siteCodeMap[colIdx] = siteObj;
  });

  const allocations = [];
  const parts = [];
  const seenPns = new Set();

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rowStr = row.join(' ').toLowerCase();
    // Stop at bottom summary/footer rows and percentage share tables
    if (
      rowStr.includes('total parts per site') ||
      rowStr.includes('total cost breakdown') ||
      rowStr.includes('repair parts usage report') ||
      rowStr.includes('stockprice')
    ) {
      break;
    }

    const pn = String(row[pnCol] || '').trim();
    const desc = String(row[descCol] || '').trim();
    if (!pn && !desc) continue;
    if (seenPns.has(pn)) continue; // Avoid duplicate parts from lower share tables

    if (!isTargetIPhonePart(desc, pn, filterScope)) continue;
    seenPns.add(pn);

    const siteQuantities = {};
    let rowSum = 0;
    Object.keys(siteCodeMap).forEach(colIdx => {
      const sObj = siteCodeMap[colIdx];
      const qty = parseInt(row[colIdx]) || 0;
      siteQuantities[sObj.id] = qty;
      rowSum += qty;
    });

    const totalAlloc = totalAllocCol >= 0 && row[totalAllocCol] !== '' ? (parseInt(row[totalAllocCol]) || 0) : rowSum;
    const forecastQty = forecastQtyCol >= 0 && row[forecastQtyCol] !== '' ? (parseInt(row[forecastQtyCol]) || 0) : totalAlloc;
    const parsedPrice = stockPriceCol >= 0 && row[stockPriceCol] !== '' ? (parseFloat(String(row[stockPriceCol]).replace(/[^0-9.]/g, '')) || 0) : 0;
    
    const isDisplay = desc.toLowerCase().includes('display');
    const isBattery = desc.toLowerCase().includes('battery') || desc.toLowerCase().includes('batt');
    const isCamera = desc.toLowerCase().includes('camera');
    const isBackGlass = desc.toLowerCase().includes('back glass') || desc.toLowerCase().includes('rear system');

    const catId = isDisplay ? 'cat-display' : isBattery ? 'cat-battery' : isCamera ? 'cat-camera' : isBackGlass ? 'cat-backglass' : 'cat-other';
    const fallbackPrice = isDisplay ? 280 : isBattery ? 99 : 150;
    const finalStockPrice = parsedPrice > 0 ? parsedPrice : fallbackPrice;

    const split = calculateWeeklySplit(totalAlloc, r);

    allocations.push({
      part_id: `part-${pn}`,
      part_number: pn,
      description: desc,
      category_id: catId,
      forecasted_qty: forecastQty,
      stocking_price: finalStockPrice,
      total_allocated_qty: totalAlloc,
      w1_qty: split.week1,
      w2_qty: split.week2,
      w3_qty: split.week3,
      w4_qty: split.week4,
      site_quantities: siteQuantities
    });

    parts.push({
      id: `part-${pn}`,
      part_number: pn,
      description: desc,
      category_id: catId,
      iphone_model: desc.replace(/^(Battery|Display|Camera|Back Glass),?\s*/i, ''),
      stocking_price: finalStockPrice,
      is_active: true
    });
  }

  return { allocations, sites, parts };
}

/**
 * Sub-parser: Raw Fixably / GSX repair logs
 */
export function processRawUsageSheet(rawRows, existingSites = [], existingParts = [], filterScope = 'IPHONE_13_PLUS_BATTERY_DISPLAY', selectedMonth = 'auto', fileName = '') {
  let headerIndex = 0;
  for (let i = 0; i < Math.min(12, rawRows.length); i++) {
    const str = (rawRows[i] || []).map(c => String(c).toLowerCase()).join(' ');
    if (
      (str.includes('part') || str.includes('p/n') || str.includes('code') || str.includes('item') || str.includes('desc')) &&
      (str.includes('site') || str.includes('branch') || str.includes('location') || str.includes('asp') || str.includes('store') || str.includes('repair') || str.includes('date') || str.includes('month'))
    ) {
      headerIndex = i;
      break;
    }
  }

  const headers = (rawRows[headerIndex] || []).map(h => String(h).trim().toLowerCase());
  const colIndices = {
    month: headers.findIndex(h => /month|date|closed|created|period|time/i.test(h)),
    site: headers.findIndex(h => /site|branch|location|asp|store|office|company/i.test(h)),
    partNumber: headers.findIndex(h => /part\s*number|p\/n|part\s*#|part_code|item\s*code|sku|product\s*code|part\b/i.test(h)),
    partDesc: headers.findIndex(h => /description|part\s*name|item\s*name|item\b|product\s*name|title|desc/i.test(h)),
    qty: headers.findIndex(h => /qty|quantity|count|amount/i.test(h)),
    repairId: headers.findIndex(h => /repair|order|case|invoice|ticket|number/i.test(h)),
    serial: headers.findIndex(h => /serial|imei|kgb|kbb/i.test(h))
  };

  if (colIndices.partNumber === -1) colIndices.partNumber = 0;
  if (colIndices.partDesc === -1) colIndices.partDesc = 1;
  if (colIndices.site === -1) colIndices.site = 2;
  if (colIndices.month === -1) colIndices.month = 3;

  const records = [];
  const partMap = new Map();
  const discoveredSites = new Map();
  let totalRawRowsRead = 0;
  let filteredOutCount = 0;

  existingSites.forEach(s => {
    discoveredSites.set(s.id, s);
    discoveredSites.set(s.code.toUpperCase(), s);
    discoveredSites.set(s.name.toUpperCase(), s);
  });

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function parseExcelOrDateString(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number' && val > 20000 && val < 60000) {
      return new Date((val - 25569) * 86400 * 1000);
    }
    const strVal = String(val).trim();
    const numVal = parseFloat(strVal);
    if (!isNaN(numVal) && numVal > 20000 && numVal < 60000) {
      return new Date((numVal - 25569) * 86400 * 1000);
    }
    const parsed = new Date(strVal);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020) {
      return parsed;
    }
    return null;
  }

  let targetMonthIdx = 7; // August default
  if (selectedMonth !== 'auto' && selectedMonth !== undefined && selectedMonth !== '') {
    targetMonthIdx = Math.max(0, Math.min(11, parseInt(selectedMonth) || 7));
  } else if (fileName) {
    const fLower = fileName.toLowerCase();
    const foundIdx = MONTH_NAMES.findIndex(m => fLower.includes(m.toLowerCase()));
    if (foundIdx >= 0) targetMonthIdx = foundIdx;
  }
  let defaultFileMonthIdx = targetMonthIdx;

  for (let r = headerIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    const rawPn = String(row[colIndices.partNumber] || '').trim();
    const rawDesc = String(row[colIndices.partDesc] || '').trim();
    const rawSite = String(row[colIndices.site] || '').trim();
    const rawMonth = row[colIndices.month];
    const rawQty = Math.max(1, parseInt(row[colIndices.qty]) || 1);
    const repairNo = colIndices.repairId >= 0 ? String(row[colIndices.repairId] || '').trim() : `RPR-${r}`;
    const serial = colIndices.serial >= 0 ? String(row[colIndices.serial] || '').trim() : '';

    if (!rawPn && !rawDesc) continue;
    totalRawRowsRead++;

    if (!isTargetIPhonePart(rawDesc, rawPn, filterScope)) {
      filteredOutCount++;
      continue;
    }

    const cleanPn = rawPn ? rawPn.toUpperCase() : `PART-${r}`;
    const cleanDesc = rawDesc || `Apple Genuine Part (${cleanPn})`;

    let matchedSiteId = 'site-dc';
    if (rawSite) {
      const siteKey = rawSite.toUpperCase();
      let matched = existingSites.find(s => 
        siteKey.includes(s.code.toUpperCase()) || 
        siteKey.includes(s.name.toUpperCase()) ||
        s.name.toUpperCase().includes(siteKey) ||
        s.code.toUpperCase().includes(siteKey)
      );

      if (matched) {
        matchedSiteId = matched.id;
      } else {
        const newCode = rawSite.replace(/[^a-zA-Z0-9]/g, '').substring(0, 7).toUpperCase() || `SITE-${r}`;
        const newSiteObj = {
          id: `site-${newCode.toLowerCase()}`,
          code: newCode,
          name: rawSite,
          region: /cebu|davao|iloilo|naga|la union|zamboanga|cagayan|lanang|lima|newpoint/i.test(rawSite) ? 'Provincial' : 'Metro Manila',
          address: `${rawSite}, Philippines`,
          is_dc: false,
          is_active: true
        };
        discoveredSites.set(newSiteObj.id, newSiteObj);
        matchedSiteId = newSiteObj.id;
      }
    }

    let monthIdx = defaultFileMonthIdx;
    if (rawMonth !== undefined && rawMonth !== null && rawMonth !== '') {
      const parsedDate = parseExcelOrDateString(rawMonth);
      if (parsedDate) {
        monthIdx = parsedDate.getMonth();
      } else {
        const rawMonthStr = String(rawMonth).toLowerCase();
        const mMatch = MONTH_NAMES.findIndex(m => rawMonthStr.includes(m.toLowerCase()));
        if (mMatch >= 0) monthIdx = mMatch;
      }
    }

    if (monthIdx < 0) monthIdx = 0;
    if (monthIdx > 11) monthIdx = 11;

    const isDisplay = cleanDesc.toLowerCase().includes('display') || cleanDesc.toLowerCase().includes('screen');
    const catId = isDisplay ? 'cat-display' : 'cat-battery';

    records.push({
      repairNumber: repairNo,
      closedDate: typeof rawMonth === 'number' ? MONTH_NAMES[monthIdx] : (String(rawMonth) || MONTH_NAMES[monthIdx]),
      monthIndex: monthIdx,
      partNumber: cleanPn,
      description: cleanDesc,
      siteId: matchedSiteId,
      rawSiteName: rawSite,
      quantity: rawQty,
      serialNumber: serial,
      category_id: catId
    });

    if (!partMap.has(cleanPn)) {
      partMap.set(cleanPn, {
        partNumber: cleanPn,
        description: cleanDesc,
        category_id: catId,
        months: [0, 0, 0, 0, 0, 0, 0, 0],
        siteCounts: {}
      });
    }

    const pData = partMap.get(cleanPn);
    while (pData.months.length <= monthIdx) {
      pData.months.push(0);
    }
    pData.months[monthIdx] = (pData.months[monthIdx] || 0) + rawQty;
    pData.siteCounts[matchedSiteId] = (pData.siteCounts[matchedSiteId] || 0) + rawQty;
  }

  const finalSitesList = existingSites.length > 0 ? [...existingSites] : [];
  discoveredSites.forEach(s => {
    if (s.id && !finalSitesList.some(es => es.id === s.id)) {
      finalSitesList.push(s);
    }
  });

  const forecastItems = [];
  const allocations = [];
  const parts = [];
  const nonDcBranchSites = finalSitesList.filter(s => !s.is_dc);

  partMap.forEach((data, pn) => {
    // Only pass historical months (e.g. Jan..Jul) prior to target month
    const historyMonths = data.months.length > targetMonthIdx
      ? data.months.slice(0, targetMonthIdx)
      : (data.months.length > 1 ? data.months.slice(0, data.months.length - 1) : data.months);
    const computedForecast = calculateLinearRegressionForecast(historyMonths, targetMonthIdx + 1);
    const recOrder = calculateRecommendedOrder(computedForecast, 0.05);

    forecastItems.push({
      part_id: `part-${pn}`,
      part_number: pn,
      description: data.description,
      category_id: data.category_id,
      ytd_monthly_counts: data.months,
      computed_forecast: computedForecast,
      admin_override: null,
      final_forecast: computedForecast,
      safety_stock_units: recOrder.safetyUnits,
      recommended_order: recOrder.recommendedOrder
    });

    const siteDemands = nonDcBranchSites.map(s => ({
      siteId: s.id,
      historicalDemand: data.siteCounts[s.id] || 0
    }));

    const allocatedResults = calculateProportionalAllocation(computedForecast, siteDemands);
    const siteQuantities = {};
    allocatedResults.forEach(res => {
      siteQuantities[res.siteId] = res.allocatedQty;
    });

    const split = calculateWeeklySplit(computedForecast, 0);

    allocations.push({
      part_id: `part-${pn}`,
      part_number: pn,
      description: data.description,
      category_id: data.category_id,
      forecasted_qty: computedForecast,
      stocking_price: data.category_id === 'cat-display' ? 280 : 99,
      total_allocated_qty: computedForecast,
      w1_qty: split.week1,
      w2_qty: split.week2,
      w3_qty: split.week3,
      w4_qty: split.week4,
      site_quantities: siteQuantities
    });

    parts.push({
      id: `part-${pn}`,
      part_number: pn,
      description: data.description,
      category_id: data.category_id,
      iphone_model: data.description.replace(/^(Battery|Display),?\s*/i, ''),
      stocking_price: data.category_id === 'cat-display' ? 280 : 99,
      safety_stock_pct: 0.05,
      is_active: true
    });
  });

  return {
    records,
    forecastItems,
    allocations,
    parts,
    sites: finalSitesList,
    totalRawRowsRead,
    filteredOutCount
  };
}

export function exportAllocationToExcel(allocations, sites, period = 'August 2026') {
  const headers = ['Part Number', 'Description', 'Total Allocated', 'Week 1', 'Week 2', 'Week 3', 'Week 4'];
  sites.forEach(s => headers.push(s.code));

  const rows = allocations.map(item => {
    const split = calculateWeeklySplit(item.total_allocated_qty, 0);
    const r = [
      item.part_number,
      item.description,
      item.total_allocated_qty,
      split.week1,
      split.week2,
      split.week3,
      split.week4
    ];
    sites.forEach(s => {
      r.push(item.site_quantities?.[s.id] || 0);
    });
    return r;
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Master Allocation');
  XLSX.writeFile(wb, `Master_Allocation_${period.replace(/\s+/g, '_')}.xlsx`);
}

export function downloadSampleGsxFixablyCsv(existingSites = [], existingParts = []) {
  const sampleRecords = [
    {
      'Repair Number': 'RPR-2026-00101',
      'Closed Date': '2026-08-01',
      'Site Name': 'MOBILECARE - APP BONIFACIO HIGH STREET',
      'Part Number': '661-21991',
      'Part Description': 'Battery, iPhone 13',
      'Quantity': 1,
      'Serial Number': 'F8Y6276C0DF18FKBQ',
      'Order ID': 'GSX-ORD-99101'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRecords);
  const csvContent = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'Fixably_GSX_Raw_Usage_Template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download a sample XLSX or CSV template specifically for Receive Scan-In parts intake
 */
export function downloadScanInTemplate(format = 'xlsx', existingParts = [], purchaseOrders = []) {
  const defaultPoNumber = purchaseOrders[0]?.po_number || 'PO-2026-08-001';
  
  const sampleRows = [
    {
      'Part Number': '661-21991',
      'Serial Number': `F8Y${Math.floor(100000 + Math.random() * 900000)}13XCB`,
      'Description': 'Battery, iPhone 13',
      'PO Number': defaultPoNumber,
      'Box Number': 1
    },
    {
      'Part Number': '661-21996',
      'Serial Number': `DNM${Math.floor(100000 + Math.random() * 900000)}33817`,
      'Description': 'Battery, iPhone 13 Pro',
      'PO Number': defaultPoNumber,
      'Box Number': 1
    },
    {
      'Part Number': '661-22294',
      'Serial Number': `DN8${Math.floor(100000 + Math.random() * 900000)}MCN3R`,
      'Description': 'Battery, iPhone 13 Pro Max',
      'PO Number': defaultPoNumber,
      'Box Number': 1
    },
    {
      'Part Number': '661-30401',
      'Serial Number': `GH3${Math.floor(100000 + Math.random() * 900000)}00MUZ`,
      'Description': 'Display, iPhone 14 Pro Max',
      'PO Number': defaultPoNumber,
      'Box Number': 2
    },
    {
      'Part Number': '661-31422',
      'Serial Number': `CK9${Math.floor(100000 + Math.random() * 900000)}449KL`,
      'Description': 'Display, iPhone 15 Pro',
      'PO Number': defaultPoNumber,
      'Box Number': 2
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  // Set nice column widths
  ws['!cols'] = [
    { wch: 16 }, // Part Number
    { wch: 24 }, // Serial Number
    { wch: 32 }, // Description
    { wch: 20 }, // PO Number
    { wch: 12 }  // Box Number
  ];

  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'MDC_Receive_Parts_Import_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parts Intake');
    XLSX.writeFile(wb, 'MDC_Receive_Parts_Import_Template.xlsx');
  }
}

/**
 * Parse an uploaded XLSX or CSV file for batch parts receiving into DC inventory
 */
export async function parseScanInPartsFile(file, existingParts = [], existingUnits = [], purchaseOrders = []) {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    // Pick the first sheet with data
    let targetSheetName = workbook.SheetNames[0];
    for (const sName of workbook.SheetNames) {
      if (/parts|intake|receive|inventory|scan/i.test(sName)) {
        targetSheetName = sName;
        break;
      }
    }

    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      return { success: false, error: 'No readable sheets found in file.' };
    }

    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 2) {
      return { success: false, error: 'File is empty or contains no data rows.' };
    }

    // Find header row (usually first non-empty row)
    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      const rowStr = (rawRows[i] || []).map(c => String(c).toLowerCase()).join(' ');
      if (rowStr.includes('part') || rowStr.includes('serial') || rowStr.includes('p/n') || rowStr.includes('s/n') || rowStr.includes('item')) {
        headerIdx = i;
        break;
      }
    }

    const headers = rawRows[headerIdx].map(h => String(h || '').trim());
    const headerMap = {};

    headers.forEach((h, colIdx) => {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (/^(partnumber|partno|part|pn|itemnumber|itemno|partcode)$/.test(lower)) {
        headerMap.pn = colIdx;
      } else if (/^(serialnumber|serialno|serial|sn|imei|barcode)$/.test(lower)) {
        headerMap.serial = colIdx;
      } else if (/^(description|partdescription|itemdescription|desc|name|title)$/.test(lower)) {
        headerMap.desc = colIdx;
      } else if (/^(ponumber|pono|po|purchaseorder|ordernumber|orderid)$/.test(lower)) {
        headerMap.po = colIdx;
      } else if (/^(boxnumber|boxno|box|carton|package)$/.test(lower)) {
        headerMap.box = colIdx;
      } else if (/^(quantity|qty|count|units)$/.test(lower)) {
        headerMap.qty = colIdx;
      }
    });

    // Fallback if header names weren't perfectly matched
    if (headerMap.pn === undefined && headers.length > 0) headerMap.pn = 0;
    if (headerMap.serial === undefined && headers.length > 1) headerMap.serial = 1;
    if (headerMap.desc === undefined && headers.length > 2) headerMap.desc = 2;

    const parsedItems = [];
    const seenSerialsInBatch = new Set();
    const existingSerialsSet = new Set((existingUnits || []).map(u => String(u.serial_number || '').trim().toUpperCase()));

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0 || row.every(cell => String(cell || '').trim() === '')) {
        continue; // Skip empty rows
      }

      const rawPn = headerMap.pn !== undefined ? String(row[headerMap.pn] || '').trim() : '';
      let rawSerial = headerMap.serial !== undefined ? String(row[headerMap.serial] || '').trim() : '';
      const rawDesc = headerMap.desc !== undefined ? String(row[headerMap.desc] || '').trim() : '';
      const rawPo = headerMap.po !== undefined ? String(row[headerMap.po] || '').trim() : '';
      const rawBox = headerMap.box !== undefined ? parseInt(row[headerMap.box], 10) || 1 : 1;
      const rawQty = headerMap.qty !== undefined ? parseInt(row[headerMap.qty], 10) || 1 : 1;

      if (!rawPn && !rawSerial) {
        continue;
      }

      const cleanPN = rawPn.toUpperCase();
      
      // Lookup part in existing catalog
      const existingPart = existingParts.find(p => p.part_number.toUpperCase() === cleanPN);
      const partDesc = rawDesc || existingPart?.description || `Replacement Part (${cleanPN || 'Custom'})`;
      
      // Match PO if specified
      let matchedPoId = null;
      let matchedPoNumber = null;
      if (rawPo) {
        const foundPo = purchaseOrders.find(po => 
          po.po_number.toLowerCase() === rawPo.toLowerCase() || 
          po.id.toLowerCase() === rawPo.toLowerCase()
        );
        if (foundPo) {
          matchedPoId = foundPo.id;
          matchedPoNumber = foundPo.po_number;
        } else {
          matchedPoNumber = rawPo;
        }
      }

      // Quantity expansion if quantity > 1 and multiple items need to be generated
      const itemsToGenerate = Math.max(1, rawQty);

      for (let q = 0; q < itemsToGenerate; q++) {
        let currentSerial = rawSerial;
        if (!currentSerial || (q > 0 && currentSerial === rawSerial)) {
          // Generate unique serial if missing or multi-quantity
          currentSerial = `AUTO-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        }
        
        const cleanSerial = currentSerial.toUpperCase();
        let status = 'VALID';
        let statusMessage = 'Ready to Import';

        if (!cleanPN) {
          status = 'ERROR';
          statusMessage = 'Missing Part Number';
        } else if (existingSerialsSet.has(cleanSerial)) {
          status = 'DUPLICATE';
          statusMessage = 'Serial already in DC inventory';
        } else if (seenSerialsInBatch.has(cleanSerial)) {
          status = 'DUPLICATE';
          statusMessage = 'Duplicate Serial in file';
        } else if (!existingPart) {
          status = 'NEW_PART';
          statusMessage = 'New Part (will auto-register in catalog)';
        }

        seenSerialsInBatch.add(cleanSerial);

        parsedItems.push({
          id: `batch-${i}-${q}-${Math.random().toString(36).substr(2, 5)}`,
          rowNumber: i + 1,
          partNumber: cleanPN,
          serialNumber: cleanSerial,
          description: partDesc,
          poId: matchedPoId,
          poNumber: matchedPoNumber || rawPo || null,
          boxNumber: rawBox,
          status,
          statusMessage,
          isExistingPart: !!existingPart
        });
      }
    }

    if (parsedItems.length === 0) {
      return { success: false, error: 'No valid part records found in the uploaded file.' };
    }

    const validCount = parsedItems.filter(it => it.status === 'VALID' || it.status === 'NEW_PART').length;
    const duplicateCount = parsedItems.filter(it => it.status === 'DUPLICATE').length;
    const newPartsCount = parsedItems.filter(it => it.status === 'NEW_PART').length;
    const errorCount = parsedItems.filter(it => it.status === 'ERROR').length;

    return {
      success: true,
      fileName: file.name,
      items: parsedItems,
      summary: {
        total: parsedItems.length,
        valid: validCount,
        duplicates: duplicateCount,
        newParts: newPartsCount,
        errors: errorCount
      }
    };
  } catch (err) {
    console.error('Error parsing scan-in file:', err);
    return { success: false, error: `Failed to parse file: ${err.message}` };
  }
}

/**
 * Download a sample XLSX or CSV template for Pack Scan-Out
 */
export function downloadScanOutTemplate(format = 'xlsx', existingSites = [], existingInventory = []) {
  const serviceSites = (existingSites || []).filter(s => !s.is_dc);
  const sampleSiteCode = serviceSites[0]?.code || 'APP BHS';
  const availableStock = (existingInventory || []).filter(u => u.status === 'in_stock');

  const sampleRows = [
    {
      'Part Number': availableStock[0]?.part_number || '661-21991',
      'Serial Number': availableStock[0]?.serial_number || 'F8Y12345613XCB',
      'Box Number': 1,
      'Destination Site': sampleSiteCode,
      'Notes': 'iPhone 13 Battery'
    },
    {
      'Part Number': availableStock[1]?.part_number || '661-21996',
      'Serial Number': availableStock[1]?.serial_number || 'DNM65432133817',
      'Box Number': 1,
      'Destination Site': sampleSiteCode,
      'Notes': 'iPhone 13 Pro Battery'
    },
    {
      'Part Number': availableStock[2]?.part_number || '661-30401',
      'Serial Number': availableStock[2]?.serial_number || 'GH398765400MUZ',
      'Box Number': 2,
      'Destination Site': sampleSiteCode,
      'Notes': 'iPhone 14 Pro Max Display'
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 16 }, // Part Number
    { wch: 24 }, // Serial Number
    { wch: 12 }, // Box Number
    { wch: 20 }, // Destination Site
    { wch: 28 }  // Notes
  ];

  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'MDC_Pack_ScanOut_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pack ScanOut');
    XLSX.writeFile(wb, 'MDC_Pack_ScanOut_Template.xlsx');
  }
}

/**
 * Parse an uploaded XLSX or CSV file for Pack Scan-Out
 */
export async function parseScanOutPartsFile(file, inventoryUnits = [], sites = [], defaultSiteId = null) {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    let targetSheetName = workbook.SheetNames[0];
    for (const sName of workbook.SheetNames) {
      if (/pack|out|ship|manifest|scan/i.test(sName)) {
        targetSheetName = sName;
        break;
      }
    }

    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      return { success: false, error: 'No readable sheets found in file.' };
    }

    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 2) {
      return { success: false, error: 'File is empty or contains no data rows.' };
    }

    let headerIdx = 0;
    for (let i = 0; i < Math.min(10, rawRows.length); i++) {
      const rowStr = (rawRows[i] || []).map(c => String(c).toLowerCase()).join(' ');
      if (rowStr.includes('part') || rowStr.includes('serial') || rowStr.includes('box') || rowStr.includes('site') || rowStr.includes('p/n')) {
        headerIdx = i;
        break;
      }
    }

    const headers = rawRows[headerIdx].map(h => String(h || '').trim());
    const headerMap = {};

    headers.forEach((h, colIdx) => {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (/^(partnumber|partno|part|pn|itemnumber|itemno)$/.test(lower)) {
        headerMap.pn = colIdx;
      } else if (/^(serialnumber|serialno|serial|sn|barcode|imei)$/.test(lower)) {
        headerMap.serial = colIdx;
      } else if (/^(boxnumber|boxno|box|carton|pkg)$/.test(lower)) {
        headerMap.box = colIdx;
      } else if (/^(destinationsite|destination|site|branch|location|asp)$/.test(lower)) {
        headerMap.site = colIdx;
      } else if (/^(notes|description|desc|remarks)$/.test(lower)) {
        headerMap.notes = colIdx;
      }
    });

    if (headerMap.pn === undefined && headers.length > 0) headerMap.pn = 0;
    if (headerMap.serial === undefined && headers.length > 1) headerMap.serial = 1;

    const parsedItems = [];
    const seenSerials = new Set();

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0 || row.every(cell => String(cell || '').trim() === '')) {
        continue;
      }

      const rawPn = headerMap.pn !== undefined ? String(row[headerMap.pn] || '').trim().toUpperCase() : '';
      const rawSerial = headerMap.serial !== undefined ? String(row[headerMap.serial] || '').trim().toUpperCase() : '';
      const rawBox = headerMap.box !== undefined ? parseInt(row[headerMap.box], 10) || 1 : 1;
      const rawSite = headerMap.site !== undefined ? String(row[headerMap.site] || '').trim() : '';

      if (!rawPn && !rawSerial) continue;

      let status = 'VALID';
      let statusMessage = 'In Stock (Ready to Pack)';
      let matchedUnit = null;

      // Check against inventoryUnits in DC
      matchedUnit = inventoryUnits.find(u =>
        u.serial_number.toUpperCase() === rawSerial &&
        (!rawPn || u.part_number.toUpperCase() === rawPn)
      );

      if (!matchedUnit) {
        // Fallback search by serial only
        matchedUnit = inventoryUnits.find(u => u.serial_number.toUpperCase() === rawSerial);
      }

      if (!matchedUnit) {
        status = 'NOT_FOUND';
        statusMessage = 'Serial not found in DC inventory';
      } else if (matchedUnit.status !== 'in_stock' && matchedUnit.status !== 'allocated') {
        status = 'ALREADY_PACKED';
        statusMessage = `Unit already has status "${matchedUnit.status}"`;
      } else if (seenSerials.has(rawSerial)) {
        status = 'DUPLICATE';
        statusMessage = 'Duplicate Serial in file';
      }

      seenSerials.add(rawSerial);

      // Match destination site if present in row
      let rowSiteId = defaultSiteId;
      if (rawSite) {
        const foundSite = sites.find(s =>
          s.code?.toLowerCase() === rawSite.toLowerCase() ||
          s.name?.toLowerCase() === rawSite.toLowerCase() ||
          s.id === rawSite
        );
        if (foundSite) rowSiteId = foundSite.id;
      }

      parsedItems.push({
        id: `pack-batch-${i}-${Math.random().toString(36).substr(2, 5)}`,
        rowNumber: i + 1,
        partNumber: rawPn || matchedUnit?.part_number || 'UNKNOWN',
        serialNumber: rawSerial,
        description: matchedUnit?.description || `Part (${rawPn})`,
        boxNumber: rawBox,
        siteId: rowSiteId,
        siteName: sites.find(s => s.id === rowSiteId)?.name || 'Default Branch',
        status,
        statusMessage,
        inventoryUnitId: matchedUnit?.id || null
      });
    }

    if (parsedItems.length === 0) {
      return { success: false, error: 'No valid parts found in file.' };
    }

    const validCount = parsedItems.filter(it => it.status === 'VALID').length;
    const notFoundCount = parsedItems.filter(it => it.status === 'NOT_FOUND').length;
    const duplicateCount = parsedItems.filter(it => it.status === 'DUPLICATE' || it.status === 'ALREADY_PACKED').length;

    return {
      success: true,
      fileName: file.name,
      items: parsedItems,
      summary: {
        total: parsedItems.length,
        valid: validCount,
        notFound: notFoundCount,
        duplicates: duplicateCount
      }
    };
  } catch (err) {
    console.error('Error parsing pack scan-out file:', err);
    return { success: false, error: `Failed to parse file: ${err.message}` };
  }
}

/**
 * Download a sample XLSX or CSV template for Shipment Manifests
 */
export function downloadShipmentManifestTemplate(format = 'xlsx', existingSites = []) {
  const serviceSites = (existingSites || []).filter(s => !s.is_dc);
  const sampleSiteCode = serviceSites[0]?.code || 'APP BHS';

  const sampleRows = [
    {
      'Invoice Ref': 'DCMSPIOWNED#20260810A',
      'Shipment Number': 'SHIP-202608-001',
      'Destination Site': sampleSiteCode,
      'Shipment Date': '2026-08-10',
      'Carrier': 'Lite Express',
      'Tracking Number': '20227258',
      'Total Boxes': 1,
      'Status': 'shipped',
      'Prepared By': 'Joshua Juvida',
      'Verified By': 'Anjo Alcazar',
      'Part Number': '661-21991',
      'Serial Number': 'F8Y6276C1UQ13XCB1',
      'Description': 'Battery, iPhone 13',
      'Box Number': 1
    },
    {
      'Invoice Ref': 'DCMSPIOWNED#20260810A',
      'Shipment Number': 'SHIP-202608-001',
      'Destination Site': sampleSiteCode,
      'Shipment Date': '2026-08-10',
      'Carrier': 'Lite Express',
      'Tracking Number': '20227258',
      'Total Boxes': 1,
      'Status': 'shipped',
      'Prepared By': 'Joshua Juvida',
      'Verified By': 'Anjo Alcazar',
      'Part Number': '661-21996',
      'Serial Number': 'DNM6276C1UQ133817',
      'Description': 'Battery, iPhone 13 Pro',
      'Box Number': 1
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows);
  ws['!cols'] = [
    { wch: 22 }, // Invoice Ref
    { wch: 18 }, // Shipment Number
    { wch: 18 }, // Destination Site
    { wch: 14 }, // Shipment Date
    { wch: 16 }, // Carrier
    { wch: 16 }, // Tracking Number
    { wch: 12 }, // Total Boxes
    { wch: 12 }, // Status
    { wch: 16 }, // Prepared By
    { wch: 16 }, // Verified By
    { wch: 16 }, // Part Number
    { wch: 22 }, // Serial Number
    { wch: 26 }, // Description
    { wch: 12 }  // Box Number
  ];

  if (format === 'csv') {
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'MDC_Shipment_Manifest_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shipments');
    XLSX.writeFile(wb, 'MDC_Shipment_Manifest_Template.xlsx');
  }
}

/**
 * Parse an uploaded XLSX or CSV file for Batch Shipments & Manifests
 */
export async function parseShipmentManifestFile(file, sites = [], parts = []) {
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) return { success: false, error: 'No readable sheets found.' };

    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return { success: false, error: 'File is empty.' };
    }

    const shipmentsMap = new Map();

    rawRows.forEach((row, idx) => {
      const invoiceRef = row['Invoice Ref'] || row['invoice_ref'] || row['Invoice'] || row['Reference'] || `MANUAL-${Date.now()}`;
      const shipmentNum = row['Shipment Number'] || row['shipment_number'] || row['Shipment #'] || `SHIP-${Date.now()}-${idx}`;
      const siteStr = row['Destination Site'] || row['Destination'] || row['Site'] || row['Branch'] || '';
      const carrier = row['Carrier'] || 'Lite Express';
      const tracking = row['Tracking Number'] || row['Tracking'] || 'N/A';
      const status = (row['Status'] || 'shipped').toLowerCase();
      const prepBy = row['Prepared By'] || 'Warehouse Staff';
      const verBy = row['Verified By'] || 'Admin Staff';
      const shipDate = row['Shipment Date'] || new Date().toISOString().split('T')[0];
      const pn = row['Part Number'] || row['Part #'] || row['P/N'] || '';
      const sn = row['Serial Number'] || row['Serial #'] || row['S/N'] || '';
      const desc = row['Description'] || `Part (${pn})`;
      const box = parseInt(row['Box Number'] || row['Box'], 10) || 1;

      const key = `${invoiceRef}__${shipmentNum}`;

      if (!shipmentsMap.has(key)) {
        let destSite = sites.find(s => s.code?.toLowerCase() === siteStr.toLowerCase() || s.name?.toLowerCase() === siteStr.toLowerCase());
        if (!destSite) destSite = sites.find(s => !s.is_dc) || sites[0];

        shipmentsMap.set(key, {
          id: `ship-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          shipment_number: shipmentNum,
          invoice_ref: invoiceRef,
          site_id: destSite?.id,
          site_name: destSite?.name,
          shipment_date: shipDate,
          carrier,
          tracking_number: tracking,
          total_boxes: box,
          status,
          prepared_by_name: prepBy,
          verified_by_name: verBy,
          receiving_signature: destSite?.code || 'ASP',
          remarks: 'KGB PARTS',
          items: []
        });
      }

      const sh = shipmentsMap.get(key);
      if (box > sh.total_boxes) sh.total_boxes = box;

      if (pn && sn) {
        sh.items.push({
          part_number: pn,
          description: desc,
          serial_number: sn,
          box_number: box
        });
      }
    });

    const parsedShipments = Array.from(shipmentsMap.values());
    return {
      success: true,
      fileName: file.name,
      shipments: parsedShipments,
      totalItems: parsedShipments.reduce((acc, s) => acc + s.items.length, 0)
    };
  } catch (err) {
    console.error('Error parsing shipment manifest file:', err);
    return { success: false, error: `Failed to parse file: ${err.message}` };
  }
}

