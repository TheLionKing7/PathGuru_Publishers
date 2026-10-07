/**
 * Run: node backend/skills/nexusResearchOps.test.mjs
 * Pure intent-routing checks; no framework, no external services.
 */
import { isAetherResearchHandoffRequest, isResearchActionRequest, isResearchStatusQuery, selectRelevantResearchDeliverables } from './nexusResearchOps.js';

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
const aetherHandoff = 'Let Aether draft a blog post from the completed Orion research on the Openmarket Africa thesis.';

t('routes the reported Slack instruction as an action', isResearchActionRequest(actualSlackInstruction));
t('does not misclassify the reported action as a status-only query', !isResearchStatusQuery(actualSlackInstruction));
t('routes direct research command', isResearchActionRequest('Nexus, please research open-market trade in Africa.'));
t('routes explicit researcher delegation', isResearchActionRequest('Have the research agent investigate intra-African trade barriers.'));
t('routes plain instruction to get Orion to conduct research', isResearchActionRequest('I want you to get Orion to conduct research on AI adoption in African SMEs.'));
t('does not route a pure status question as a new action', !isResearchActionRequest('Where is Orion’s research report?'));
t('does not route a question about completed research as a new action', !isResearchActionRequest('Is the research result back?'));
t('recognizes Aether drafting from completed Orion research as a distinct handoff', isAetherResearchHandoffRequest(aetherHandoff));
t('does not swallow an Aether research handoff as a status query', !isResearchStatusQuery(aetherHandoff));
t('still recognizes a standalone deliverable status question', isResearchStatusQuery('Is the research result back?'));
t('does not route ordinary chat', !isResearchActionRequest('Good morning Nexus.'));

const reports = [
  { taskId: 'ope-1', title: 'Openmarket Africa thesis', instruction: 'Research Openmarket Africa', brief: 'A'.repeat(40) },
  { taskId: 'unrelated-1', title: 'AI pricing report', instruction: 'Research software pricing', brief: 'B'.repeat(40) },
];
const relevant = selectRelevantResearchDeliverables(reports, 'Where is the completed Openmarket Africa thesis report?');
t('selects the specifically requested report instead of unrelated latest deliverable', relevant.items.length === 1 && relevant.items[0].taskId === 'ope-1');
const absent = selectRelevantResearchDeliverables(reports, 'Where is the completed Openmarket thesis for Nigeria?');
t('does not fall back to an unrelated report when the requested topic is absent', absent.specific && absent.items.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);