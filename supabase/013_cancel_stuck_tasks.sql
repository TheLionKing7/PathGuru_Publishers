-- Migration 013 — Cancel stuck tasks and silence notification backlog
-- Run in Supabase SQL Editor

-- 1. Add missing columns if they don't exist yet
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dispatch_log  JSONB;

-- 2. Cancel every task stuck in pending/in_progress for more than 30 minutes
UPDATE tasks
SET
  status           = 'cancelled',
  updated_at       = now(),
  stuck_alerted_at = now(),
  error            = 'Auto-cancelled: stuck in ' || status || ' for more than 30 minutes.'
WHERE status IN ('pending', 'in_progress')
  AND created_at < now() - INTERVAL '30 minutes';

-- 3. Flush every queued notification — mark as sent so Pulse stops dispatching them
UPDATE notifications
SET status = 'sent', dispatched_at = now()
WHERE status = 'pending';

-- 4. Confirm
SELECT status, count(*) FROM tasks GROUP BY status ORDER BY status;
SELECT status, count(*) FROM notifications GROUP BY status ORDER BY status;
