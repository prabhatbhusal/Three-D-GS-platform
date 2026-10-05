/** "Have a space worth walking?": the call to get in touch that SitePage puts
 *  above the footer, and the call / email / visit trio it shares with the
 *  Contact page. Styles: landing.css .lp-contact, .lp-way. */

export function ContactWays() {
  return (
    <div className="lp-contact-ways">
      <a href="tel:+9779846789573" className="lp-way">
        <span>Call</span><strong>+977 984 678 9573</strong>
      </a>
      <a href="mailto:info@geonova.com.np?subject=Capture%20enquiry%20from%20RCAAS.tech" className="lp-way">
        <span>Email</span><strong>info@geonova.com.np</strong>
      </a>
      <div className="lp-way lp-way-static">
        <span>Visit</span><strong>Kageshwari-Manohara, Kathmandu</strong>
        <small>Sunday to Friday, 10:00 to 17:30</small>
      </div>
    </div>
  );
}

export function ContactBand() {
  return (
    <section className="lp-contact" aria-label="Contact">
      <h2>Have a space worth <em>walking</em>?</h2>
      <p>Tell us what it is and where. We will scan it, publish it and hand you a link.</p>
      <ContactWays />
    </section>
  );
}
