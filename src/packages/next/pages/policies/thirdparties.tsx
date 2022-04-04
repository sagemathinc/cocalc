import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";

export default function TermsOfService({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Third Parties" />
      <Header page="policies" subPage="thirdparties" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "15px auto",
            padding: "15px",
            backgroundColor: "white",
          }}
        >
          <div style={{ textAlign: "center", color: "#444" }}>
            <h1 style={{ fontSize: "28pt" }}>
              CoCalc - Third Parties Statements
            </h1>
            <h2>Last Updated: September 15, 2021</h2>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <p>
              CoCalc uses a number of third party providers and services. For
              each of them, we link to further policies, explain the purpose and
              use case, and which data is shared.{" "}
            </p>
            <ul>
              <li>
                <A href="https://cloud.google.com/">Google Cloud Platform</A> by
                Google Inc.
              </li>
              <ul>
                <li>
                  Google Compute Engine: running the online service (
                  <A href="https://cloud.google.com/terms/data-processing-terms">
                    data processing and security terms
                  </A>
                  )
                </li>
                <li>
                  Google Cloud Storage: saving various files, project archives,
                  and backup
                </li>
                <li>
                  part of{" "}
                  <A href="https://www.privacyshield.gov/participant?id=a2zt000000001L5AAI">
                    us/eu privacy shield
                  </A>
                </li>
              </ul>
              <li>Google Analytics by Google Inc.</li>
              <ul>
                <li>usage: basically sets a cookie to help understand usage</li>
                <li>
                  <A href="https://marketingplatform.google.com/about/analytics/terms/us/">
                    terms of service
                  </A>
                </li>
                <li>
                  <A href="https://support.google.com/analytics/answer/181881?hl=en">
                    opt-out plugin
                  </A>
                </li>
              </ul>
              <li>
                <A href={"https://www.google.com/recaptcha/about/"}>
                  reCAPTCHA
                </A>
              </li>
              <ul>
                <li>usage: fraud and abuse protection</li>
                <li>
                  <A href={"https://policies.google.com/terms"}>
                    Terms of Usage
                  </A>
                </li>
                <li>
                  <A href={"https://policies.google.com/privacy"}>
                    Privacy Policy
                  </A>
                </li>
              </ul>
              <li>
                <A href="https://www.zendesk.com/">Zendesk</A>
              </li>
              <ul>
                <li>usage: support tickets</li>
                <li>shared: name, email address, account id</li>
                <li>
                  <A href="https://www.zendesk.com/company/customers-partners/privacy-policy/">
                    privacy policy
                  </A>{" "}
                  and{" "}
                  <A href="https://www.zendesk.com/company/customers-partners/eu-data-protection/">
                    eu data protection
                  </A>
                </li>
                <li>
                  <A href="https://www.privacyshield.gov/participant?id=a2zt0000000TOjeAAG">
                    us/eu privacy shield
                  </A>
                </li>
              </ul>
              <li>
                <A href="https://stripe.com">Stripe, Inc.</A>
              </li>
              <ul>
                <li>usage: payment processor</li>
                <li>
                  shared: name, email address, subscription data, account id
                </li>
                <li>
                  <A href="https://stripe.com/us/privacy">privacy policy</A> and{" "}
                  <A href="https://stripe.com/privacy-shield-policy">
                    privacy shield information
                  </A>
                </li>
                <li>
                  Credit card information and associated data is only stored by
                  Stripe
                </li>
                <li>
                  <A href="https://www.privacyshield.gov/participant?id=a2zt0000000TQOUAA4">
                    us/eu privacy shield
                  </A>
                </li>
              </ul>
              <li>
                <A href="https://meet.jit.si/">Jitsi Video Conferencing</A>
              </li>
              <ul>
                <li>usage: embedded video conferencing</li>
                <li>shared: no personal data is shared</li>
                <li>
                  <A href="https://jitsi.org/meet/terms">privacy policy</A>, the
                  service is run by Atlassian
                </li>
                <li>
                  <A href="https://www.privacyshield.gov/participant?id=a2zt00000008RdQAAU">
                    us/eu privacy shield
                  </A>
                </li>
              </ul>
              <li>
                <A href="https://gravatar.com/">Gravatar by Automattic</A>
              </li>
              <ul>
                <li>usage: avatar images</li>
                <li>shared: email address</li>
                <li>
                  NOT used by CoCalc in any way unless user explicitly requests
                  it.
                </li>
                <li>
                  <A href="https://automattic.com/privacy/">privacy policy</A>
                </li>
                <li>
                  <A href="https://www.privacyshield.gov/participant?id=a2zt0000000CbqcAAC">
                    us/eu privacy shield
                  </A>
                </li>
              </ul>
              <li>Google GSuite</li>
              <ul>
                <li>usage: email communication</li>
                <li>
                  <A href="https://gsuite.google.com/intl/en/security/">
                    GSuite security
                  </A>
                </li>
                <li>
                  shared: name, email address for emails sent or received by
                  SageMath, Inc.
                </li>
              </ul>
              <li>
                <A href="https://www.cloudflare.com/">Cloudflare</A>
              </li>
              <ul>
                <li>
                  usage: DDOS protection, i.e. manages data traffic from and to
                  the cocalc.com service
                </li>
                <li>shared: no structured user data is shared with them</li>
                <li>
                  <A href="https://www.cloudflare.com/gdpr/introduction/">
                    GDPR info
                  </A>
                </li>
                <li>
                  <A href="https://www.privacyshield.gov/participant?id=a2zt0000000GnZKAA0">
                    us/eu privacy shield
                  </A>
                </li>
              </ul>
              <li>
                <A href="https://www.backblaze.com/">Backblaze</A>
              </li>
              <ul>
                <li>usage: additional backup for emergency situations</li>
                <li>
                  <A href="https://www.backblaze.com/company/privacy.html">
                    Backblaze Privacy Notice
                  </A>{" "}
                  and{" "}
                  <A href="https://www.backblaze.com/company/dpa.html">
                    Data Processing Addendum
                  </A>{" "}
                </li>
              </ul>
              <li>
                <A href="https://sendgrid.com/">Sendgrid (twilio)</A>
              </li>
              <ul>
                <li>
                  usage: email backend (transactional, e.g. welcome, password
                  resets, ...)
                </li>
                <li>shared: email address</li>
                <li>
                  <A href="https://www.twilio.com/legal/privacy">
                    Privacy Policy
                  </A>
                </li>
                <li>
                  <A href="https://sendgrid.com/resource/general-data-protection-regulation-2/">
                    GDPR Information
                  </A>{" "}
                </li>
              </ul>
              <li>
                <A href="https://aws.amazon.com/">Amazon AWS</A>
              </li>
              <ul>
                <li>
                  usage: secondary email backend (transactional, e.g. welcome,
                  password resets, ...)
                </li>
                <li>shared: email address</li>
                <li>
                  <A href="https://aws.amazon.com/compliance/data-privacy-faq/">
                    Data Privacy Notice
                  </A>
                </li>
                <li>
                  <A href="https://aws.amazon.com/compliance/gdpr-center/">
                    GDPR Information
                  </A>{" "}
                </li>
              </ul>
            </ul>
            <h1>Questions?</h1>
            <p>
              Please contact us at{" "}
              <A href="mailto:office@sagemath.com">office@sagemath.com</A> if
              you have any questions about our Third Parties.
            </p>
            <h1>Changes</h1>
            <ul>
              <li>
                September 15, 2021: removed appear.in, which we no longer use.
              </li>
            </ul>
          </div>
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
