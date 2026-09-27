/**
 * Run: node backend/skills/nexusResearchOps.test.mjs
 * Pure intent-routing checks; no framework, no external services.
 */
import { isResearchActionRequest, isResearchStatusQuery } from './nexusResearchOps.js';

let pass = 0;
let fail = 0;
const t = (name, condition) => {
  if (condition) {
    pass++;
    console.log('  PASS', name);
  } else {
    fail++;
    console.log('  FAIL', name);
  }
};

const actualSlackInstruction = 'I want you to research a thesis around openmarket Africa. This time, ensure the recent issue concerning Chinese cheap products and uproar by the ibos in nigeria are symptoms of a system ripe for intelligence commerce cordination. Let the research agent look for key information to make a strong case for a strong marketing cordination to empower intra-africa trade. let me know once the research result is back.';

t('routes the reported Slack instruction as an action', isResearchActionRequest(actualSlackInstruction));
t('does not misclassify the reported action as a status-only query', !isResearchStatusQuery(actualSlackInstruction));
t('routes direct research command', isResearchActionRequest('Nexus, please research open-market trade in Africa.'));
t('routes explicit researcher delegation', isResearchActionRequest('Have the research agent investigate intra-African trade barriers.'));
t('does not route a pure status question as a new action', !isResearchActionRequest('Where is Orion’s research report?'));
t('does not route a question about completed research as a new action', !isResearchActionRequest('Is the research result back?'));
t('still recognizes a standalone deliverable status question', isResearchStatusQuery('Is the research result back?'));
t('does not route ordinary chat', !isResearchActionRequest('Good morning Nexus.'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);