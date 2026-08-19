/**
 * Allocation Engine for Multi-Site Distribution
 * Implements Hamilton-Hare Largest Remainder Quota Allocation and Verified 4-Week Split
 */

/**
 * Calculates fair proportional allocation across sites using Excel Cumulative Rounding Formula:
 * =IF(ForecastQty<=0, 0, MAX(0, ROUND(ForecastQty * SUM($H$share:Col$share), 0) - ROUND(ForecastQty * (SUM($H$share:Col$share) - Col$share), 0)))
 * Guarantees that sum(allocations) exactly equals totalReceivedQty with zero inflation and no rounding drift.
 *
 * @param {number} totalReceivedQty - Total monthly forecasted quantity / available stock to allocate
 * @param {Array<{siteId: string, historicalDemand: number, orderedQty?: number}>} siteDemands
 * @returns {Array<{siteId: string, sharePct: number, allocatedQty: number}>}
 */
export function calculateProportionalAllocation(totalReceivedQty, siteDemands = []) {
  if (totalReceivedQty <= 0 || !siteDemands || siteDemands.length === 0) {
    return siteDemands.map(s => ({
      siteId: s.siteId,
      sharePct: 0,
      allocatedQty: 0
    }));
  }

  const targetQty = Math.max(0, Math.round(totalReceivedQty));
  if (targetQty === 0) {
    return siteDemands.map(s => ({
      siteId: s.siteId,
      sharePct: 0,
      allocatedQty: 0
    }));
  }

  const totalDemand = siteDemands.reduce((sum, s) => sum + (s.historicalDemand || 0), 0);

  // If no demand history across any site, distribute evenly
  if (totalDemand === 0) {
    let cumulativeDemandShare = 0;
    const uniformShare = 1 / siteDemands.length;
    return siteDemands.map((s, idx) => {
      const prevCum = cumulativeDemandShare;
      cumulativeDemandShare = (idx + 1) * uniformShare;
      const allocatedQty = Math.max(
        0,
        Math.round(targetQty * cumulativeDemandShare) - Math.round(targetQty * prevCum)
      );
      return {
        siteId: s.siteId,
        sharePct: uniformShare,
        allocatedQty
      };
    });
  }

  // Exact Excel Cumulative Rounding Formula
  let cumulativeShare = 0;
  return siteDemands.map(s => {
    const demand = s.historicalDemand || 0;
    const sharePct = demand / totalDemand;
    const prevCumulativeShare = cumulativeShare;
    cumulativeShare += sharePct;

    const allocatedQty = Math.max(
      0,
      Math.round(targetQty * cumulativeShare) - Math.round(targetQty * prevCumulativeShare)
    );

    return {
      siteId: s.siteId,
      sharePct,
      allocatedQty
    };
  });
}

/**
 * Calculates 4-Week Split matching verified Excel formula:
 * =LET(p, AI, b, INT(p/4), rem, MOD(p, 4), dir, ISEVEN(ROW()),
 *      w1, b + IF(dir, IF(rem>=1, 1, 0), 0),
 *      w2, b + IF(dir, IF(rem>=2, 1, 0), IF(rem=3, 1, 0)),
 *      w3, b + IF(dir, IF(rem=3, 1, 0), IF(rem>=2, 1, 0)),
 *      w4, p - w1 - w2 - w3,
 *      [w1, w2, w3, w4])
 *
 * @param {number} totalQty - Total monthly quantity allocated to a site
 * @param {number} rowIndex - Row index for alternating direction parity
 * @returns {{week1: number, week2: number, week3: number, week4: number}}
 */
export function calculateWeeklySplit(totalQty, rowIndex = 0) {
  const p = Math.max(0, Math.round(totalQty || 0));
  if (p === 0) return { week1: 0, week2: 0, week3: 0, week4: 0 };

  const b = Math.floor(p / 4);
  const rem = p % 4;
  const isEven = rowIndex % 2 === 0;

  const w1 = b + (isEven ? (rem >= 1 ? 1 : 0) : 0);
  const w2 = b + (isEven ? (rem >= 2 ? 1 : 0) : (rem === 3 ? 1 : 0));
  const w3 = b + (isEven ? (rem === 3 ? 1 : 0) : (rem >= 2 ? 1 : 0));
  const w4 = p - w1 - w2 - w3;

  return {
    week1: w1,
    week2: w2,
    week3: w3,
    week4: w4
  };
}
