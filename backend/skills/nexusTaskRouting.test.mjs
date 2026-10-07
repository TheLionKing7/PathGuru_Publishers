/** Run: node backend/skills/nexusTaskRouting.test.mjs */
import { classifyDirectAgentTask } from './nexusTaskRouting.js';

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

console.log('— direct delegation routing —');
const blog = classifyDirectAgentTask('I want you to delegate a blog post to Aether about AI adoption in African SMEs.');
t('routes direct blog delegation to Aether commission flow', blog?.agentId === 'aether' && blog?.action === 'blog_commission' && blog.type === 'content');
t('preserves full instruction as brief', blog?.instruction.includes('AI adoption in African SMEs'));
t('routes plain Aether content writing', classifyDirectAgentTask('Aether, write an article about automation ROI.')?.action === 'blog_commission');
const reuse = classifyDirectAgentTask('Let Aether draft a blog post from the completed Orion thesis about openmarket Africa.');
t('routes an Aether draft instruction despite completed-research status language', reuse?.agentId === 'aether' && reuse.action === 'blog_commission');
t('marks the specific completed research as reusable', reuse?.reuseResearch === true);
t('routes source-ID Aether handoff', classifyDirectAgentTask('Have Aether write a post from Orion report 527944e1-1234-4234-9234-123456789abc.')?.reuseResearch === true);
t('routes Atlas business development work', classifyDirectAgentTask('Please have Atlas prepare a prospect analysis for Acme.')?.agentId === 'atlas');
t('routes Nova automation design', classifyDirectAgentTask('Ask Nova to design an automation workflow for our intake process.')?.agentId === 'nova');
t('routes Synthesizer knowledge work', classifyDirectAgentTask('Please have Synthesizer save this framework to the knowledge base.')?.agentId === 'synthesizer');
t('routes Pulse monitoring work', classifyDirectAgentTask('Have Pulse monitor the analytics dashboard.')?.agentId === 'pulse');
t('leaves Orion to dedicated research route', classifyDirectAgentTask('I want Orion to research current automation adoption data.') === null);
t('does not claim a research handoff as a generic agent task', classifyDirectAgentTask('I want you to get Orion to conduct research on AI adoption.') === null);
t('respects an explicit agent even if instruction mentions research', classifyDirectAgentTask('Have Aether draft a blog post using research on competitor pricing.')?.agentId === 'aether');
t('does not turn Aether status into a task', classifyDirectAgentTask('What is Aether’s blog status?') === null);
t('does not turn an Aether progress question into a task', classifyDirectAgentTask('Is Aether’s draft from the completed Orion research ready?') === null);
t('does not turn agent mention into a task', classifyDirectAgentTask('Aether has been doing excellent work.') === null);
t('does not turn ordinary chat into a task', classifyDirectAgentTask('Good morning Nexus.') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);