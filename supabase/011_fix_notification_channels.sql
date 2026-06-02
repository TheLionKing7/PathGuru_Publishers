-- Migration 011 — Reroute all pending 'all' and 'push' channel notifications to 'whatsapp'
-- Chrome push is permanently disabled. This prevents any queued notifications
-- from firing Chrome alerts when the server restarts and Pulse sweeps.

-- 1. Reroute pending 'all' notifications → 'whatsapp'
UPDATE notifications
SET channel = 'whatsapp', updated_at = now()
WHERE status = 'pending'
  AND channel = 'all';

-- 2. Reroute pending 'push' notifications → 'dashboard' (dashboard-only; no external delivery)
UPDATE notifications
SET channel = 'dashboard', updated_at = now()
WHERE status = 'pending'
  AND channel = 'push';

-- 3. Confirm
SELECT channel, status, count(*)
FROM notifications
WHERE status = 'pending'
GROUP BY channel, status
ORDER BY channel;
