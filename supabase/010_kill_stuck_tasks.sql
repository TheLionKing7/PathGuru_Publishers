-- Migration 010 — Permanently silence stuck task notifications
-- Run in Supabase SQL editor
-- This is the definitive fix for the ad-hoc synthesizer notification spam.

-- 1. Add stuck_alerted_at column (safe if already added by migration 009)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stuck_alerted_at TIMESTAMPTZ;

-- 2. Cancel ALL ad-hoc synthesizer tasks that are stale
UPDATE tasks
SET
  status           = 'cancelled',
  updated_at       = now(),
  stuck_alerted_at = now()
WHERE agent_id = 'synthesizer'
  AND title ILIKE '%ad-hoc%'
  AND status IN ('pending', 'in_progress');

-- 3. Mark ALL other stuck tasks (pending/in_progress > 7 days) as already-alerted
--    so Nexus only alerts you on fresh tasks going forward
UPDATE tasks
SET stuck_alerted_at = now()
WHERE status IN ('pending', 'in_progress')
  AND created_at < now() - INTERVAL '7 days'
  AND stuck_alerted_at IS NULL;

-- 4. Confirm what was done
SELECT id, title, agent_id, status, stuck_alerted_at
FROM tasks
WHERE agent_id = 'synthesizer'
  AND title ILIKE '%ad-hoc%'
ORDER BY created_at DESC
LIMIT 10;
