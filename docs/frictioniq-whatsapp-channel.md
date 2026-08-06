# FrictionIQ — the WhatsApp channel

*DigiFusion (Digital Fusion Labs) · internal operating reference · 1 August 2026*

This describes the second delivery channel: why it exists, the three platform rules that shape every line of the implementation, what actually gets sent on it, and what has to be done in the Meta dashboard before any of it works. The companion document is `digitafusion/frictioniq-operations-and-journey.md`, which describes the sequence itself. Policy lives in `lib/frictioniq/journey.ts`; the channel machinery in `lib/frictioniq/whatsapp.ts`, `whatsapp-touch.ts`, `whatsapp-templates.ts` and `whatsapp-inbound.ts`.

---

## 1. Why this exists

Cold email has a low response rate in Nigerian B2B. WhatsApp does not. That single asymmetry is the whole argument, and it is worth stating precisely because it does not license the obvious move — re-pointing the existing sequence at a second channel. Meta's rules make that both expensive and dangerous, and the implementation encodes those rules rather than discovering them in production.

The channel is opt-in, additive, and fails soft. With the four environment variables unset it is simply off: every WhatsApp-intended touch falls back to email, and nothing about the diagnostic changes. That is the intended behaviour. A misconfigured channel must never cost a respondent their result.

---

## 2. The three rules that shape everything

**The 24-hour window.** Free-form messages are permitted only within 24 hours of the recipient's last inbound message. Outside it, a pre-approved template is the only legal send — the API rejects anything else. So `wa_window_expires_at` on the session row is not an optimisation; it decides whether a given send is even possible. Every send checks the window first and picks its shape accordingly, rather than trying and handling the error.

**Category decides cost and risk.** Meta has billed per message since July 2025, across four categories: marketing, utility, authentication, service. Utility templates inside an open window are free. Marketing templates are the most expensive and the most dangerous. A result the respondent asked for thirty seconds ago is utility. A day-30 offer is marketing, and declaring it as utility to save money is how an account gets re-categorised by Meta — an outcome that does not come with a refund.

**Quality rating is the whole game.** Recipients who did not clearly opt in report marketing messages; reports drive the number's quality rating down; a low enough rating means throttling and then removal. There is no appeal worth relying on. So `sendSmart()` refuses to send a marketing template without a recorded opt-in, and that check sits inside the module rather than at the call site — because call sites are where rules get forgotten.

---

## 3. What is actually sent, and what is not

Channel is chosen **per touch by policy, not per prospect**. The reason is that some messages are simply the wrong shape for a chat window.

| Touch | Day | Channel | Category |
|---|---|---|---|
| Result | 0 | email + WhatsApp | utility |
| Blocked domains | 2 | email + WhatsApp | utility |
| Sector blueprint | 7–12 | email only | — |
| Sequencing / orchestration note | 2–3 | email only | — |
| One question | 16 | WhatsApp | marketing |
| Offer | 21–30 | email + WhatsApp | marketing |
| Outcome check | 90 | email + WhatsApp | marketing |
| Re-assess invite | 365 | email only | — |

The blueprint, the sequencing note and the orchestration note have no WhatsApp form at all, and `renderWaTouch()` returns null for them as a second lock on the same door. They are arguments, and an argument compressed to four lines stops being an argument and becomes an assertion.

Every WhatsApp touch exists in two versions — an approved template and a free-form body — and which one goes out is decided by the window at send time. Both must exist because whether the window is open is a fact about the recipient's own behaviour that nobody can know when the sequence is planned. The two versions say the same thing; that is a constraint, not an accident, because otherwise a recipient who replies once and then goes quiet receives two materially different conversations depending on their own timing.

**Day 16 is the message this channel was built for.** On email, "one question — just hit reply" asks somebody to compose. On WhatsApp it costs one tap. The same is true of the day-90 outcome check, which is the most valuable message in the system and the hardest to get answered.

---

## 4. Consent, and the difference between a number and a permission

A phone number is not consent. The capture form asks for the number as an optional field, and the WhatsApp opt-in appears as a separate checkbox that only renders **once a number has been typed** — a consent box beside an empty field is a box people tick without meaning anything by it, and a meaningless tick is exactly the consent that gets a number reported.

