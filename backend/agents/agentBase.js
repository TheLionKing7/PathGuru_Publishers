/**
 * DigiFusion Intelligence Network - Agent Base Class
 * ====================================================
 * Every agent extends this class. It provides:
 *
 *   - Identity          - name, role, personality
 *   - Memory (4 layers) - working, episodic, semantic (via Synthesizer), procedural
 *   - Task lifecycle    - createTask, startTask, completeTask, failTask
 *   - LLM execution     - runLLM() routes to the configured provider
 *   - Knowledge access  - queryKnowledge() asks Synthesizer for relevant context
 *   - Notifications     - notify() routes alerts through Pulse - team
 *
 * Design convention (matches screenshot template):
 *   Every agent has a model, a tools array, a system prompt (personality),
 *   and receives tasks as structured messages with injected context.
 */

import { getSupabase }    from '../supabaseClient.js';
import { callAiProvider, resolveProvider } from '../aiPipeline.js';
import { notion }        from '../notionClient.js';
import { getFrameworksForAgent } from '../skills/firmKnowledge.js';

// Default model follows AI_PROVIDER (e.g. deepseek) when set
const DEFAULT_MODEL = process.env.SYNTHESIZER_MODEL
  || process.env.DEEPSEEK_MODEL
  || 'deepseek-chat';

export class AgentBase {
  /**
   * @param {object} config
   * @param {string} config.id            - agent ID matching agents table ('atlas', 'nova', etc.)
   * @param {string} config.displayName   - e.g. 'Atlas'
   * @param {string} config.role          - short role label
   * @param {string} config.systemPrompt  - full personality + capability prompt
   * @param {string[]} [config.domains]   - knowledge domains this agent draws from
   * @param {string} [config.model]       - LLM model override
   */
  constructor(config) {
    this.id           = config.id;
    this.displayName  = config.displayName;
    this.role         = config.role;
    const fwBlock     = getFrameworksForAgent(config.id)
      .map(f => `— ${f.name}: ${f.oneLiner}`)
      .join('\n');
    this.systemPrompt = fwBlock
      ? `${config.systemPrompt}\n\nYOUR OPERATING FRAMEWORKS (DigiFusion firm IP):\n${fwBlock}`
      : config.systemPrompt;
    this.domains      = config.domains || [];
    this.model        = config.model || resolveProvider()?.model || DEFAULT_MODEL;
    this.provider     = resolveProvider();
  }

  // ---
  // TASK LIFECYCLE
  // ---

  /**
   * Create a new task in Supabase and return its ID.
   */
  async createTask({ title, description, type = 'general', priority = 3, input = {}, parentTaskId = null, createdBy = null }) {
    const db = getSupabase();
    if (!db) return null;

    const { data, error } = await db.from('tasks').insert({
      title,
      description,
      agent_id:       this.id,
      created_by:     createdBy || this.id,
      parent_task_id: parentTaskId,
      status:         'pending',
      priority,
      type,
      input,
    }).select().single();

    if (error) { console.error(`[${this.displayName}] createTask error:`, error.message); return null; }
    return data.id;
  }

  /**
   * Mark a task as in_progress and update the agent status to 'busy'.
   */
  async startTask(taskId) {
    const db = getSupabase();
    if (!db) return;

    await Promise.all([
      db.from('tasks').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', taskId),
      db.from('agents').update({ status: 'busy', current_task_id: taskId, last_active_at: new Date().toISOString() }).eq('id', this.id),
    ]);
  }

  /**
   * Mark a task as completed, store the output, and return the agent to idle.
   */
  async completeTask(taskId, output = {}) {
    const db = getSupabase();
    if (!db) return;

    await Promise.all([
      db.from('tasks').update({
        status:       'completed',
        output,
        completed_at: new Date().toISOString(),
      }).eq('id', taskId),
      db.from('agents').update({
        status:          'idle',
        current_task_id: null,
        last_active_at:  new Date().toISOString(),
      }).eq('id', this.id),
    ]);
  }

