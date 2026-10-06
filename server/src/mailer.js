/**
 * Enquiry emails (2026-09-25), through Resend's HTTP API with Node's own
 * fetch — no mail library. Off until RESEND_API_KEY is set in server/.env;
 * without it enquiries are still stored and exported, just not emailed.
 *
 *   RESEND_API_KEY=re_...                  from resend.com (free: 3,000/month)
 *   LEADS_FROM="RCAAS.tech <leads@rcaas.tech>"   a sender on a domain verified
 *                                          in Resend; the default is Resend's
 *                                          test sender, which only reaches
 *                                          the Resend account's own address
 *   LEADS_TO=team@geonova.com.np           always copied, whatever the project
 *
 * Every client sends through this one verified domain: mail to a hotel's guests
 * goes out in the hotel's name ("Basera Boutique Hotel <bookings@rcaas.tech>")
 * with replies to the hotel's own address (venueMail), so a guest who answers
 * reaches the hotel, not us. Until the domain is verified, Resend delivers only
 * to the Resend account's own address; the reason then says so (resendReason).
 */
const API = process.env.RESEND_API_URL || 'https://api.resend.com/emails'; // tests point it at a fake

/** Plain text on purpose: the fields are a stranger's input, so no HTML. */
export function leadEmail(lead, projectTitle) {
  const where = [projectTitle, lead.sceneName].filter(Boolean).join(' — ');
  const rows = [
    ['Name', lead.name], ['Phone', lead.phone], ['Email', lead.email],
    ['Looking for', lead.requirement], ['Dates', lead.dates], ['Was looking at', lead.hotspotLabel]
  ].filter(([, v]) => v).map(([k, v]) => `${`${k}:`.padEnd(16)}${v}`);
  const text = [
    `New enquiry${where ? ` from ${where}` : ''}`, '',
    ...rows,
    ...(lead.message ? ['', 'Message:', lead.message] : []),
    '', `Received ${new Date(lead.createdAt).toUTCString()}`
  ].join('\n');
  return { subject: `Enquiry: ${lead.name}${lead.sceneName ? ` — ${lead.sceneName}` : ''}`.slice(0, 180), text };
}

/** The project's own addresses plus LEADS_TO (always copied), without repeats. */
export const teamRecipients = (recipients) =>
  [...new Set([...recipients, ...(process.env.LEADS_TO ?? '').split(',')].map((s) => s.trim()).filter(Boolean))];

/** { sent: true } or { sent: false, reason } — never throws. */
export async function sendLeadEmail(lead, recipients, projectTitle) {
  return sendMail({ to: teamRecipients(recipients), ...leadEmail(lead, projectTitle), replyTo: lead.email });
}

/** LEADS_FROM's address alone ("leads@rcaas.tech" from "RCAAS.tech <leads@rcaas.tech>"). */
const fromAddress = () => {
  const from = process.env.LEADS_FROM || 'RCAAS.tech <onboarding@resend.dev>';
  return /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
};
/** A sender name can't carry quotes, angle brackets or line breaks into the header. */
const senderName = (name) => String(name).replace(/["<>\r\n]/g, '').trim().slice(0, 80);

/** How a venue's guests are written to: in its name, replies to its own address
 *  (the brand email, else the first address its enquiries go to). */
export const venueMail = (p) => ({
  fromName: p.theme?.brand || p.title,
  replyTo: p.info?.email || p.leadEmails?.[0] || undefined
});

/** Resend's refusal in words the studio can act on. Its JSON says why (403:
 *  testing only to your own address, or the domain isn't verified; 401/403: the key). */
export function resendReason(status, body) {
  const msg = String(body?.message ?? '');
  if (/testing emails|verify a domain|not verified|domain is not/i.test(msg)) {
    return 'Resend sends only to your own address until a domain is verified: verify one at resend.com/domains and set LEADS_FROM to an address on it';
  }
  if (status === 401 || /api key/i.test(msg)) return 'Resend refused the key (RESEND_API_KEY)';
  if (status === 429) return 'Resend’s sending limit was reached; it sends again shortly';
  return `The email service said ${status}${msg ? `: ${msg.slice(0, 200)}` : ''}`;
}

/** One plain-text email. { sent: true, to } or { sent: false, reason } — never throws.
 *  `fromName`: whose name it comes in (a venue's, venueMail); the address is always LEADS_FROM's. */
export async function sendMail({ to, subject, text, replyTo, fromName }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'Email isn’t set up (RESEND_API_KEY)' };
  if (!to.length) return { sent: false, reason: 'No one to send it to: add an email in the project’s Enquiries settings' };
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromName && senderName(fromName) ? `${senderName(fromName)} <${fromAddress()}>` : process.env.LEADS_FROM || 'RCAAS.tech <onboarding@resend.dev>',
        to,
        subject,
        text,
        ...(replyTo ? { reply_to: replyTo } : {})
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return { sent: false, reason: resendReason(res.status, await res.json().catch(() => null)) };
    return { sent: true, to };
  } catch (err) {
    return { sent: false, reason: err.name === 'TimeoutError' ? 'The email service didn’t answer' : 'Couldn’t reach the email service' };
  }
}
