import type { Metadata } from 'next';
import { POLICY_CONTACT, PolicyPage } from '../../../features/marketing/PolicyPage';

export const metadata: Metadata = {
  alternates: { canonical: '/security' },
  title: 'Security Policy',
  description: 'How RCAAS.tech protects accounts, guests’ details and client tours, and how to report a security problem.'
};

const SECTIONS = [
  {
    h: 'Accounts and sign-in',
    body: (
      <ul>
        <li>Passwords are stored only as a salted scrypt hash. Nobody, including our team, can read them.</li>
        <li>Creating a team account needs a team access code. Clients&apos; staff join only by an invitation from the project&apos;s owner.</li>
        <li>Sessions last 12 hours in a cookie that page scripts cannot read. Changing or resetting a password signs that account out everywhere.</li>
        <li>Password reset links work once, for 24 hours. Repeated sign-in attempts from one connection are slowed down.</li>
      </ul>
    )
  },
  {
    h: 'Who can see what',
    body: (
      <ul>
        <li>Each client project is visible only to its owner and the people they add. Being an administrator does not show anyone else&apos;s projects.</li>
        <li>Clients&apos; staff accounts can answer their own project&apos;s enquiries and bookings and nothing else.</li>
        <li>Visitors only ever see published versions. Work in progress in the studio never changes a live tour.</li>
        <li>A tour embedded on another website can be limited to the sites its owner allows.</li>
      </ul>
    )
  },
  {
    h: 'Data and infrastructure',
    body: (
      <ul>
        <li>Connections to our service are encrypted (HTTPS).</li>
        <li>Our database is reachable only by our own server. It is not exposed to the public internet API, and every table has row-level security switched on.</li>
        <li>Keys for email, text messages and other services are kept on the server, never in the browser.</li>
        <li>Visit statistics are totals only. We do not store visitors&apos; IP addresses.</li>
        <li>We do not take card payments, so we hold no card details.</li>
      </ul>
    )
  },
  {
    h: 'If something goes wrong',
    body: <p>If we learn that someone got into information they should not have, we will tell the affected clients without undue delay, explain what happened and what we are doing about it, and inform the authorities where Nepal&apos;s law requires it.</p>
  },
  {
    h: 'Reporting a security problem',
    body: (
      <>
        <p>If you find a weakness in RCAAS.tech, email <a href="mailto:info@geonova.com.np?subject=Security%20report">info@geonova.com.np</a> with &quot;Security report&quot; in the subject. Tell us what you found and how to see it. We will reply within 5 working days and keep you told of the fix.</p>
        <p>Please test only against your own account, do not read or change other people&apos;s information, and give us a reasonable time to fix a problem before telling anyone else. We will not take action against anyone who reports in good faith this way.</p>
      </>
    )
  },
  { h: 'Contact', body: POLICY_CONTACT }
];

/** The Security Policy: how accounts and data are protected, and how to report a problem (PolicyPage). */
export default function SecurityPage() {
  return (
    <PolicyPage label="Security" title="Security Policy" updated="4 October 2026" sections={SECTIONS}
      lede="How we protect accounts, guests’ details and client tours, and how to report a problem." />
  );
}