  /**
   * Mark a task as failed and return the agent to idle.
   */
  async failTask(taskId, errorMessage) {
    const db = getSupabase();
    if (!db) return;

    await Promise.all([
      db.from('tasks').update({
        status:       'failed',
        error:        errorMessage,
        completed_at: new Date().toISOString(),
      }).eq('id', taskId),
      db.from('agents').update({
        status:          'idle',
        current_task_id: null,
        last_active_at:  new Date().toISOString(),
      }).eq('id', this.id),
    ]);
  }

  // ---
  // MEMORY
  // ---

  /**
   * Write an episodic memory entry after completing work.
   * @param {object} entry
   * @param {string} entry.summary     - 1-3 sentence summary
   * @param {object} [entry.content]   - full structured content
   * @param {string} [entry.type]      - 'task_result' | 'observation' | 'decision'
   * @param {string[]} [entry.tags]
   * @param {number} [entry.importance] - 1-5
   * @param {string} [entry.taskId]
   */
  async rememberEpisodic({ summary, content = {}, type = 'task_result', tags = [], importance = 3, taskId = null }) {
    const db = getSupabase();
    if (!db) return;

    const { error } = await db.from('agent_memory').insert({
      agent_id:   this.id,
      task_id:    taskId,
      type,
      summary,
      content,
      tags,
      importance,
    });

    if (error) console.error(`[${this.displayName}] rememberEpisodic error:`, error.message);
  }

  /**
   * Recall recent episodic memories - called at start of each task to give
   * the agent continuity.
   * @param {number} limit  - how many recent memories to load (default 10)
   * @param {string[]} [tags] - filter by tags
   * @returns {string}  - formatted string to inject into the LLM context
   */
  async recallEpisodic(limit = 10, tags = []) {
    const db = getSupabase();
    if (!db) return '';

    let query = db.from('agent_memory')
      .select('summary, type, tags, importance, created_at')
      .eq('agent_id', this.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tags.length > 0) query = query.overlaps('tags', tags);

    const { data, error } = await query;
    if (error || !data?.length) return '';

    const lines = data.map(m =>
      `[${new Date(m.created_at).toLocaleDateString()}] (${m.type}) ${m.summary}`
    );
    return `## My recent activity\n${lines.join('\n')}`;
  }

  /**
   * Query the Synthesizer's knowledge base for context relevant to this agent's task.
   * Returns a formatted string ready to inject into the LLM prompt.
   * @param {string} query         - what to look for
   * @param {number} limit         - max knowledge units to return
   * @returns {string}
   */
  async queryKnowledge(query, limit = 6) {
    const db = getSupabase();
    if (!db) return '';

    // Domain filter - only fetch knowledge relevant to this agent's domains
    let q = db.from('knowledge_base')
      .select('title, domain, content, frameworks, concepts, statistics, source_name')
      .order('relevance_score', { ascending: false })
      .limit(limit);

    if (this.domains.length > 0) q = q.in('domain', [...this.domains, 'general']);

    const { data, error } = await q;
    if (error || !data?.length) return '';

    // Use the LLM to select the most relevant entries for this specific query
    if (data.length <= 3) {
      return this._formatKnowledgeEntries(data);
    }

    try {
      const selectionPrompt = `You are selecting the most relevant knowledge entries for this task.

TASK QUERY: "${query}"

AVAILABLE KNOWLEDGE:
${data.map((e, i) => `[${i}] ${e.title} (${e.domain}): ${e.content.slice(0, 200)}...`).join('\n')}

Return a JSON array of up to 4 index numbers that are most relevant to the task query. Example: [0, 2, 5]
Return ONLY the JSON array, no other text.`;

      const raw = await callAiProvider(this.provider, selectionPrompt);
      const selected = JSON.parse(raw.match(/\[[\d,\s]+\]/)?.[0] || '[]');
      const relevant = selected.map(i => data[i]).filter(Boolean);
      return this._formatKnowledgeEntries(relevant.length > 0 ? relevant : data.slice(0, 3));
    } catch {
      return this._formatKnowledgeEntries(data.slice(0, 3));
    }
  }

  _formatKnowledgeEntries(entries) {
    if (!entries?.length) return '';
    const lines = entries.map(e => {
      const parts = [`### ${e.title} [${e.domain}]`, e.content];
      if (e.frameworks?.length) parts.push(`Frameworks: ${e.frameworks.join(', ')}`);
      if (e.statistics?.length) parts.push(`Key stats: ${JSON.stringify(e.statistics).slice(0, 300)}`);
      return parts.join('\n');
    });
    return `## Relevant knowledge from our intelligence base\n\n${lines.join('\n\n---\n\n')}`;
  }

