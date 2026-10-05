import type { Metadata } from 'next';
import { POLICY_CONTACT, PolicyPage } from '../../../features/marketing/PolicyPage';

export const metadata: Metadata = {
  alternates: { canonical: '/cookies' },
  title: 'Cookie Policy',
  description: 'RCAAS.tech sets one cookie, only when you sign in, and no tracking or advertising cookies. What stays in your browser, and how to clear it.'
};

const SECTIONS = [
  {
    h: 'In short',
    body: <p>Visitors to our tours and websites get no cookies from us: no tracking, no analytics and no advertising cookies. We set one cookie, and only when someone signs in to the studio. Because nothing else is set, there is no cookie banner to accept.</p>
  },
  {
    h: 'The one cookie',
    body: (
      <ul>
        <li><b>splatspace_session</b>: keeps a team member or client signed in to the studio. It is set when you sign in, lasts 12 hours, cannot be read by page scripts, and is sent only to our own site. It is strictly necessary: without it, signing in would not work.</li>
      </ul>
    )
  },
  {
    h: 'Settings kept in your browser',
    body: (
      <>
        <p>To remember your choices between visits, the site keeps a few settings in your browser&apos;s local storage. They stay on your device, are never sent to us, and identify no one:</p>
        <ul>
          <li>The tour&apos;s language (English, नेपाली or 中文), whether its sound is on, and whether high definition is on.</li>
          <li>The picture quality your device handles well, so the tour does not have to measure it again.</li>
          <li>Light or dark theme.</li>
          <li>In the studio: the project you last opened. On a website review link: the name you comment under.</li>
        </ul>
      </>
    )
  },
  {
    h: 'Other companies',
    body: (
      <>
        <p>A client&apos;s website can show where they are on a Google map. The map loads only when you press <b>Show map</b>, and from then on Google&apos;s own cookies and <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noreferrer">cookie policy</a> apply to it. Until you press it, nothing is loaded from Google.</p>
        <p>Links to WhatsApp, Facebook, Instagram or a hotel&apos;s own booking page take you to those sites, which have their own policies.</p>
      </>
    )
  },
  {
    h: 'Clearing them',
    body: <p>You can delete the cookie and the stored settings at any time in your browser&apos;s settings, under site data for this website. Signing out of the studio also removes the cookie. The site keeps working; it just forgets your choices.</p>
  },
  {
    h: 'Changes',
    body: <p>If we ever add a cookie that is not strictly necessary, we will list it here and ask before setting it.</p>
  },
  { h: 'Contact', body: POLICY_CONTACT }
];

/** The Cookie Policy: the one sign-in cookie and what stays in the browser (PolicyPage). */
export default function CookiesPage() {
  return (
    <PolicyPage label="Cookies" title={<>Cookie <em>Policy</em></>} updated="4 October 2026" sections={SECTIONS}
      lede="One cookie, only when you sign in. No tracking, no analytics, no advertising." />
  );
}
