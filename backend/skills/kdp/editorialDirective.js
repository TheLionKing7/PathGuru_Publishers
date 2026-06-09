/**
 * Shared editorial directive — style, tone, depth for generate + refine modes.
 */

import { resolvePageBudget, budgetSummaryLine } from './pageBudget.js';

export function buildEditorialDirective(input = {}, project = {}) {
  const budget = project.pageBudget || resolvePageBudget(input, project);
  const lines = [
    `AUDIENCE: ${project.audience || input.audience || 'general readers'}`,
    `READER OUTCOME: ${project.outcome || input.outcome || 'actionable clarity'}`,
    `WRITING MODE: ${project.writingMode || input.writingMode || 'nonfiction guide'}`,
    `TONE: ${project.tone || input.tone || 'expert, clear, persuasive'}`,
    `VOICE PERSONALITY: ${input.writingPersonality || project.writingPersonality || 'trusted mentor'}`,
    `DESIGN STYLE: ${input.style || project.designSystem?.theme || 'modern authority'}`,
    `DEPTH / LENGTH: ${budgetSummaryLine(budget)}`,
  ];

  const refine = String(input.refineInstructions || '').trim();
  const topic = String(input.topic || '').trim();
  if (refine) lines.push(`AUTHOR REFINEMENT INSTRUCTIONS: ${refine}`);
  if (topic && input.jobMode === 'refine') {
    lines.push(`EDITORIAL BRIEF (from author): ${topic}`);
  }

  return lines.join('\n');
}
