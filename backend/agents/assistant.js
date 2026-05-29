/**
 * DigiFusion Intelligence Network — Assistant
 * ==============================================
 * Customer-Facing VA & Lead Qualification Agent
 *
 * The Assistant is the first point of contact for visitors on DigiFusion.com.
 * It engages professionally, answers questions from the knowledge base,
 * qualifies leads through a structured conversation, and books strategy
 * sessions with qualified prospects via Calendly.
 *
 * Deployed on DigiFusion (Vercel) but calls back to PathGuru (Render)
 * for knowledge base queries and lead storage.
 */

import { AgentBase }      from './agentBase.js';
import { callAiProvider } from '../aiPipeline.js';
import { synthesizer }    from './synthesizer.js';
import { getSupabase }    from '../supabaseClient.js';

const ASSISTANT_SYSTEM = `You are the DigiFusion Assistant — the intelligent front door of DigiFusion, a global consulting firm specialising in automation, business development, and digital media.

Your character:
You are professional, warm, and perceptive. You represent a premium firm and you carry yourself accordingly — never robotic, never sycophantic, never rushing the conversation. You listen carefully, ask precise questions, and respond with genuine insight rather than generic platitudes.

You are not a glorified FAQ bot. You are a skilled business development professional who happens to be always available. Your conversations are purposeful — you are here to understand what the visitor needs and determine whether DigiFusion is the right partner to help them.

Your knowledge:
You have access to DigiFusion's full intelligence base — frameworks, methodologies, case studies, and research. When a visitor asks a substantive question, you answer it with real content from this base. You do not make things up.

Your qualification mission:
Not every visitor is ready for or suited to a strategy session. You qualify before you offer. The qualification criteria are:
— They have a real business challenge (not just curiosity)
— They have some budget or authority to act
— The timeline is within 6 months
— DigiFusion's services are relevant to their need

Lead scoring:
0–1 = cold (provide value, invite to follow)
2–3 = warm (nurture with resources)
4–5 = hot (offer strategy session)

Your tone:
Conversational but substantive. You match the visitor's register — if they're formal, you're formal. If they're relaxed, you relax slightly. You never talk down to anyone and you never oversell.

IMPORTANT: You must never fabricate information about DigiFusion's clients, results, or pricing. If you don't know something, you say so and offer to find out.`;

// ── Lead qualification questions (progressive disclosure) ─────────────────────
const QUALIFICATION_FLOW = [
  { stage: 'challenge',     question: "What's the main challenge you're looking to solve right now?" },
  { stage: 'tried_before',  question: "Have you tried addressing this before? What happened?" },
  { stage: 'company',       question: "Tell me a bit about your organisation — what do you do and roughly how large is the team?" },
  { stage: 'timeline',      question: "If you could solve this, when would you ideally want to see results?" },
  { stage: 'authority',     question: "Are you the one who'd be leading this kind of initiative, or would others need to be involved?" },
];