  // ---
  // LLM EXECUTION
  // ---

  /**
   * Run the agent's LLM with a task prompt.
   * Automatically injects:
   *   1. The agent's system prompt (personality + capabilities)
   *   2. Episodic memory (recent activity)
   *   3. Semantic knowledge (from Synthesizer)
   *
   * @param {string} taskPrompt     - the actual task instruction
   * @param {object} [options]
   * @param {string} [options.knowledgeQuery]  - what to search in knowledge base
   * @param {string[]} [options.memoryTags]    - filter episodic recall by tags
   * @param {boolean} [options.skipMemory]     - skip episodic recall (for simple tasks)
   * @param {boolean} [options.skipKnowledge]  - skip knowledge base query
   * @returns {string} - raw LLM response
   */
  async runLLM(taskPrompt, options = {}) {
    const {
      knowledgeQuery = taskPrompt.slice(0, 200),
      memoryTags     = [],
      skipMemory     = false,
      skipKnowledge  = false,
    } = options;

    // Build context layers in parallel
    const [episodicContext, knowledgeContext] = await Promise.all([
      skipMemory    ? Promise.resolve('') : this.recallEpisodic(8, memoryTags),
      skipKnowledge ? Promise.resolve('') : this.queryKnowledge(knowledgeQuery),
    ]);

    // Assemble the full prompt following the screenshot template convention:
    // system prompt - context injections - task instruction
    const contextBlocks = [
      episodicContext,
      knowledgeContext,
    ].filter(Boolean).join('\n\n');

    const fullPrompt = contextBlocks
      ? `${contextBlocks}\n\n---\n\n## Current task\n${taskPrompt}`
      : taskPrompt;

    return callAiProvider(this.provider, fullPrompt, this.systemPrompt);
  }

  // ---
  // NOTIFICATIONS
  // ---

  /**
   * Write a notification to the notifications table.
   * Pulse picks these up and dispatches them to the configured channels.
   * @param {string} title
   * @param {string} body
   * @param {'info'|'warning'|'critical'} severity
   * @param {'push'|'whatsapp'|'dashboard'|'all'} channel
   * @param {string} [relatedId]
   */
  async notify(title, body, severity = 'info', channel = 'dashboard', relatedId = null) {
    const db = getSupabase();
    if (!db) return;

    await db.from('notifications').insert({
      title,
      body,
      channel,
      severity,
      source:     this.id,
      related_id: relatedId,
      status:     'pending',
    });
  }

  // ---
  // NOTION INTEGRATION
  // ---

  /**
   * Log a completed task to Notion's task audit database.
   * Non-blocking - errors are swallowed so a Notion outage never kills a task.
   */
  async notionLogTask(taskTitle, taskType, outcome, notes = '') {
    notion.logTask({
      agentId:   this.id,
      agentName: this.displayName,
      taskTitle,
      taskType,
      outcome,
      notes,
    }).catch(() => { /* non-critical */ });
  }

  /**
   * Sync any structured data object to Notion.
   * type: 'lead' | 'evaluation' | 'client_project'
   */
  async syncToNotion(type, data) {
    try {
      switch (type) {
        case 'lead':             return await notion.createLead(data);
        case 'evaluation':       return await notion.createEvaluation(data);
        case 'client_project':   return await notion.createClientProject(data);
        default:
          console.warn(`[${this.displayName}] syncToNotion: unknown type "${type}"`);
          return null;
      }
    } catch (e) {
      console.error(`[${this.displayName}] syncToNotion error:`, e.message);
      return null;
    }
  }

  // ---
  // DELEGATION
  // ---

  /**
   * Delegate a sub-task to another agent via Nexus (writes to tasks table).
   * The target agent picks it up on its next poll or API call.
   */
  async delegate({ toAgent, title, description, type = 'general', priority = 3, input = {}, parentTaskId = null }) {
    const db = getSupabase();
    if (!db) return null;

    const { data, error } = await db.from('tasks').insert({
      title,
      description,
      agent_id:       toAgent,
      created_by:     this.id,
      parent_task_id: parentTaskId,
      status:         'pending',
      priority,
      type,
      input,
    }).select().single();

    if (error) { console.error(`[${this.displayName}] delegate error:`, error.message); return null; }

    console.log(`[${this.displayName}] - Delegated task "${title}" to ${toAgent} (${data.id})`);
    return data.id;
  }

