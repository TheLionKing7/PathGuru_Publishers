#!/usr/bin/env node
/**
 * Smoke test: Nexus chat intent routing must not steal WhatsApp send requests.
 */
import {
  isWhatsAppOutboundRequest,
  extractOutboundWhatsAppBody,
  isWhatsAppApprovalReceiptQuery,
} from '../backend/skills/whatsappChatIntents.js';
import { isWhatsAppApprovalQuery, isApprovalStatusQuery } from '../backend/skills/approvalActions.js';

const cases = [
  {
    msg: 'Can you ping me on whatsapp?',
    outbound: true,
    approvalReceipt: false,
    approvalQuery: false,
  },
  {
    msg: 'I need you to text me "Hello" on whatsapp right now to test if its working',
    outbound: true,
    approvalReceipt: false,
    approvalQuery: false,
    body: 'Hello',
  },
  {
    msg: "I don't know if you got my YES on WhatsApp",
    outbound: false,
    approvalReceipt: true,
    approvalQuery: true,
  },
  {
    msg: 'approval status',
    outbound: false,
    approvalReceipt: false,
    approvalQuery: false,
    statusQuery: true,
  },
  {
    msg: 'What did Orion find on African SMEs?',
    outbound: false,
    approvalReceipt: false,
    approvalQuery: false,
  },
];

let failed = 0;
for (const c of cases) {
  const out = isWhatsAppOutboundRequest(c.msg);
  const receipt = isWhatsAppApprovalReceiptQuery(c.msg);
  const approvalQ = isWhatsAppApprovalQuery(c.msg);
  const statusQ = isApprovalStatusQuery(c.msg);

  const ok =
    out === c.outbound &&
    receipt === c.approvalReceipt &&
    approvalQ === c.approvalQuery &&
    (c.statusQuery === undefined || statusQ === c.statusQuery);

  if (!ok) {
    failed += 1;
    console.error('FAIL:', c.msg);
    console.error('  got', { out, receipt, approvalQ, statusQ });
    console.error('  want', c);
  } else {
    console.log('OK:', c.msg.slice(0, 60));
  }

  if (c.body) {
    const extracted = extractOutboundWhatsAppBody(c.msg);
    if (extracted !== c.body) {
      failed += 1;
      console.error('FAIL extract:', extracted, 'expected', c.body);
    }
  }
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll Nexus WhatsApp intent checks passed.');
