/**
 * DigiFusion Intelligence Network — WhatsApp inbound processing
 * =============================================================
 * Shared by the webhook handler (which adds Twilio signature verification and a
 * TwiML reply) and by the webhook-queue drain (which replays an already-verified
 * message). Owner gate → approval gate → Nexus chat. Nexus never sends directly;
 * replies flow back through Twilio.
 */

import { nexus } from '../agents/nexus.js';

/**
 * @param {object} fields
 * @param {string} fields.from        — sender number (without whatsapp:)
 * @param {string} fields.body        — message text
 * @param {string} [fields.profileName]
 * @param {string} [fields.waId]
 * @param {string} [fields.messageSid]
 * @returns {{ reply: string, blocked?: boolean, empty?: boolean, handled?: boolean }}
 */
export async function handleWhatsAppMessage({ from, body: msgBody, profileName = '', waId = '', messageSid = '' }) {
  // Security: only accept messages from the owner's number
  const ownerRaw   = (process.env.OWNER_PHONE || process.env.WHATSAPP_TO || '').trim().replace('whatsapp:', '');
  const ownerPhone = ownerRaw.replace(/\s/g, '');
  const fromNorm   = from.replace(/\s/g, '');
  const allowed    = !ownerPhone
    || fromNorm === ownerPhone
    || fromNorm === ownerPhone.replace(/^\+/, '')
    || `+${fromNorm.replace(/^\+/, '')}` === `+${ownerPhone.replace(/^\+/, '')}`;

  if (!allowed) {
    console.warn(`[WhatsApp] Blocked message from unknown number: ${from}`);
    return { reply: 'Unauthorised.', blocked: true };
  }

  if (!msgBody) return { reply: 'I did not receive any text. Please try again.', empty: true };

  console.log(`[WhatsApp→Nexus] From: ${from} | WaId: ${waId} | Profile: ${profileName} | SID: ${messageSid} | Message: ${msgBody.slice(0, 80)}`);

  // Approval gate first — a pending YES/NO resolves the approval rather than chatting.
  try {
    const { processBossApprovalMessage } = await import('./approvalActions.js');
    const result = await processBossApprovalMessage(msgBody);

    if (result.handled) {
      console.log(`[WhatsApp] Approval resolved: ${result.approval?.decision} (${result.approval?.approvalId?.slice(0, 8)})`);
      return { reply: result.reply, handled: true };
    }
  } catch (gateErr) {
    console.warn('[WhatsApp] Approval gate check failed (continuing to Nexus chat):', gateErr.message);
  }

  // No pending approval — route to Nexus chat as normal (per-number in-memory history).
  if (!global._waHistory) global._waHistory = {};
  const history = global._waHistory[from] || [];

  const result = await nexus.chat(msgBody, history);
  const reply  = typeof result === 'string' ? result : result?.response || result?.message || JSON.stringify(result);

  history.push({ role: 'user',      content: msgBody });
  history.push({ role: 'assistant', content: reply   });
  global._waHistory[from] = history.slice(-20);

  return { reply };
}
