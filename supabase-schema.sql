-- ============================================================
-- ExpenseScan - Supabase Database Setup
-- Run this in Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id          BIGSERIAL PRIMARY KEY,
  vendor      TEXT        NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  date        DATE        NOT NULL,
  notes       TEXT        DEFAULT '',
  category    TEXT        NOT NULL CHECK (category IN ('meal','travel','cab','petrol','other')),
  image_b64   TEXT        DEFAULT NULL,  -- base64 receipt image
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast date-sorted queries
CREATE INDEX IF NOT EXISTS expenses_created_at_idx ON expenses (created_at DESC);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- Option A: Public access (no login required) - simplest
-- ============================================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON expenses
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Option B: Per-user access (requires Supabase Auth)
-- Comment out Option A above and uncomment below if you add
-- user login to the app in a future version.
-- ============================================================
-- CREATE POLICY "Users see own expenses" ON expenses
--   FOR ALL USING (auth.uid()::text = user_id)
--   WITH CHECK (auth.uid()::text = user_id);
