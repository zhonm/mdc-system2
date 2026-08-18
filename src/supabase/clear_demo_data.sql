-- ============================================================================
-- MDC SYSTEM 2: Clear All Operational Demo Data (Clean Slate)
-- ============================================================================
-- This script wipes all mock/demo forecasts, allocations, purchase orders, 
-- inventory units, shipments, and raw logs while preserving:
-- 1. Profiles & Superadmin Users (Zhon Manaois & Joshua Juvida)
-- 2. User Page Permissions
-- 3. Service Sites & Branches
-- 4. Part Categories

-- Truncate operational transactional tables
TRUNCATE TABLE 
    scan_logs,
    shipment_items,
    shipments,
    allocation_items,
    allocation_cycles,
    inventory_units,
    po_items,
    purchase_orders,
    forecast_entries,
    forecast_cycles,
    repair_usage_records
CASCADE;

-- Optional: If you want to also clear the parts catalog to be 100% dynamically created on file upload:
-- TRUNCATE TABLE parts CASCADE;
