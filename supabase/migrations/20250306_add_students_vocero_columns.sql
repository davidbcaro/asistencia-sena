-- Add vocero columns to students table for saving spokesperson data
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS is_vocero boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vocero_suplente boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS username text;

COMMENT ON COLUMN students.is_vocero IS 'Vocero del grupo';
COMMENT ON COLUMN students.is_vocero_suplente IS 'Vocero suplente';
