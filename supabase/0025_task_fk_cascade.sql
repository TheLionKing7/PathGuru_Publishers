-- ═══════════════════════════════════════════════════════════════════════════
-- 0025_task_fk_cascade.sql
--
-- Recreates the two foreign keys that reference tasks(id) so that deleting a
-- task detaches its memories and sub-tasks instead of erroring.
--
-- The two constraints were created implicitly in 001_agent_network.sql by
-- inline REFERENCES clauses, so Postgres auto-named them:
--
--   · agent_memory_task_id_fkey  —  agent_memory.task_id   → tasks(id)
--   · tasks_parent_task_id_fkey  —  tasks.parent_task_id   → tasks(id)
--
-- Both defaulted to NO ACTION, which means DELETE FROM tasks fails whenever a
-- memory row or a child task still points at the row being removed. That turns
-- routine task cleanup into a hard error, so we recreate them as
-- ON DELETE SET NULL. Both referencing columns are already nullable, so the
-- memories and sub-tasks survive and simply become detached.
--
-- This migration deletes NO rows. It only drops and recreates constraints, and
-- every statement is guarded by IF EXISTS so it is safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── agent_memory.task_id ────────────────────────────────────────────────────
-- A memory row outlives its task: deleting a task detaches the memory rather
-- than refusing the delete or cascading away the agent's recall.
alter table public.agent_memory
  drop constraint if exists agent_memory_task_id_fkey;

alter table public.agent_memory
  add constraint agent_memory_task_id_fkey
  foreign key (task_id) references public.tasks (id)
  on delete set null;

-- ── tasks.parent_task_id (self-referencing sub-task link) ───────────────────
-- Deleting a parent task orphans its sub-tasks instead of blocking the delete
-- or cascading them away. The sub-tasks keep their own ids, titles and output;
-- only the parent pointer is cleared.
alter table public.tasks
  drop constraint if exists tasks_parent_task_id_fkey;

alter table public.tasks
  add constraint tasks_parent_task_id_fkey
  foreign key (parent_task_id) references public.tasks (id)
  on delete set null;