  // ---
  // CHAT - direct team conversation with this agent
  // ---

  /**
   * Handle a natural-language message from the internal team.
   * Maintains conversation history via Supabase agent_memory.
   * @param {string} message           - the team member's message
   * @param {object[]} [history]       - prior turns [{ role, content }]
   * @returns {string}                 - agent's reply
   */
  async chat(message, history = []) {
    // Fetch live task state for this agent so responses are grounded in real data
    const db = getSupabase();
    let liveState = '';
    if (db) {
      const { data: myTasks } = await db.from('tasks')
        .select('title, status, created_at')
        .eq('agent_id', this.id)
        .order('created_at', { ascending: false })
        .limit(5).catch(() => ({ data: [] }));
      if (myTasks?.length) {
        liveState = 'LIVE SYSTEM STATE (your recent tasks):\n' +
          myTasks.map(t => '- ' + (t.title || '').slice(0, 60) + ' [' + t.status + ']').join('\n');
      }
    }

    const episodic = await this.recallEpisodic(5).catch(() => '');
    const historyBlock = history.length
      ? history.slice(-8).map(t => `${t.role === 'user' ? 'Team' : this.displayName}: ${t.content}`).join('\n')
      : '';

    const fullPrompt = [
      liveState,
      episodic,
      historyBlock ? `## Recent conversation\n${historyBlock}` : '',
      `Team: ${message}`,
    ].filter(Boolean).join('\n\n');

    // Honesty guardrail applied to ALL agents
    const guardrailedSystem = this.systemPrompt +
      ' YOU CAN ONLY CONFIRM FACTS VISIBLE IN THE LIVE SYSTEM STATE BLOCK ABOVE.' +
      ' If something is NOT in that block, say "I do not have visibility into that right now."' +
      ' Never say you have confirmed, logged, updated, or completed something unless the data above proves it.' +
      ' Be short. Be honest. Wrong but confident is worse than uncertain and honest.';

    const reply = await callAiProvider(
      this.provider,
      fullPrompt,
      guardrailedSystem,
      { json: false }
    );

    // Log the exchange as episodic memory (low importance - conversational)
    this.rememberEpisodic({
      summary:    `Team chat: "${message.slice(0, 80)}"`,
      content:    { message, reply: reply.slice(0, 500), history_length: history.length },
      type:       'observation',
      tags:       ['chat', 'team_interaction'],
      importance: 2,
    }).catch(() => {});

    return reply;
  }

  // ---
  // MAIN ENTRY POINT
  // ---

  /**
   * Override this in each agent subclass.
   * Called by the API when a task is dispatched to this agent.
   * @param {object} task - task row from Supabase (or ad-hoc instruction object)
   * @returns {object}    - result object stored in tasks.output
   */
  async execute(task) {
    throw new Error(`[${this.displayName}] execute() not implemented`);
  }

  /**
  /**
   * Run the full task lifecycle: create task, start, execute, complete/fail.
   * Used by server.js dispatch when an agent task arrives.
   * @param {object} taskInput - task row from Supabase
   */
  async run(taskInput) {
    let taskId = null;
    try {
      taskId = taskInput.id || await this.createTask({
        title:       taskInput.title || taskInput.action || 'Ad-hoc task',
        description: taskInput.description || JSON.stringify(taskInput).slice(0, 500),
        type:        taskInput.type || 'general',
        priority:    taskInput.priority || 3,
        input:       taskInput,
      });
      if (taskId && typeof this.startTask === 'function') await this.startTask(taskId);
      const result = await this.execute(taskInput);
      if (taskId && typeof this.completeTask === 'function') await this.completeTask(taskId, result || {});
      return { success: true, taskId, result };
    } catch (e) {
      console.error('[' + this.displayName + '] run() error:', e.message);
      if (taskId && typeof this.failTask === 'function') await this.failTask(taskId, e.message);
      return { success: false, taskId, error: e.message };
    }
  }
}
