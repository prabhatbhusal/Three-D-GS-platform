import type { Metadata } from 'next';
import { POLICY_CONTACT, PolicyPage } from '../../../features/marketing/PolicyPage';

export const metadata: Metadata = {
  alternates: { canonical: '/terms' },
  title: 'Terms of Service',
  description: 'The terms for using RCAAS.tech tours, client websites and the studio, run by GeoNova Solutions Pvt. Ltd.'
};

const SECTIONS = [
  {
    h: 'About these terms',
    body: <p>These terms cover anyone who visits a tour or website made with RCAAS.tech, and our clients and their staff who use the studio. RCAAS.tech is a service of GeoNova Solutions Pvt. Ltd., Kathmandu. By using it you agree to these terms. A signed agreement with a client takes priority over them where the two differ.</p>
  },
  {
    h: 'What we provide',
    body: <p>We scan places in 3D and turn them into virtual tours, and can build a website for a client around them, with enquiry and booking forms. The price, delivery dates and what is included for each client are set in that client&apos;s quote or agreement.</p>
  },
  {
    h: 'Bookings and enquiries',
    body: (
      <>
        <p>A booking made through a tour or a client&apos;s website is a request to that business, not a confirmed booking. The business confirms or declines it and is responsible for its rooms, tables, halls, prices and deposits. We take no payments.</p>
        <p>Where a tour links to a business&apos;s own booking page, that page&apos;s terms apply.</p>
      </>
    )
  },
  {
    h: 'Clients’ responsibilities',
    body: (
      <ul>
        <li>You must have the right to let us scan the place, and must tell people there when a scan is taking place.</li>
        <li>You are responsible for the information you publish: prices, menus, availability, photos and descriptions.</li>
        <li>You must answer and handle your guests&apos; enquiries and bookings, and use their details only for that.</li>
        <li>Keep your account details private and remove staff who no longer work for you.</li>
      </ul>
    )
  },
  {
    h: 'Ownership',
    body: <p>Clients own the information and photos they add. Who owns the 3D scan data and for how long a tour stays online is set in each client&apos;s agreement. The RCAAS.tech software, design and brand belong to GeoNova Solutions.</p>
  },
  {
    h: 'Acceptable use',
    body: <p>Do not use the service to break the law, to send spam or false bookings, to upload anything you do not have the right to share, or to try to get into accounts or information that are not yours. We may suspend access that does.</p>
  },
  {
    h: 'Availability',
    body: <p>We work to keep tours online and fast, but cannot promise the service will never be interrupted, for example during maintenance or a provider&apos;s outage. Tours need a reasonably modern browser, and the 3D view needs WebGL. Enquiry forms work without it.</p>
  },
  {
    h: 'Liability',
    body: <p>As far as the law allows, GeoNova Solutions is not responsible for losses that come from a business&apos;s handling of a booking, from information a client published, or from an interruption to the service. For a client, our total liability is limited to the fees paid to us for the affected project in the twelve months before the claim.</p>
  },
  {
    h: 'Privacy and security',
    body: <p>How we handle personal information is in our <a href="/privacy">Privacy Policy</a>, and how we protect it is in our <a href="/security">Security Policy</a>.</p>
  },
  {
    h: 'Changes and law',
    body: <p>We may update these terms and will change the date at the top when we do. These terms are governed by the laws of Nepal, and the courts of Kathmandu decide any dispute.</p>
  },
  { h: 'Contact', body: POLICY_CONTACT }
];

/** The Terms of Service (PolicyPage). */
export default function TermsPage() {
  return (
    <PolicyPage label="Terms" title="Terms of Service" updated="4 October 2026" sections={SECTIONS}
      lede="The terms for visiting our tours and for clients who use RCAAS.tech." />
  );
}
