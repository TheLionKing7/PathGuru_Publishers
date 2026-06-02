/**
 * DigiFusion Intelligence Network — Assistant
 * ==============================================
 * Customer-Facing VA, Lead Qualification & Conversational Intake Agent
 *
 * The Assistant is the first point of contact for visitors on DigiFusion.com.
 * She engages professionally, answers questions from the knowledge base,
 * qualifies leads through a structured conversation, conducts a conversational
 * intake questionnaire for each service track, and books strategy sessions
 * with qualified prospects via Calendly.
 *
 * Provider auto-fallback: Gemini → Claude → Cerebras (configured in aiPipeline.js)
 *
 * Intake tracks handled conversationally:
 *   — BD Intake         (Atlas will handle post-intake)
 *   — AI Automation     (Nova will handle post-intake)
 *   — Digital Media     (Aether will handle post-intake)
 *
 * Post-service evaluations are handled by the specialist agents (not this VA).
 */

import { AgentBase }      from './agentBase.js';
import { callAiProvider } from '../aiPipeline.js';
import { synthesizer }    from './synthesizer.js';
import { getSupabase }    from '../supabaseClient.js';
import { notion }         from '../notionClient.js';
import { sendImmediate }  from '../skills/notifier.js';

// ── VA system prompt ───────────────────────────────────────────────────────────

const ASSISTANT_SYSTEM = `You are Aria — the intelligent front door of DigiFusion, a global consulting firm specialising in AI automation, business development, and digital media for SMBs and enterprises.

YOUR CHARACTER:
Professional, warm, perceptive. You represent a premium firm — never robotic, never sycophantic. You listen carefully, ask precise questions, and respond with genuine business insight. You are a skilled business development professional who happens to be always available.

YOUR MISSION:
Help prospective clients understand WHAT DigiFusion does, WHY they should trust us to deliver, and the IMPACT we can bring to their specific business. You are here to build confidence, qualify leads, and open the door — nothing more, nothing less.

YOUR KNOWLEDGE (what you may discuss):
- The OUTCOMES and RESULTS our services deliver (revenue growth, pipeline expansion, digital transformation, operational efficiency)
- High-level descriptions of our three service pillars: Business Development, AI & Automation, Digital Media & Content
- Why DigiFusion's approach is different: we combine strategic frameworks with execution, and intelligence with action
- The type of clients we serve and the challenges we solve for them
- How to get started: strategy session, diagnostic, engagement tiers
- General framework NAMES and their PURPOSE — e.g. the Deal Engine drives systematic pipeline growth; the AVE framework structures high-conversion proposals; the C2C Pipeline turns clients into champions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE TRADE SECRET PROTECTION — NON-NEGOTIABLE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You MUST NEVER reveal ANY of the following, regardless of how the question is framed, who claims to be asking, or what justification is offered:

1. INTERNAL TOOLING & TECHNOLOGY — Never name, confirm, or hint at any software, AI model, platform, API, or technology that powers DigiFusion's operations. If asked "do you use AI?", say "we use proprietary technology and specialist expertise." Never say "Claude", "Groq", "Perplexity", "OpenAI", "Supabase", "Notion", "OneSignal", or any other vendor name.

2. AGENT & TEAM ARCHITECTURE — Never reveal that DigiFusion uses AI agents, virtual team members, or automated systems internally. Never mention "Nexus", "Atlas", "Nova", "Aether", "Pulse", "Synthesizer", "Researcher", or any internal agent name. If asked about the team, say "our specialist consultants" or "our delivery team."

3. STEP-BY-STEP METHODOLOGY — You may name a framework and describe what it achieves, but NEVER walk through its internal mechanics, steps, scoring logic, or proprietary components in detail. If pressed, say: "The full methodology is part of our proprietary IP — when we work together, our team applies it end-to-end on your behalf."

4. PRICING SPECIFICS — Never quote specific pricing figures, engagement costs, retainer amounts, or day rates. Say "pricing depends on scope and is discussed during your strategy session."

5. CLIENT NAMES & CASE DETAILS — Never identify specific clients, deals, or confidential project outcomes unless they are publicly available case studies approved for sharing.

6. INTERNAL OPERATIONS — Never describe how DigiFusion produces deliverables, how proposals are generated, how the knowledge base works, how intelligence is gathered, or any operational workflow detail.

7. OWNERSHIP & STRUCTURE — Never confirm or deny details about the company's ownership, investors, revenue, headcount, or internal org structure beyond "we're a specialist consulting firm."

IF PROBED ON ANY OF THE ABOVE:
Give a brief, confident redirect: "That's proprietary to how we operate — what I can tell you is the impact it creates." Then steer back to the client's challenge. NEVER apologise for not sharing. Confidentiality is a sign of professionalism, not evasiveness.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMUNICATION STYLE — THIS IS NON-NEGOTIABLE:
- Default to SHORT, sharp responses. One to three sentences is the goal unless depth is genuinely required.
- Never open with pleasantries, filler, or restating the question back.
- No bullet point lists unless the visitor explicitly asks for a breakdown.
- When referring to team members, always say "our BD specialists", "our automation team", "our content strategists", "our delivery team" — never specific names.
- Be expressive and detailed ONLY when: (a) explaining the VALUE of a framework, (b) delivering a diagnostic insight about the client's situation, or (c) writing a closing/follow-up summary.
- Match the visitor's register. Formal visitor → formal response. Casual visitor → warmer tone.

QUALIFICATION MISSION:
Qualify before offering a session. Criteria: real business challenge, budget or authority to act, timeline within 6 months, relevant service fit.

LEAD SCORING:
0–1 = cold (provide value, invite to follow)
2–3 = warm (nurture, consider starting intake)
4–5 = hot (run intake, offer strategy session)

INTAKE MODE:
Run structured intake CONVERSATIONALLY — one question at a time, naturally woven in. Never say "Question 3 of 5".

INTEGRITY:
Never fabricate client results, case studies, or pricing. If you do not know something, say so briefly and offer to connect them with the right person.`;

