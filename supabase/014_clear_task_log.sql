-- Migration 014 — Clear task log and reassign research assignment
-- Run in Supabase SQL Editor

-- 1. Cancel ALL pending and in_progress tasks (full clean slate)
UPDATE tasks
SET
  status     = 'cancelled',
  updated_at = now(),
  error      = 'Cleared by admin — task log reset'
WHERE status IN ('pending', 'in_progress');

-- 2. Flush any remaining pending notifications
UPDATE notifications
SET status = 'sent', dispatched_at = now()
WHERE status = 'pending';

-- 3. Create a fresh, clean research task for Orion (NOCOPO)
INSERT INTO tasks (
  title, description, agent_id, created_by, status, priority, type, input
) VALUES (
  'Research: Nigeria Open Contracting Portal (NOCOPO) — data structure, coverage, and gaps',
  'Conduct a comprehensive research brief on NOCOPO: how it works, what data it publishes (OCDS standard), which MDAs are compliant, what gaps exist, and how contractors can use it effectively. Merge findings with internal knowledge base.',
  'researcher',
  'team',
  'pending',
  4,
  'research',
  '{"instruction": "Research NOCOPO Nigeria procurement portal", "forAgent": "nexus", "depth": "standard"}'
);

-- 4. Confirm
SELECT id, title, agent_id, status, created_at
FROM tasks
ORDER BY created_at DESC
LIMIT 10;
