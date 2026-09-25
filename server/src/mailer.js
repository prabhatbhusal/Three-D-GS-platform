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

/** { sent: true } or { sent: false, reason } — never throws. */
export async function sendLeadEmail(lead, recipients, projectTitle) {
  const key = process.env.RESEND_API_KEY;
  const to = [...new Set([...recipients, ...(process.env.LEADS_TO ?? '').split(',')].map((s) => s.trim()).filter(Boolean))];
  if (!key) return { sent: false, reason: 'Email isn’t set up (RESEND_API_KEY)' };
  if (!to.length) return { sent: false, reason: 'No one to send it to: add an email in the project’s Enquiries settings' };
  const { subject, text } = leadEmail(lead, projectTitle);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEADS_FROM || 'RCAAS.tech <onboarding@resend.dev>',
        to,
        subject,
        text,
        ...(lead.email ? { reply_to: lead.email } : {})
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return { sent: false, reason: `The email service said ${res.status}` };
    return { sent: true, to };
  } catch (err) {
    return { sent: false, reason: err.name === 'TimeoutError' ? 'The email service didn’t answer' : 'Couldn’t reach the email service' };
  }
}