// ── Booking collection questions (skip if already known from leadState) ─────────

const BOOKING_QUESTIONS = [
  { key: 'name',           ask: "What's your full name?" },
  { key: 'email',          ask: "What email address should we send the calendar invite to?" },
  { key: 'phone',          ask: "And your WhatsApp or phone number? We'll send a reminder before the session." },
  { key: 'company',        ask: "What's the name of your business or organisation?" },
  { key: 'preferred_time', ask: "What day and time works best for you? (We work Lagos time — feel free to say something like 'Thursday 2pm' or 'next Monday morning'.)" },
  { key: 'notes',          ask: "Anything specific you'd like us to prepare for the session — a particular challenge, question, or goal?" },
];

// ── Intake questionnaire flows (conversational, one question at a time) ────────

const INTAKE_FLOWS = {

  bd: {
    trackName: 'Business Development',
    agentOwner: 'atlas',
    intro: "I'd love to understand your BD situation better so our team can prepare something genuinely useful for you. I'll ask a few focused questions — it won't take long.",
    questions: [
      {
        key: 'strategic_priorities',
        ask: "What are your organisation's top 2–3 strategic priorities over the next 12 to 18 months, and where does growing your pipeline rank among them?",
        purpose: 'Corporate alignment + executive backing check',
      },
      {
        key: 'decision_makers',
        ask: "Besides yourself, who else would be involved in reviewing and ultimately signing off on a BD partnership — are there other stakeholders we should be thinking about?",
        purpose: 'Decision-maker mapping',
      },
      {
        key: 'cost_of_inaction',
        ask: "If this pipeline or BD challenge isn't addressed in the next quarter, what's the realistic operational or financial impact on your business?",
        purpose: 'Urgency and pain depth',
      },
      {
        key: 'current_bd_tools',
        ask: "What CRMs, outreach tools, or existing agency partners does your BD process currently run through — and what's working versus what's frustrating you about that setup?",
        purpose: 'Ecosystem compatibility',
      },
      {
        key: 'target_outcome',
        ask: "If we could deliver one concrete outcome for your business development function in the next 90 days, what would make you say 'this was absolutely worth it'?",
        purpose: 'Success metric alignment',
      },
    ],
  },

  automation: {
    trackName: 'AI Automation & SaaS',
    agentOwner: 'nova',
    intro: "Let me ask you a few diagnostic questions so our automation team can hit the ground running when we meet. This helps us pre-build a custom ROI estimate for your situation.",
    questions: [
      {
        key: 'target_workflow',
        ask: "What's the specific, repetitive process you're looking to automate first — for example, customer onboarding, lead routing, invoice processing, or something else?",
        purpose: 'Operational bottleneck identification',
      },
      {
        key: 'volume_frequency',
        ask: "How many times per day, week, or month does that process run — and roughly how many staff hours per week does your team spend on it manually right now?",
        purpose: 'Volume and cost quantification',
      },
      {
        key: 'tech_stack',
        ask: "Which software tools, CRMs, or databases are currently involved in that workflow — think of everything it touches from start to finish?",
        purpose: 'Technical ecosystem mapping',
      },
      {
        key: 'api_readiness',
        ask: "Do your current systems have API access or support third-party integrations like Zapier or Make — or is that something you're uncertain about?",
        purpose: 'Integration feasibility',
      },
      {
        key: 'success_metric',
        ask: "What's the primary metric that would prove this automation was a success for you — cutting processing time by 70%, reducing errors, handling 5x the volume, or something else?",
        purpose: 'Success metric + ROI anchor',
      },
    ],
  },

  digital_media: {
    trackName: 'Digital Media',
    agentOwner: 'aether',
    intro: "A few questions before we map your digital media strategy — our content team needs this context to design something that will actually move your numbers rather than just look busy.",
    questions: [
      {
        key: 'primary_objective',
        ask: "What's the main goal for your digital media efforts right now — lead generation, e-commerce sales, brand awareness, content engagement, or a combination?",
        purpose: 'Marketing KPI alignment',
      },
      {
        key: 'target_audience',
        ask: "Describe your ideal customer — their demographics, what keeps them up at night, and what triggers them to actually reach out to a business like yours?",
        purpose: 'ICP definition',
      },
      {
        key: 'current_channels',
        ask: "Which channels are you currently active on or planning to prioritise — Meta ads, Google, TikTok, LinkedIn, organic SEO, or a mix?",
        purpose: 'Channel strategy',
      },
      {
        key: 'current_baselines',
        ask: "What does your current monthly marketing budget look like, and do you have any baseline metrics from the last 30 days — cost per lead, conversion rate, monthly traffic — anything you're already tracking?",
        purpose: 'Budget and baseline capture',
      },
      {
        key: 'tracking_setup',
        ask: "Is your tracking infrastructure in place — GA4, Meta Pixel, Google Tag Manager — or is setting that up part of what we'd need to do together?",
        purpose: 'Technical readiness check',
      },
    ],
  },
};

