import type { Metadata } from 'next';
import { POLICY_CONTACT, PolicyPage } from '../../../features/marketing/PolicyPage';

export const metadata: Metadata = {
  alternates: { canonical: '/privacy' },
  title: 'Privacy Policy',
  description: 'What RCAAS.tech collects when you visit a tour, send an enquiry or book, who sees it, and how to have it removed.'
};

const SECTIONS = [
  {
    h: 'Who we are',
    body: (
      <>
        <p>RCAAS.tech is run by GeoNova Solutions Pvt. Ltd. in Kathmandu. We make 3D virtual tours and websites for hotels, restaurants, venues, colleges and heritage sites (our clients).</p>
        <p>On this website and in our studio we decide what is collected. On a tour or website we made for a client, the client decides what to ask its guests, and we handle that information on the client&apos;s behalf.</p>
      </>
    )
  },
  {
    h: 'What we collect',
    body: (
      <ul>
        <li><b>Enquiries and booking requests</b> you send from a tour or a client&apos;s website: your name, phone number, email if you give it, the dates, times and number of guests, and your message.</li>
        <li><b>Visit counts</b>: how many visits a tour gets, how long people spend in each space, and which hotspots are opened. These are totals only. We set no tracking cookies and do not store your IP address or anything else that identifies you.</li>
        <li><b>Questions to the tour concierge</b>, where a client has switched it on. Your question is sent to our AI provider to write the answer and is not stored by us.</li>
        <li><b>Studio accounts</b> for our team and our clients&apos; staff: name, email, role and password. Passwords are stored only as a salted hash, never as you typed them.</li>
        <li><b>Settings in your browser</b>, such as language, sound on or off, picture quality and light or dark theme. They stay on your device and are not sent to us. The only cookie we set keeps a studio user signed in; see our <a href="/cookies">Cookie Policy</a>.</li>
      </ul>
    )
  },
  {
    h: 'How we use it',
    body: (
      <>
        <p>We use an enquiry or booking request only to pass it to the business you sent it to, so they can reply, confirm or decline. We send you a text, WhatsApp message or email about that request.</p>
        <p>We use visit counts to give each client a monthly report. We never sell your information or use it for advertising.</p>
      </>
    )
  },
  {
    h: 'Who sees it',
    body: (
      <>
        <p>The business you contacted and the staff it has given access to. Our own team, when needed to run the service. And these providers, only for the job named:</p>
        <ul>
          <li>Supabase (database, Singapore region): studio accounts.</li>
          <li>Cloudflare (storage and delivery): tour files and photos.</li>
          <li>Resend (email), Sparrow SMS (texts in Nepal) and Meta&apos;s WhatsApp Business service: messages about your request.</li>
          <li>Anthropic (AI): questions asked to a tour&apos;s concierge.</li>
        </ul>
        <p>We share information with the authorities only when the law of Nepal requires it.</p>
      </>
    )
  },
  {
    h: 'The 3D scans',
    body: <p>We scan a place only with its owner&apos;s permission. A scan can show people or objects that were there at the time. If you see yourself or something private in a tour, tell us and we will work with the owner to remove it.</p>
  },
  {
    h: 'How long we keep it',
    body: <p>Enquiries and booking requests are kept while the client&apos;s project with us is active, so the business can look back at them. Studio accounts are kept until they are removed. You can ask us to delete your information sooner at any time.</p>
  },
  {
    h: 'Your rights',
    body: <p>You can ask what we hold about you, ask us to correct it, or ask us to delete it. Write to us at the address below. We reply within 30 days. These rights follow Nepal&apos;s Privacy Act, 2075 (2018).</p>
  },
  {
    h: 'Children',
    body: <p>Our tours are for the general public. We do not knowingly collect information from children under 16. A parent who believes their child sent us information can ask us to delete it.</p>
  },
  {
    h: 'Changes',
    body: <p>When this policy changes, we update it here and change the date at the top.</p>
  },
  { h: 'Contact', body: POLICY_CONTACT }
];

/** The Privacy Policy, written to match what the code collects and sends (PolicyPage). */
export default function PrivacyPage() {
  return (
    <PolicyPage label="Privacy" title={<>Privacy <em>Policy</em></>} updated="4 October 2026" sections={SECTIONS}
      lede="What we collect when you visit a tour, send an enquiry or book, who sees it, and how to have it removed." />
  );
}
