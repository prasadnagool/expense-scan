-- ================================================================
-- ExpenseScan v5 - Multi-user Supabase schema
-- Run this in Supabase Dashboard > SQL Editor
--
-- TWO OPTIONS below:
-- A) Fresh install  - use the CREATE TABLE block
-- B) Upgrade from v2/v3 (single table, no logins) - use ALTER block
-- ================================================================

-- ── OPTION A: Fresh install ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vendor      TEXT          NOT NULL,
  amount      NUMERIC(12,2) NOT NULL,
  date        DATE          NOT NULL,
  notes       TEXT          DEFAULT '',
  category    TEXT          NOT NULL CHECK (category IN ('meal','travel','cab','petrol','other')),
  image_b64   TEXT          DEFAULT NULL,
  created_at  TIMESTAMPTZ   DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expenses_user_id_idx   ON expenses (user_id);
CREATE INDEX IF NOT EXISTS expenses_created_at_idx ON expenses (created_at DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_own" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "select_own" ON expenses FOR SELECT USING  (auth.uid() = user_id);
CREATE POLICY "update_own" ON expenses FOR UPDATE USING  (auth.uid() = user_id);
CREATE POLICY "delete_own" ON expenses FOR DELETE USING  (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── OPTION B: Upgrade existing table (run instead of Option A) ───
-- Step 1: Add user_id column
-- ALTER TABLE expenses ADD COLUMN IF NOT EXISTS
--   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
--
-- Step 2: Add index
-- CREATE INDEX IF NOT EXISTS expenses_user_id_idx ON expenses (user_id);
--
-- Step 3: Remove old open policy
-- DROP POLICY IF EXISTS "Allow all operations" ON expenses;
--
-- Step 4: Add per-user policies
-- CREATE POLICY "insert_own" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "select_own" ON expenses FOR SELECT USING  (auth.uid() = user_id);
-- CREATE POLICY "update_own" ON expenses FOR UPDATE USING  (auth.uid() = user_id);
-- CREATE POLICY "delete_own" ON expenses FOR DELETE USING  (auth.uid() = user_id);
-- ================================================================