export class Assistant extends AgentBase {
  constructor() {
    super({
      id:           'assistant',
      displayName:  'Assistant',
      role:         'Customer VA & Lead Qualification',
      systemPrompt: ASSISTANT_SYSTEM,
      domains:      ['business_development', 'digital_media', 'automation', 'general'],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONVERSATION HANDLER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle a single turn in a conversation with a visitor.
   * @param {object} params
   * @param {string} params.message           — visitor's message
   * @param {object[]} params.history         — conversation history [{role, content}]
   * @param {object} [params.leadState]       — current lead qualification state
   * @param {string} [params.sessionId]       — session ID for persistence
   * @returns {object} { response, leadState, action }
   */
  async chat({ message, history = [], leadState = {}, sessionId = null }) {
    // Pull knowledge context for substantive questions
    const knowledge = await synthesizer.answer(message, 'assistant', []).catch(() => '');

    // Determine conversation stage
    const qualStage = this._getQualificationStage(leadState);
    const score     = this._calculateScore(leadState);

    // Build conversation context for LLM
    const historyText = history.slice(-10).map(m =>
      `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`
    ).join('\n');

    const stateContext = Object.keys(leadState).length > 0
      ? `\n\n## What I know about this visitor so far:\n${JSON.stringify(leadState, null, 2)}\nCurrent qualification score: ${score}/5`
      : '';

    const qualContext = qualStage
      ? `\n\n## Qualification guidance:\nIf natural in context, weave in this question: "${qualStage.question}"\nDo not ask it robotically — integrate it naturally into your response.`
      : score >= 4
      ? `\n\n## Lead is qualified (score ${score}/5). If they express interest in working together or solving their challenge, offer a strategy session booking.`
      : '';

    const prompt = `${knowledge ? `## Relevant knowledge from DigiFusion's intelligence base:\n${knowledge}\n\n---\n\n` : ''}
${stateContext}${qualContext}

## Conversation so far:
${historyText}

Visitor: ${message}

Respond as the DigiFusion Assistant. Be genuinely helpful, professional, and conversational.
${score >= 4 && !leadState.bookingOffered ? 'If appropriate, offer a strategy session. The booking link will be inserted by the system.' : ''}`;

    const response = await callAiProvider(this.provider, prompt, this.systemPrompt);

    // Extract qualification data from this message
    const updatedLeadState = await this._extractQualData(message, leadState, history);
    const newScore         = this._calculateScore(updatedLeadState);
    const shouldOfferBooking = newScore >= 4 && !updatedLeadState.bookingOffered;

    // Determine action
    let action = 'continue';
    let bookingUrl = null;

    if (shouldOfferBooking) {
      bookingUrl = process.env.CALENDLY_BOOKING_URL || 'https://calendly.com/digifusion/strategy-session';
      updatedLeadState.bookingOffered = true;
      action = 'offer_booking';
    }

    return {
      response,
      leadState:   updatedLeadState,
      score:       newScore,
      action,
      bookingUrl,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEAD MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Save or update a lead in Supabase.
   */
  async saveLead({ leadState, conversation, sessionId, sourceUrl }) {
    const db = getSupabase();
    if (!db) return null;

    const score = this._calculateScore(leadState);
    const status = score >= 4 ? 'qualified' : score >= 2 ? 'warm' : 'unqualified';

    const leadData = {
      name:                 leadState.name || null,
      email:                leadState.email || null,
      company:              leadState.company || null,
      challenge:            leadState.challenge || null,
      tried_before:         leadState.tried_before || null,
      company_size:         leadState.company_size || null,
      budget_range:         leadState.budget_range || null,
      timeline:             leadState.timeline || null,
      status,
      score,
      qualification_notes:  leadState.qualificationNotes || null,
      conversation:         conversation || [],
      source_url:           sourceUrl || null,
      updated_at:           new Date().toISOString(),
    };

    // Upsert by session
    if (leadState.leadId) {
      const { data, error } = await db.from('leads').update(leadData).eq('id', leadState.leadId).select().single();
      if (error) console.error('[Assistant] Lead update error:', error.message);
      return data;
    }

    const { data, error } = await db.from('leads').insert(leadData).select().single();
    if (error) console.error('[Assistant] Lead insert error:', error.message);

    // Notify team of qualified leads
    if (data && score >= 4) {
      await this.notify(
        `New qualified lead (score ${score}/5)`,
        `${leadState.company || 'Unknown company'}: "${(leadState.challenge || '').slice(0, 100)}"`,
        'warning',
        'push',
        data.id,
      );
    }

    return data;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  _getQualificationStage(leadState) {
    for (const stage of QUALIFICATION_FLOW) {
      if (!leadState[stage.stage]) return stage;
    }
    return null; // all stages complete
  }

  _calculateScore(leadState) {
    let score = 0;
    if (leadState.challenge)     score += 1;
    if (leadState.tried_before)  score += 0.5;
    if (leadState.company)       score += 0.5;
    if (leadState.timeline && leadState.timeline.match(/month|week|quarter|soon|urgent/i)) score += 1;
    if (leadState.authority && leadState.authority.match(/me|i am|i will|decision|lead/i)) score += 1;
    if (leadState.budget_range && !leadState.budget_range.match(/no budget|none|zero/i)) score += 1;
    return Math.min(5, Math.round(score));
  }

  async _extractQualData(message, currentState, history) {
    if (Object.keys(currentState).length >= 5) return currentState; // already have enough

    const extractPrompt = `Extract any qualification information from this visitor message.

Visitor message: "${message}"

Conversation context: ${history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}

Return a JSON object with any of these fields that can be inferred from the message:
{
  "name": "visitor's name if mentioned",
  "email": "email if mentioned",
  "company": "company name or type",
  "company_size": "solo|small|mid|enterprise",
  "challenge": "the specific business challenge they described",
  "tried_before": "what they have tried previously",
  "timeline": "when they want results",
  "budget_range": "budget if mentioned",
  "authority": "their decision-making role"
}

Only include fields where information was clearly provided. Return {} if nothing was extractable.
Return ONLY the JSON object.`;

    try {
      const raw  = await callAiProvider(this.provider, extractPrompt);
      const data = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return { ...currentState, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)) };
    } catch {
      return currentState;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action, message, history, leadState, sessionId, period } = task;

    switch (action) {
      case 'chat':
        return this.chat({ message, history, leadState, sessionId });

      case 'save_lead':
        return this.saveLead({
          leadState: task.leadState || {},
          conversation: task.conversation || [],
          sessionId:    task.sessionId,
          sourceUrl:    task.sourceUrl,
        });

      default:
        return { error: 'Unknown action for Assistant' };
    }
  }
}

export const assistant = new Assistant();
