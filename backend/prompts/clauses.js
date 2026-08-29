/**
 * Quality clauses — the third part of the composition.
 *
 * These are appended by STAKES, not by habit. A throwaway draft needs none;
 * anything a client will read gets grounding and refusal. They are the smallest
 * part of the library and the most load-bearing, because each one is a defence
 * against a specific failure mode that has actually cost something.
 *
 * Order matters: they are appended in the order listed here, so a prompt that
 * requests several always assembles identically. Same input, same text, every
 * time — otherwise you cannot compare two runs.
 */

export const CLAUSES = [
  {
    id: 'grounding',
    name: 'Grounding',
    guards: 'Invention. The model filling a gap rather than reporting one.',
    body: `GROUNDING: Use only the material I have provided. Do not add facts, figures, names, dates or examples from general knowledge. Where you use something from the material, indicate which part. If the material is insufficient to complete a section, leave it blank and list what is missing rather than filling it in.`,
  },
  {
    id: 'refusal',
    name: 'Refusal',
    guards: 'A confident wrong answer, which costs more than no answer because you will not know to check it.',
    body: `REFUSAL: If you cannot answer well with what you have, say so plainly and stop. Name what you would need. Do not produce a lower-quality answer to avoid saying no — a confident wrong answer costs me more than no answer, because I will not know to check it.`,
  },
  {
    id: 'arithmetic',
    name: 'Show the arithmetic',
    guards: 'A number nobody can reproduce, which will not survive a finance review.',
    body: `ARITHMETIC: Show every calculation as a line of working, not as a result. Where you multiply, show both operands. Where you estimate, mark the line ESTIMATE and say what it is based on. I must be able to reproduce every number without asking you.`,
  },
  {
    id: 'assumptions',
    name: 'Assumptions ledger',
    guards: 'The load-bearing assumption nobody stated and therefore nobody tested.',
    body: `ASSUMPTIONS: End with a numbered list of every assumption you made, including the ones that felt too obvious to state. Beside each, note what changes in your answer if that assumption is wrong. Rank them by how much the answer depends on them.`,
  },
  {
    id: 'ask-first',
    name: 'Ask first',
    guards: 'Editing the model’s first guess instead of getting what you actually wanted.',
    body: `ASK FIRST: Before producing anything, ask me the questions whose answers would most change the output. Ask at most five. Then wait — do not produce a draft alongside the questions.`,
  },
  {
    id: 'confidence',
    name: 'Confidence labels',
    guards: 'Established fact, inference and guess blended into one confident voice.',
    body: `CONFIDENCE: Mark every substantive claim as one of: ESTABLISHED (directly supported by the material), INFERRED (a reasonable deduction, and say from what), or SPECULATIVE (a guess). Do not blend the three into a single confident voice.`,
  },
  {
    id: 'no-flattery',
    name: 'No flattery',
    guards: 'Agreeableness dressed as judgement.',
    body: `NO FLATTERY: Do not open by praising the question or telling me the idea is strong. Do not soften a negative finding to be agreeable. If the honest answer is that this will not work, lead with that. I am paying for judgement, not encouragement.`,
  },
  {
    id: 'scope',
    name: 'Scope boundary',
    guards: 'Claiming capability outside what the firm actually does.',
    body: `SCOPE: We do {{WHAT WE DO}}. We explicitly do NOT do {{WHAT WE DO NOT DO}}. If any part of what is being asked falls outside that, say so in one clear sentence without apologising and without offering to try. Declining a scope is a credibility move, not a lost opportunity.`,
  },
  {
    id: 'personal-data',
    name: 'Personal data',
    guards: 'Personal details travelling further than the task requires.',
    body: `PERSONAL DATA: The material may contain names, contact details or other personal information. Do not reproduce personal details in the output unless they are necessary for the task. Do not infer characteristics about identifiable individuals. If a task cannot be completed without processing personal data unnecessarily, say so.`,
  },
];

export const CLAUSE_BY_ID = Object.fromEntries(CLAUSES.map((c) => [c.id, c]));

/** Sensible defaults by stakes, so nobody has to remember the list. */
export const CLAUSE_PRESETS = {
  none:     [],
  draft:    ['no-flattery'],
  client:   ['grounding', 'refusal', 'scope', 'no-flattery'],
  numbers:  ['grounding', 'arithmetic', 'assumptions', 'confidence'],
  sensitive:['grounding', 'refusal', 'personal-data', 'confidence'],
};
