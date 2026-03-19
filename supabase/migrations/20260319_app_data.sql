-- Migration: Create app_data table for generic key-value cloud persistence
-- Run this in the Supabase Dashboard SQL Editor before deploying save-app-data

CREATE TABLE IF NOT EXISTS public.app_data (
  key         TEXT PRIMARY KEY,
  value_json  JSONB NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_data ENABLE ROW LEVEL SECURITY;

-- Allow anon key to read (needed by syncAppDataFromCloud via Supabase client)
CREATE POLICY "anon_select" ON public.app_data
  FOR SELECT TO anon USING (true);

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_data;
