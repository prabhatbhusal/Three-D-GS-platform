/**
 * Text messages to guests (2026-09-28): booking confirmations and waitlist
 * news by SMS and/or WhatsApp, alongside the email mailer.js sends. Each is
 * off until its keys are in server/.env; with neither, guests still get
 * email if they left an address. Node's own fetch, no library.
 *
 *   SMS through Sparrow SMS (sparrowsms.com, Nepal):
 *     SMS_TOKEN=...            the account's token
 *     SMS_FROM=...             the sender identity Sparrow gave the account
 *   WhatsApp through Meta's WhatsApp Cloud API:
 *     WHATSAPP_TOKEN=...       a permanent access token
 *     WHATSAPP_PHONE_ID=...    the sending number's id
 *     WHATSAPP_TEMPLATE=...    an approved template with one {{1}} body text.
 *                              Meta only lets a business message someone first
 *                              through a template; without one, a plain text
 *                              message reaches only guests who wrote within 24 h.
 *   PHONE_COUNTRY=977          the country code for numbers written without one
 */

const SMS_API = () => process.env.SMS_API_URL || 'https://api.sparrowsms.com/v2/sms/';
const WA_API = () => process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';

/**
 * A phone number as typed by a guest, in the two forms the services want:
 * `intl` with the country code and no "+", and `local` for a Nepali mobile
 * (10 digits, 97/98...), which Sparrow sends to. Null when it isn't a number.
 */
export function phoneOf(typed, country = process.env.PHONE_COUNTRY || '977') {
  const raw = String(typed ?? '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) return null;
  if (raw.startsWith('00')) digits = digits.slice(2);
  const hasCountry = raw.startsWith('+') || raw.startsWith('00') || (digits.startsWith(country) && digits.length > 10);
  const intl = hasCountry ? digits : `${country}${digits.replace(/^0+/, '')}`;
  const local = intl.startsWith('977') && /^9[78]\d{8}$/.test(intl.slice(3)) ? intl.slice(3) : null;
  return { intl, local };
}

export const smsOn = () => !!(process.env.SMS_TOKEN && process.env.SMS_FROM);
export const whatsappOn = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);

async function post(url, init) {
  try {
    const res = await fetch(url, { method: 'POST', ...init, signal: AbortSignal.timeout(15000) });
    return res.ok ? { sent: true } : { sent: false, reason: `the service said ${res.status}` };
  } catch (err) {
    return { sent: false, reason: err.name === 'TimeoutError' ? 'the service didn’t answer' : 'couldn’t reach the service' };
  }
}

/** One SMS to a Nepali mobile. { sent } or { sent: false, reason } — never throws. */
export async function sendSms(phone, text) {
  if (!smsOn()) return { sent: false, reason: 'SMS isn’t set up (SMS_TOKEN, SMS_FROM)' };
  const p = phoneOf(phone);
  if (!p?.local) return { sent: false, reason: 'not a Nepali mobile number' };
  return post(SMS_API(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: process.env.SMS_TOKEN, from: process.env.SMS_FROM, to: p.local, text: text.slice(0, 600) })
  });
}

/** One WhatsApp message. { sent } or { sent: false, reason } — never throws. */
export async function sendWhatsApp(phone, text) {
  if (!whatsappOn()) return { sent: false, reason: 'WhatsApp isn’t set up (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID)' };
  const p = phoneOf(phone);
  if (!p) return { sent: false, reason: 'not a phone number' };
  const template = process.env.WHATSAPP_TEMPLATE;
  const message = template
    ? { type: 'template', template: { name: template, language: { code: process.env.WHATSAPP_LANG || 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 1000) }] }] } }
    : { type: 'text', text: { body: text.slice(0, 1000) } };
  return post(`${WA_API()}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: p.intl, ...message })
  });
}

/** A text to a guest by every channel that's set up: { sms?, whatsapp? }, each { sent, reason? }. */
export async function textGuest(phone, text) {
  const out = {};
  if (smsOn()) out.sms = await sendSms(phone, text);
  if (whatsappOn()) out.whatsapp = await sendWhatsApp(phone, text);
  return out;
}
