-- ============================================================================
-- MDC SYSTEM 2: DC Intake Batch Records Migration
-- Creates the dc_intake_records table to store saved intake batches of scanned
-- parts received at the Distribution Center (e.g. MDC202600015).
-- ============================================================================

CREATE TABLE IF NOT EXISTS dc_intake_records (
    id TEXT PRIMARY KEY,                       -- e.g. "MDC202600015"
    record_name TEXT NOT NULL,                -- e.g. "MDC202600015"
    intake_date DATE NOT NULL DEFAULT CURRENT_DATE,
    po_id UUID,
    po_number TEXT,
    supplier TEXT,
    total_units INT NOT NULL DEFAULT 0,
    saved_by_name TEXT NOT NULL,
    saved_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    category_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    items JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of serialized units {part_number, description, serial_number, received_at, received_by}
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_dc_intake_records_created_at ON dc_intake_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_intake_records_date ON dc_intake_records(intake_date DESC);
CREATE INDEX IF NOT EXISTS idx_dc_intake_records_name ON dc_intake_records(record_name);

-- Row Level Security (RLS)
ALTER TABLE dc_intake_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow public read of dc_intake_records" ON dc_intake_records
        FOR SELECT TO public USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public insert of dc_intake_records" ON dc_intake_records
        FOR INSERT TO public WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public update of dc_intake_records" ON dc_intake_records
        FOR UPDATE TO public USING (true) WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Allow public delete of dc_intake_records" ON dc_intake_records
        FOR DELETE TO public USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