Opt-in is stored as its own timestamped column, `wa_opt_in_at`, never inferred from the presence of `phone_e164`. Four conditions must all hold before anything sends: the channel is configured, a number exists, the box was ticked, and the person has not since replied STOP.

**STOP is honoured before anything else** and does not touch the email subscription. "Stop WhatsApping me" is not "stop emailing me", and silently widening it is a different kind of not listening. It cancels the pending marketing sequence on both channels — a person who typed STOP is not asking to keep receiving the marketing half by email — while the two operational touches survive and route to email from there.

---

## 5. Numbers, and why normalisation happens at capture

A Nigerian mobile is written `0803 123 4567` domestically, `+234 803 123 4567` internationally, and `234 803 123 4567` by half of all web forms. The API accepts only the last, unpunctuated. Meta's webhook then reports inbound messages in that same canonical form.

So `normaliseMsisdn()` runs at capture, where the country the person selected is known, and the canonical form is what gets stored. Without that, a number stored as `0803…` and an inbound `234803…` never join, and every reply arrives unattributed. A leading zero with no country selected is **refused rather than guessed** — guessing wrong sends a stranger's phone a message about somebody else's business.

---

## 6. Inbound

The webhook is `POST /api/frictioniq/whatsapp`, and every inbound message does three things: opens the 24-hour window, stands the sequence down (stage moves to *conversation*, pending marketing touches cancel), and honours STOP first if present.

Two implementation details are load-bearing. Meta signs every webhook with `X-Hub-Signature-256`, an HMAC-SHA256 of the **raw** body — so the route reads `req.text()` before any parsing, because `await req.json()` consumes the stream and re-serialising the object produces different bytes. That is the single most common way this integration is built wrong. And with `WHATSAPP_APP_SECRET` unset the route accepts nothing at all: this URL is public and its payload shape is documented by Meta, so an unauthenticated version would let a stranger silence any live sequence.

Matching is a lookup on `phone_e164`, most recent session wins. An unmatched number is still recorded with a null token — it is a real human messaging a business number, and dropping it because our join failed would be the estate deciding a person does not exist.

---

## 7. Measuring whether this was worth it

`frictioniq_touch` carries two columns: `channel` (what was intended, set when the sequence was planned) and `delivered_on` (what actually happened). They differ whenever a WhatsApp touch found no reachable number and fell back to email. Comparing them is the only honest way to tell whether the channel policy is real or aspirational, and the prospect page prints the gap in words — *"email (wanted email + WhatsApp)"*.

Delivery and read receipts land through the same webhook and are written to `wa_status`. The `frictioniq_channel_health` view groups by intended and actual channel.

The test this channel has to pass is stated in the view's own comment: if WhatsApp read rates are not materially above email open rates, the extra cost and the quality-rating risk are not being repaid, and the policy should move back toward email. That is written down now, before there is any data, because it is much harder to write down afterwards.

---

## 8. What has to be done before it works

1. **Apply migration `0015_frictioniq_whatsapp.sql`** (after `0013` and `0014`).
2. **Create a Meta app** at developers.facebook.com, add the WhatsApp product, and collect: the phone number ID (not the phone number), a **System User** access token — the 24-hour test token expires and will strand the channel — and the app secret from App settings → Basic.
3. **Set four variables** in Vercel, Production and Preview: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` (you invent this one), `WHATSAPP_APP_SECRET`.
4. **Configure the webhook**: WhatsApp → Configuration → callback URL `https://<domain>/api/frictioniq/whatsapp`, verify token as above, and subscribe to the `messages` field — that one field carries both inbound messages and delivery receipts.
5. **Create and submit the five templates** in `lib/frictioniq/whatsapp-templates.ts`. Names must match exactly and placeholder order is positional: a template approved with the URL in slot 3 and code sending it in slot 4 produces a message that reads perfectly and says the wrong thing. `SUBMISSION_GUIDE` in that file is the paste-ready text. Nothing sends until they are approved.
6. **Send each template to your own number and read it on a phone**, not a desktop. Four lines on a laptop can be nine on a handset.
7. **Check the business profile display name** is one a stranger will recognise. An unrecognised sender is a reported sender, and reports are the one currency this channel cannot afford to spend.