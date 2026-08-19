-- ============================================================================
-- SQL Migration: Update Parts Catalog Stocking Prices to Match Apple Master CSV
-- Generated on: 2026-08-19
-- ============================================================================

-- 1. Targeted updates for previously mismatched parts:
UPDATE parts SET stocking_price = 89.00, updated_at = NOW() WHERE part_number = '661-17920';
UPDATE parts SET stocking_price = 219.00, updated_at = NOW() WHERE part_number = '661-35696';
UPDATE parts SET stocking_price = 169.00, updated_at = NOW() WHERE part_number = '661-35828';
UPDATE parts SET stocking_price = 169.00, updated_at = NOW() WHERE part_number = '661-37216';

-- 2. Comprehensive sync for all 43 catalog parts:
UPDATE parts SET stocking_price = 279.00, updated_at = NOW() WHERE part_number = '661-21993';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-22309';
UPDATE parts SET stocking_price = 279.00, updated_at = NOW() WHERE part_number = '661-30366';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-30390';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-29370';
UPDATE parts SET stocking_price = 379.00, updated_at = NOW() WHERE part_number = '661-30401';
UPDATE parts SET stocking_price = 279.00, updated_at = NOW() WHERE part_number = '661-36706';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-37213';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-35699';
UPDATE parts SET stocking_price = 379.00, updated_at = NOW() WHERE part_number = '661-36915';
UPDATE parts SET stocking_price = 279.00, updated_at = NOW() WHERE part_number = '661-44797';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-42843';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-42726';
UPDATE parts SET stocking_price = 379.00, updated_at = NOW() WHERE part_number = '661-44955';
UPDATE parts SET stocking_price = 229.00, updated_at = NOW() WHERE part_number = '661-49431';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-56065';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-56125';
UPDATE parts SET stocking_price = 379.00, updated_at = NOW() WHERE part_number = '661-56050';
UPDATE parts SET stocking_price = 229.00, updated_at = NOW() WHERE part_number = '661-60211';
UPDATE parts SET stocking_price = 329.00, updated_at = NOW() WHERE part_number = '661-55240';
UPDATE parts SET stocking_price = 89.00, updated_at = NOW() WHERE part_number = '661-21991';
UPDATE parts SET stocking_price = 89.00, updated_at = NOW() WHERE part_number = '661-21996';
UPDATE parts SET stocking_price = 89.00, updated_at = NOW() WHERE part_number = '661-22294';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-30373';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-30394';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-30382';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-30397';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-35885';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-37207';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-35694';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-36918';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-44796';
UPDATE parts SET stocking_price = 119.00, updated_at = NOW() WHERE part_number = '661-42720';
UPDATE parts SET stocking_price = 119.00, updated_at = NOW() WHERE part_number = '661-44954';
UPDATE parts SET stocking_price = 99.00, updated_at = NOW() WHERE part_number = '661-56064';
UPDATE parts SET stocking_price = 119.00, updated_at = NOW() WHERE part_number = '661-55235';
UPDATE parts SET stocking_price = 119.00, updated_at = NOW() WHERE part_number = '661-56121';
UPDATE parts SET stocking_price = 119.00, updated_at = NOW() WHERE part_number = '661-56049';
UPDATE parts SET stocking_price = 279.00, updated_at = NOW() WHERE part_number = '661-21988';
UPDATE parts SET stocking_price = 89.00, updated_at = NOW() WHERE part_number = '661-17920';
UPDATE parts SET stocking_price = 219.00, updated_at = NOW() WHERE part_number = '661-35696';
UPDATE parts SET stocking_price = 169.00, updated_at = NOW() WHERE part_number = '661-35828';
UPDATE parts SET stocking_price = 169.00, updated_at = NOW() WHERE part_number = '661-37216';