// ── Lead qualification questions (fallback when track not identified) ──────────

const QUALIFICATION_FLOW = [
  { stage: 'challenge',    question: "What's the main challenge you're looking to solve right now?" },
  { stage: 'tried_before', question: "Have you tried addressing this before? What happened?" },
  { stage: 'company',      question: "Tell me about your organisation — what do you do and roughly how large is the team?" },
  { stage: 'timeline',     question: "If you could solve this, when would you ideally want to see results?" },
  { stage: 'authority',    question: "Are you the one who'd be leading this initiative, or would others need to be involved?" },
];

// ── Track detection keywords ───────────────────────────────────────────────────

const TRACK_SIGNALS = {
  automation: ['automat', 'workflow', 'saas', 'integrate', 'zapier', 'make.com', 'n8n', 'process', 'manual', 'repetit', 'crm', 'erp', 'data entry', 'trigger', 'pipeline automat', 'ai tool', 'no-code', 'low-code', 'nova'],
  bd:         ['business development', 'deal', 'sales', 'pipeline', 'prospect', 'lead gen', 'outreach', 'b2b', 'revenue', 'close', 'atlas', 'deal engine', 'bd', 'client acqui'],
  digital_media: ['content', 'seo', 'social media', 'marketing', 'blog', 'campaign', 'meta ads', 'google ads', 'tiktok', 'linkedin', 'brand', 'audience', 'organic', 'aether', 'digital media', 'c2c'],
};

