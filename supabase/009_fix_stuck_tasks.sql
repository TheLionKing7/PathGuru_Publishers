-- Migration 009 — Fix stuck task escalation spam
-- Run in Supabase SQL editor

-- 1. Add stuck_alerted_at column so Nexus only alerts once per task
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stuck_alerted_at TIMESTAMPTZ;

-- 2. Cancel all existing ad-hoc synthesizer tasks that are clearly stale
--    (these are the 3 tasks spamming your notifications)
UPDATE tasks
SET status = 'cancelled', updated_at = now(), stuck_alerted_at = now()
WHERE agent_id = 'synthesizer'
  AND title ILIKE '%ad-hoc%'
  AND status IN ('pending', 'in_progress');

-- 3. Mark any other tasks older than 7 days as already-alerted
--    so you only get fresh notifications going forward
UPDATE tasks
SET stuck_alerted_at = now()
WHERE status IN ('pending', 'in_progress')
  AND created_at < now() - INTERVAL '7 days'
  AND stuck_alerted_at IS NULL;
