-- ============================================================================
-- MDC SYSTEM 2: Database Update Migration
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- 1. Create the Saved Period Records Table (Historical Snapshots)
CREATE TABLE IF NOT EXISTS saved_records (
    id TEXT PRIMARY KEY,
    record_type TEXT NOT NULL DEFAULT 'both', -- 'forecast' | 'allocation' | 'both'
    period_label TEXT NOT NULL,                -- e.g. "August 2026 – Week 1"
    period_year INT NOT NULL,                 -- e.g. 2026
    period_month INT NOT NULL,                -- 1 to 12
    period_week INT,                          -- 1 to 4 or NULL for full month
    notes TEXT,
    saved_by_name TEXT,
    saved_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- self-contained copy of forecast, allocations, parts, sites
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for Fast Querying & Filtering
CREATE INDEX IF NOT EXISTS idx_saved_records_created_at ON saved_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_records_type ON saved_records(record_type);
CREATE INDEX IF NOT EXISTS idx_saved_records_period ON saved_records(period_year, period_month);

-- 3. Enable Row Level Security (RLS) & Permissive Policies
ALTER TABLE saved_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow public read of saved_records" ON saved_records
        FOR SELECT TO public USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public insert of saved_records" ON saved_records
        FOR INSERT TO public WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public update of saved_records" ON saved_records
        FOR UPDATE TO public USING (true) WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public delete of saved_records" ON saved_records
        FOR DELETE TO public USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. Grant 'records' Page Permission to Superadmins & Admins
DO $$
DECLARE
    uid UUID;
BEGIN
    -- Grant to Superadmins
    FOR uid IN SELECT id FROM profiles WHERE role = 'superadmin' LOOP
        INSERT INTO user_page_permissions (user_id, page_id)
        VALUES (uid, 'records')
        ON CONFLICT (user_id, page_id) DO NOTHING;
    END LOOP;

    -- Grant to Admins
    FOR uid IN SELECT id FROM profiles WHERE role = 'admin' LOOP
        INSERT INTO user_page_permissions (user_id, page_id)
        VALUES (uid, 'records')
        ON CONFLICT (user_id, page_id) DO NOTHING;
    END LOOP;

    -- Grant to Management Viewers
    FOR uid IN SELECT id FROM profiles WHERE role = 'management_viewer' LOOP
        INSERT INTO user_page_permissions (user_id, page_id)
        VALUES (uid, 'records')
        ON CONFLICT (user_id, page_id) DO NOTHING;
    END LOOP;
END $$;

-- 5. Remove Exchange Price column from Parts table (Stock Price in USD only)
ALTER TABLE parts DROP COLUMN IF EXISTS exchange_price;