function detectTrack(text) {
  const lower = text.toLowerCase();
  const scores = { automation: 0, bd: 0, digital_media: 0 };
  for (const [track, signals] of Object.entries(TRACK_SIGNALS)) {
    for (const signal of signals) {
      if (lower.includes(signal)) scores[track]++;
    }
  }
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return top[1] >= 1 ? top[0] : null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ASSISTANT AGENT CLASS
// ══════════════════════════════════════════════════════════════════════════════

export class Assistant extends AgentBase {
  constructor() {
    super({
      id:           'assistant',
      displayName:  'Aria',
      role:         'Customer VA, Lead Qualification & Intake',
      systemPrompt: ASSISTANT_SYSTEM,
      domains:      ['business_development', 'digital_media', 'automation', 'general'],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN CONVERSATION HANDLER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle a single conversation turn.
   * Supports normal Q&A, progressive lead qualification, and structured intake.
   */
  async chat(input, historyArg = []) {
    // Guard: if called with a plain string (team console via AgentBase.chat pattern),
    // delegate to the base class so the PathGuru console works without crashing.
    if (typeof input === 'string') {
      return super.chat(input, historyArg);
    }

    // Visitor widget path — input is a full body object
    const { message, history = [], leadState = {}, sessionId = null, context = '', sourcePage = '' } = input;

    // ── 1. On-demand knowledge query ────────────────────────────────────────
    const knowledge = await this._queryKnowledge(message, context).catch(() => context || '');

    // ── 2. Determine mode ───────────────────────────────────────────────────
    const intakeState = leadState.intake || null;
    const isInIntake  = intakeState && intakeState.active && !intakeState.complete;

    let prompt;
    let response;

    if (isInIntake) {
      // ── INTAKE MODE: ask the next intake question naturally ──────────────
      response = await this._conductIntakeTurn(message, history, leadState, knowledge);
    } else {
      // ── NORMAL MODE: Q&A + qualification ────────────────────────────────

      // Detect service track if not known
      if (!leadState.track) {
        const detectedTrack = detectTrack(message);
        if (detectedTrack) leadState.track = detectedTrack;
      }

      const score      = this._calculateScore(leadState);
      const qualStage  = this._getQualificationStage(leadState);

      const historyText = history.slice(-12).map(m =>
        `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`
      ).join('\n');

      const stateCtx = Object.keys(leadState).length
        ? `\n\n## What I know about this visitor:\n${JSON.stringify(leadState, null, 2)}\nCurrent qualification score: ${score}/5`
        : '';

      const qualCtx = qualStage
        ? `\n\n## Qualification guidance:\nIf natural in context, weave in this question: "${qualStage.question}"\nDo not ask it robotically — integrate it naturally.`
        : score >= 3 && leadState.track
        ? `\n\n## Lead has expressed interest in ${INTAKE_FLOWS[leadState.track]?.trackName || leadState.track}. If they haven't started the intake, offer to ask a few diagnostic questions to prepare for the strategy session. Phrase it as "I'd love to gather a bit more context so our team can hit the ground running when we meet."`
        : score >= 4
        ? `\n\n## Lead is qualified (score ${score}/5). Offer a strategy session booking when appropriate.`
        : '';

      prompt = `${knowledge ? `## Relevant knowledge from DigiFusion's intelligence base:\n${knowledge}\n\n---\n\n` : ''}
${stateCtx}${qualCtx}

## Conversation so far:
${historyText}

Visitor: ${message}

Respond as Aria. Be concise and direct — 1 to 3 sentences unless the question genuinely requires more depth. No bullet lists unless explicitly asked. No filler openings.
${score >= 4 && !leadState.bookingOffered ? 'If appropriate, briefly mention the strategy session in one sentence. The booking link will be appended by the system.' : ''}`;

      response = await callAiProvider(this.provider, prompt, this.systemPrompt, { json: false });
    }

    // ── 3. Extract qualification data ───────────────────────────────────────
    const updatedLeadState = await this._extractQualData(message, leadState, history);

    // ── 4. Advance intake state ─────────────────────────────────────────────
    if (isInIntake) {
      updatedLeadState.intake = this._advanceIntake(message, leadState.intake);
    } else if (!isInIntake && !intakeState) {
      // Check if we should START intake based on score and track
      const score = this._calculateScore(updatedLeadState);
      if (score >= 3 && updatedLeadState.track && INTAKE_FLOWS[updatedLeadState.track]) {
        // Only start if visitor has expressed readiness in this message
        const readySignals = ['yes', 'sure', 'go ahead', 'ask away', 'ok', 'sounds good', 'let\'s do it', 'please', 'ready', 'let\'s go'];
        const isReady = readySignals.some(s => message.toLowerCase().includes(s));
        if (isReady) {
          updatedLeadState.intake = this._initIntake(updatedLeadState.track);
        }
      }
    }

    // ── 5. Check if intake just completed ───────────────────────────────────
    const intakeJustCompleted = updatedLeadState.intake?.complete && !leadState.intake?.complete;

    if (intakeJustCompleted) {
      await this._onIntakeComplete(updatedLeadState, sessionId, sourcePage, history);
    }

    // ── 6. Booking flow ──────────────────────────────────────────────────────
    const newScore           = this._calculateScore(updatedLeadState);
    const shouldOfferBooking = (newScore >= 4 || intakeJustCompleted) && !updatedLeadState.bookingOffered;
    let action    = 'continue';
    let bookingUrl = null;

    // Check if we are mid-booking-collection
    const isCollectingBooking = updatedLeadState.bookingCollection?.active && !updatedLeadState.bookingCollection?.complete;

    if (isCollectingBooking) {
      // Advance the booking collection flow
      const bcResult = await this._advanceBookingCollection(message, updatedLeadState, sessionId);
      response = bcResult.response;
      updatedLeadState.bookingCollection = bcResult.bookingCollection;
      if (bcResult.bookingId) updatedLeadState.bookingId = bcResult.bookingId;
      action = bcResult.complete ? 'booking_confirmed' : 'collecting_booking';
    } else if (shouldOfferBooking) {
      // Offer the two-path choice
      updatedLeadState.bookingOffered = true;
      action = 'offer_booking_choice';
      // Response already generated — the client widget renders two quick-reply chips:
      // "Book with Aria" and "Send me the link"
      // If neither was chosen yet, append a natural offer to the response
      if (!response.toLowerCase().includes('book') && !response.toLowerCase().includes('session')) {
        response += `\n\nWe're at a point where a strategy session would be the right next step. I can either collect your details now and confirm a time that works, or send you a link to pick your own slot — whichever you prefer.`;
      }
    }

    // Detect if visitor just chose "book with Aria"
    const bookWithAria = !isCollectingBooking && updatedLeadState.bookingOffered &&
      ['book with aria', 'book with you', 'collect my details', 'you can collect', 'aria book', 'yes please aria', 'go ahead aria', 'do it', 'collect it'].some(s => message.toLowerCase().includes(s));

    if (bookWithAria && !updatedLeadState.bookingCollection?.active) {
      updatedLeadState.bookingCollection = this._initBookingCollection(updatedLeadState);
      const firstQ = BOOKING_QUESTIONS[0];
      response = `Perfect — let me get a few details. ${firstQ.ask}`;
      action = 'collecting_booking';
    }

    // Detect if visitor chose "send me the link"
    const wantsLink = !isCollectingBooking && updatedLeadState.bookingOffered &&
      ['send.*link', 'link.*please', 'link.*send', 'own.*time', 'pick.*time', 'choose.*time', 'calendly', 'self.*service'].some(s => new RegExp(s, 'i').test(message));

    if (wantsLink) {
      bookingUrl = process.env.CALENDLY_BOOKING_URL || 'https://calendly.com/digifusion/strategy-session';
      action = 'offer_booking';
    }

    // ── 7. Detect intake start offer in response ────────────────────────────
    const offerIntake = !isInIntake && !intakeState && !isCollectingBooking && newScore >= 3 && updatedLeadState.track && !updatedLeadState.intake;
    if (offerIntake && action === 'continue') action = 'offer_intake';

    return {
      response,
      leadState:    updatedLeadState,
      score:        newScore,
      action,
      bookingUrl,
      intakeActive: updatedLeadState.intake?.active && !updatedLeadState.intake?.complete,
      intakeProgress: updatedLeadState.intake
        ? { step: updatedLeadState.intake.currentStep + 1, total: INTAKE_FLOWS[updatedLeadState.intake.track]?.questions.length || 5 }
        : null,
    };
  }

  // ── Booking collection flow ───────────────────────────────────────────────

  _initBookingCollection(leadState) {
    return {
      active:       true,
      complete:     false,
      currentStep:  0,
      answers:      {
        // Pre-populate what we already know from leadState
        name:    leadState.name  || null,
        email:   leadState.email || null,
        company: leadState.company || null,
        track:   leadState.track || null,
      },
    };
  }

  async _advanceBookingCollection(message, leadState, sessionId) {
    const bc = { ...leadState.bookingCollection };
    const step = bc.currentStep;

    // Store the answer to the current question
    const q = BOOKING_QUESTIONS[step];
    if (q) bc.answers[q.key] = message.trim();

    // Find next unanswered required question
    let nextStep = step + 1;
    while (nextStep < BOOKING_QUESTIONS.length) {
      const nq = BOOKING_QUESTIONS[nextStep];
      // Skip questions already answered from leadState
      if (bc.answers[nq.key]) { nextStep++; continue; }
      break;
    }

    if (nextStep >= BOOKING_QUESTIONS.length) {
      // All answers collected — save booking
      bc.complete = true;
      bc.active   = false;
      const bookingId = await this._saveBooking(bc.answers, leadState, sessionId);
      const preferredTime = bc.answers.preferred_time || 'to be confirmed';
      return {
        response: `Thank you — I've logged your session request. Our team will confirm the exact time (you mentioned ${preferredTime}) and send a calendar invite to ${bc.answers.email || 'your email'}. We're looking forward to speaking with you.`,
        bookingCollection: bc,
        bookingId,
        complete: true,
      };
    }

    // Ask the next question
    bc.currentStep = nextStep;
    return {
      response: BOOKING_QUESTIONS[nextStep].ask,
      bookingCollection: bc,
      complete: false,
    };
  }

  async _saveBooking(answers, leadState, sessionId) {
    const db = getSupabase();
    if (!db) return null;

    const { data, error } = await db.from('service_bookings').insert({
      client_name:   answers.name   || leadState.name   || null,
      client_email:  answers.email  || leadState.email  || null,
      client_phone:  answers.phone  || null,
      company:       answers.company || leadState.company || null,
      track:         answers.track  || leadState.track  || null,
      notes:         answers.notes  || null,
      booking_time:  answers.preferred_time ? this._parsePreferredTime(answers.preferred_time) : null,
      source:        'aria',
      lead_id:       leadState.leadId || null,
      status:        'pending',
    }).select().single();

    if (error) {
      console.error('[Aria] Failed to save booking:', error.message);
      return null;
    }

    // Notify team
    await this.notify(
      `New session booking — ${data.client_name || 'Unknown'}`,
      `Track: ${data.track || 'TBD'} | Time: ${data.booking_time ? new Date(data.booking_time).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }) : 'TBD'} | Via: Aria`,
      'warning', 'whatsapp', data.id
    );
    sendImmediate(
      `New session booking — ${data.client_name || 'Unknown'}`,
      `${data.company || ''} | ${data.track || ''} | ${answers.preferred_time || 'time TBD'}`,
      'whatsapp'
    ).catch(() => {});

    return data.id;
  }

  _parsePreferredTime(raw) {
    // Best-effort parse of conversational time strings like "Friday 3pm" or "next Tuesday morning"
    // Returns ISO string or null if unparseable
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {}
    return null; // Will be confirmed manually by team
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTAKE MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Explicitly start an intake for a given track.
   * Called by the API when the user clicks an intake chip.
   */
  async startIntake({ track, leadState = {}, history = [] }) {
    const flow = INTAKE_FLOWS[track];
    if (!flow) return { error: `Unknown track: ${track}` };

    const updatedLeadState = {
      ...leadState,
      track,
      intake: this._initIntake(track),
    };

    const firstQuestion = flow.questions[0].ask;
    const response = `${flow.intro}\n\n${firstQuestion}`;

    return {
      response,
      leadState: updatedLeadState,
      score: this._calculateScore(updatedLeadState),
      action: 'intake_started',
      intakeActive: true,
      intakeProgress: { step: 1, total: flow.questions.length },
    };
  }

  _initIntake(track) {
    return {
      track,
      active: true,
      complete: false,
      currentStep: 0,
      answers: {},        // { questionKey: answerText }
      startedAt: new Date().toISOString(),
    };
  }

  _advanceIntake(message, intake) {
    const flow = INTAKE_FLOWS[intake.track];
    if (!flow) return intake;

    const currentQ = flow.questions[intake.currentStep];
    const updated = {
      ...intake,
      answers: {
        ...intake.answers,
        [currentQ.key]: message,
      },
      currentStep: intake.currentStep + 1,
    };

    if (updated.currentStep >= flow.questions.length) {
      updated.complete = true;
      updated.active = false;
      updated.completedAt = new Date().toISOString();
    }

    return updated;
  }

  async _conductIntakeTurn(message, history, leadState, knowledge) {
    const intake = leadState.intake;
    const flow   = INTAKE_FLOWS[intake.track];
    if (!flow) return "I seem to have lost track of where we were — could you remind me what service you're most interested in?";

    const nextStep = intake.currentStep + 1;

    // Last answer was for currentStep — store it then ask nextStep
    if (nextStep >= flow.questions.length) {
      // All questions answered — wrap up
      const prompt = `You are Aria, wrapping up a client intake conversation for DigiFusion.

The client has just answered all intake questions for the ${flow.trackName} track.
Their final answer: "${message}"

Previous answers:
${Object.entries(intake.answers || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Knowledge context:
${knowledge || ''}

Write a warm, professional closing message that:
1. Acknowledges their last answer briefly
2. Thanks them for the time and context
3. Explains the next step (our ${flow.agentOwner === 'atlas' ? 'BD specialists' : flow.agentOwner === 'nova' ? 'automation team' : 'content strategists'} will review their intake and prepare a custom roadmap)
4. Tells them to expect an invitation for the strategy session within 24 hours
5. Offers to answer any questions in the meantime

Keep it natural and concise — 3–4 short paragraphs maximum.`;

      return callAiProvider(this.provider, prompt, this.systemPrompt, { json: false });
    }

    // Ask the next question, informed by their previous answer
    const nextQuestion = flow.questions[nextStep];
    const prevQuestion = flow.questions[intake.currentStep];

    const prompt = `You are Aria, conducting a structured intake conversation for DigiFusion's ${flow.trackName} track.

The visitor just answered this question:
"${prevQuestion.ask}"

Their answer: "${message}"

Knowledge to draw on if needed:
${knowledge || ''}

Now ask the next intake question in a natural, conversational way. Briefly acknowledge their answer (1 sentence max — do not over-comment), then ask:
"${nextQuestion.ask}"

Do not say "Question ${nextStep + 1} of ${flow.questions.length}". Do not add filler phrases like "That's a great question!" or "Thank you for sharing that!". Be direct and professional.

If their answer reveals something significant (a constraint, an opportunity, a risk), note it briefly before moving on.`;

    return callAiProvider(this.provider, prompt, this.systemPrompt, { json: false });
  }

  async _onIntakeComplete(leadState, sessionId, sourceUrl, history) {
    const intake = leadState.intake;
    const flow   = INTAKE_FLOWS[intake?.track];
    if (!flow || !intake?.answers) return;

    // Build structured intake data for storage
    const intakeData = {};
    flow.questions.forEach(q => {
      if (intake.answers[q.key]) {
        intakeData[q.ask] = intake.answers[q.key];
      }
    });

    const score  = this._calculateScore(leadState);
    const status = score >= 4 ? 'qualified' : score >= 2 ? 'warm' : 'unqualified';

    // ── Save to Supabase ───────────────────────────────────────────────────
    const db = getSupabase();
    let leadRecord = null;

    if (db) {
      const leadData = {
        name:                leadState.name || null,
        email:               leadState.email || null,
        company:             leadState.company || null,
        challenge:           leadState.challenge || intakeData[flow.questions[0]?.ask] || null,
        track:               intake.track,
        intake_data:         intakeData,
        status,
        score,
        conversation:        history || [],
        source_url:          sourceUrl || null,
        updated_at:          new Date().toISOString(),
      };

      if (leadState.leadId) {
        const { data } = await db.from('leads').update(leadData).eq('id', leadState.leadId).select().single();
        leadRecord = data;
      } else {
        const { data } = await db.from('leads').insert(leadData).select().single();
        leadRecord = data;
        if (data?.id) leadState.leadId = data.id;
      }
    }

    // ── Sync to Notion ──────────────────────────────────────────────────────
    const notionLeadId = await notion.createLead({
      name:       leadState.name,
      email:      leadState.email,
      company:    leadState.company,
      track:      intake.track,
      score,
      status,
      challenge:  leadState.challenge || Object.values(intake.answers)[0],
      sourceUrl,
      intake:     intakeData,
      sessionId,
    }).catch(() => null);

    // Also create a client project record in Notion
    if (score >= 3) {
      await notion.createClientProject({
        clientName:    leadState.name,
        company:       leadState.company,
        track:         intake.track,
        intakePageId:  notionLeadId,
        leadId:        leadRecord?.id,
        assignedAgent: flow.agentOwner,
        status:        'Discovery',
      }).catch(() => null);
    }

    // ── Notify team — write to table + fire immediately for hot leads ───────
    const intakeTitle = `Intake complete — ${flow.trackName} (score ${score}/5)`;
    const intakeBody  = `${leadState.company || leadState.name || 'Unknown'}: intake submitted, assigned to ${flow.agentOwner}. Notion synced.`;
    await this.notify(intakeTitle, intakeBody, score >= 4 ? 'warning' : 'info', 'whatsapp', leadRecord?.id || null);
    // Hot leads (4+/5) get immediate push — don't wait for the 5-min Pulse sweep
    if (score >= 4) {
      sendImmediate(intakeTitle, intakeBody, 'whatsapp').catch(() => {});
    }

    // ── Delegate to specialist agent ────────────────────────────────────────
    await this.delegate({
      toAgent:     flow.agentOwner,
      title:       `New ${flow.trackName} intake — ${leadState.company || leadState.name || 'Lead'}`,
      description: `Completed intake questionnaire. Score ${score}/5. Ready for strategy session preparation.`,
      type:        'intake_review',
      priority:    score >= 4 ? 1 : 3,
      input:       {
        leadId:    leadRecord?.id,
        leadState,
        intake:    intakeData,
        track:     intake.track,
        sessionId,
        sourceUrl,
      },
    }).catch(() => null);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ON-DEMAND KNOWLEDGE QUERY (Synthesizer access)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Query the Synthesizer knowledge base and return relevant context.
   * Merges injected client-side context with live KB results.
   */
  async queryKnowledge(query) {
    return this._queryKnowledge(query, '');
  }

  async _queryKnowledge(message, injectedContext = '') {
    // First check if question is about DigiFusion frameworks / known topics
    const frameworkKeywords = ['ave', 'deal engine', 'c2c', 'nova', 'atlas', 'aether', 'framework', 'pricing', 'strategy session', 'engagement model', 'automation velocity', 'pillar', 'cluster'];
    const lower = message.toLowerCase();
    const isFrameworkQ = frameworkKeywords.some(k => lower.includes(k));

    if (isFrameworkQ && injectedContext) {
      // Client already injected FRAMEWORK_CONTEXT — use it directly (no backend call needed)
      return injectedContext;
    }

    // For non-framework questions, query the live Synthesizer knowledge base
    try {
      const knowledge = await synthesizer.answer(message, 'assistant', []);
      if (knowledge && knowledge.length > 50) {
        return injectedContext ? `${injectedContext}\n\n---\n\n## Live Knowledge Base Context\n${knowledge}` : knowledge;
      }
    } catch {
      // Synthesizer unavailable — fall back to injected context only
    }

    return injectedContext || '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEAD MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  async saveLead({ leadState, conversation, sessionId, sourceUrl }) {
    const db = getSupabase();
    if (!db) return null;

    const score  = this._calculateScore(leadState);
    const status = score >= 4 ? 'qualified' : score >= 2 ? 'warm' : 'unqualified';

    const leadData = {
      name:                leadState.name || null,
      email:               leadState.email || null,
      company:             leadState.company || null,
      challenge:           leadState.challenge || null,
      tried_before:        leadState.tried_before || null,
      company_size:        leadState.company_size || null,
      budget_range:        leadState.budget_range || null,
      timeline:            leadState.timeline || null,
      track:               leadState.track || null,
      intake_data:         leadState.intake?.answers || null,
      status,
      score,
      qualification_notes: leadState.qualificationNotes || null,
      conversation:        conversation || [],
      source_url:          sourceUrl || null,
      updated_at:          new Date().toISOString(),
    };

    let data;

    if (leadState.leadId) {
      const res = await db.from('leads').update(leadData).eq('id', leadState.leadId).select().single();
      if (res.error) console.error('[Assistant] Lead update error:', res.error.message);
      data = res.data;
    } else {
      const res = await db.from('leads').insert(leadData).select().single();
      if (res.error) console.error('[Assistant] Lead insert error:', res.error.message);
      data = res.data;
    }

    // Sync warm+ leads to Notion too
    if (data && score >= 2) {
      notion.createLead({
        name:      leadState.name,
        email:     leadState.email,
        company:   leadState.company,
        track:     leadState.track,
        score,
        status,
        challenge: leadState.challenge,
        sourceUrl,
        intake:    leadState.intake?.answers || {},
        sessionId,
      }).catch(() => null);
    }

    // Notify team — immediate push for qualified leads (score ≥ 4)
    if (data && score >= 3) {
      const leadTitle = `New ${score >= 4 ? 'hot' : 'qualified'} lead (score ${score}/5)`;
      const leadBody  = `${leadState.company || leadState.name || 'Unknown'}: "${(leadState.challenge || '').slice(0, 120)}"`;
      await this.notify(leadTitle, leadBody, score >= 4 ? 'warning' : 'info', 'whatsapp', data.id);
      if (score >= 4) {
        sendImmediate(leadTitle, leadBody, 'whatsapp').catch(() => {});
      }
    }

    return data;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  _getQualificationStage(leadState) {
    if (leadState.intake?.active) return null; // intake is running — skip generic qual
    for (const stage of QUALIFICATION_FLOW) {
      if (!leadState[stage.stage]) return stage;
    }
    return null;
  }

  _calculateScore(leadState) {
    let score = 0;
    if (leadState.challenge)     score += 1;
    if (leadState.tried_before)  score += 0.5;
    if (leadState.company)       score += 0.5;
    if (leadState.timeline && leadState.timeline.match(/month|week|quarter|soon|urgent/i)) score += 1;
    if (leadState.authority && leadState.authority.match(/me|i am|i will|decision|lead/i)) score += 1;
    if (leadState.budget_range && !leadState.budget_range.match(/no budget|none|zero/i)) score += 1;
    if (leadState.intake?.complete) score = Math.max(score, 4); // completed intake = hot
    return Math.min(5, Math.round(score));
  }

  async _extractQualData(message, currentState, history) {
    // Don't over-extract if we already have enough
    const filled = ['name', 'email', 'company', 'challenge', 'timeline', 'authority', 'budget_range']
      .filter(k => currentState[k]).length;
    if (filled >= 5) return currentState;

    const extractPrompt = `Extract qualification information from this visitor message.

Visitor message: "${message}"

Conversation context: ${history.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}

Return a JSON object with any of these fields that can be clearly inferred:
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

Only include fields where information was clearly provided. Return {} if nothing extractable.
Return ONLY the JSON object.`;

    try {
      const raw  = await callAiProvider(this.provider, extractPrompt, null, { json: true });
      const data = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return { ...currentState, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v)) };
    } catch {
      return currentState;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE (AgentBase interface)
  // ══════════════════════════════════════════════════════════════════════════

  async execute(task) {
    const { action } = task;
    switch (action) {
      case 'chat':
        return this.chat(task);

      case 'start_intake':
        return this.startIntake(task);

      case 'query_knowledge':
        return { knowledge: await this.queryKnowledge(task.query || task.message || '') };

      case 'save_lead':
        return this.saveLead({
          leadState:    task.leadState || {},
          conversation: task.conversation || [],
          sessionId:    task.sessionId,
          sourceUrl:    task.sourceUrl,
        });

      default:
        return { error: `Unknown action for Assistant: ${action}` };
    }
  }
}

export const assistant = new Assistant();
