/**
 * Forecasting Engine for Apple Parts Usage
 * Replicates and extends Excel's FORECAST.LINEAR formula
 */

/**
 * Calculates linear regression forecast given an array of historical numbers
 * Equivalent to FORECAST.LINEAR(targetX, yValues, xValues)
 *
 * @param {number[]} yValues - Array of historical monthly counts [Jan, Feb, ..., Current]
 * @param {number} targetX - Target month index (e.g. 8 for August when history is Jan-Jul)
 * @returns {number} Forecasted integer demand (rounded, minimum 0)
 */
export function calculateLinearRegressionForecast(yValues = [], targetX = null) {
  if (!yValues || yValues.length === 0) return 0;
  
  // Identify populated non-zero historical data points
  const activeEntries = [];
  yValues.forEach((y, idx) => {
    if (y !== undefined && y !== null && y > 0) {
      activeEntries.push({ x: idx + 1, y: Number(y) });
    }
  });

  if (activeEntries.length === 0) return 0;
  if (activeEntries.length === 1) {
    return Math.max(0, Math.round(activeEntries[0].y));
  }

  const k = activeEntries.length;
  const target = targetX !== null ? targetX : yValues.length + 1;
  
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < k; i++) {
    const { x, y } = activeEntries[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denominator = k * sumXX - sumX * sumX;
  if (denominator === 0) {
    const avg = sumY / k;
    return Math.max(0, Math.round(avg));
  }

  // Slope (beta) and Intercept (alpha)
  const slope = (k * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / k;

  const rawForecast = intercept + slope * target;
  return Math.max(0, Math.round(rawForecast));
}

/**
 * Calculates rolling N-month linear regression or average
 */
export function calculateRollingForecast(yValues = [], windowSize = 4) {
  if (!yValues || yValues.length === 0) return 0;
  const sliced = yValues.slice(-windowSize);
  return calculateLinearRegressionForecast(sliced, sliced.length + 1);
}

/**
 * Calculates forecast variance and accuracy category
 */
export function calculateForecastVariance(actual, forecasted) {
  const variance = actual - forecasted;
  let remarks = 'Accurate';
  if (variance > 0) remarks = 'Under Forecast';
  else if (variance < 0) remarks = 'Over Forecast';
  
  const pctError = forecasted > 0 ? ((actual - forecasted) / forecasted) * 100 : 0;
  return { variance, remarks, pctError: Math.round(pctError) };
}

/**
 * Calculates recommended order with safety stock buffer
 */
export function calculateRecommendedOrder(baseForecast, safetyStockPct = 0.05, override = null) {
  const effectiveForecast = override !== null && override !== undefined && override !== '' 
    ? Number(override) 
    : baseForecast;
  
  const safetyUnits = Math.round(effectiveForecast * safetyStockPct);
  const recommendedOrder = Math.max(0, effectiveForecast + safetyUnits);
  
  return {
    effectiveForecast,
    safetyUnits,
    recommendedOrder
  };
}
