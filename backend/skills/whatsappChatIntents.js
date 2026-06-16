/**
 * Nexus chat — distinguish outbound WhatsApp requests from approval-receipt questions.
 */

/** Boss wants Nexus to SEND a WhatsApp message (ping / test / text me). */
export function isWhatsAppOutboundRequest(text) {
  const raw = (text || '').trim();
  if (!raw) return false;
  const t = raw.toLowerCase();

  if (isWhatsAppApprovalReceiptQuery(raw)) return false;

  if (/(?:ping|text|message|send|notify|say)\s+(?:me\s+)?(?:on\s+)?whatsapp/i.test(t)) return true;
  if (/whatsapp/i.test(t) && /(?:test|working|right now|ping|send|text|message|notify)/i.test(t)) return true;
  if (/(?:send|text|ping)\s+me\b/i.test(t) && /(?:hello|test|check|working)/i.test(t)) return true;

  return false;
}

/** Boss asking whether an approval YES arrived via WhatsApp — not a send request. */
export function isWhatsAppApprovalReceiptQuery(text) {
  const t = (text || '').toLowerCase();
  return /(?:did you|have you).*(?:get|receive).*(?:yes|approval|reply|message)/i.test(t)
    || /don'?t know if you got/i.test(t)
    || /got my (reply|message|response)/i.test(t)
    || (/whatsapp|via wa/i.test(t) && /(?:approval|yes|pending|honor|processed|received|got it|already)/i.test(t))
    || /sent.*yes.*whatsapp/i.test(t);
}

/** Extract body for outbound WhatsApp test messages. */
export function extractOutboundWhatsAppBody(text) {
  const raw = (text || '').trim();
  const quoted = raw.match(/["']([^"']+)["']/);
  if (quoted?.[1]) return quoted[1].slice(0, 160);

  const helloMatch = raw.match(/\bhello\b/i);
  if (helloMatch) return 'Hello';

  if (/test/i.test(raw)) return 'Hello from Nexus — WhatsApp test OK.';

  return 'Hello from Nexus — WhatsApp test OK.';
}
