import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";

export default function TermsOfService({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Third Parties" />
      <Layout>
        <Header page="policies" subPage="thirdparties" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <div style={{ textAlign: "center", color: "#444" }}>
              <h1 style={{ fontSize: "28pt" }}>
                CoCalc - Third Parties Statements
              </h1>
            </div>
            <div style={{ fontSize: "12pt" }}>
              <p>
                CoCalc uses a number of third party providers and services. For
                each of them, we explain the purpose and use case, which
                Personally Identifiable Information (PII) of our users is
                shared, and give links to their privacy policies.{" "}
              </p>
              <h2>Essential Services</h2>
              <p>
                These services support CoCalc's infrastructure. You are likely
                using them implicitly whenever you are using CoCalc.
              </p>
              <ul>
                <li>
                  <A href="https://www.cloudflare.com/">Cloudflare</A>
                  <ul>
                    <li>Usage: DDOS protection, data traffic management.</li>
                    <li>
                      Shared PII: IP address necessary to establish the
                      connection.
                    </li>
                    <li>
                      <A href="https://www.cloudflare.com/privacypolicy/">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://www.cloudflare.com/cloudflare-customer-dpa/">
                        Data Processing Addendum
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://cloud.google.com/">Google Cloud Platform</A>
                  <ul>
                    <li>
                      Usage: cloud hosting, compute and storage resources.
                    </li>
                    <li>
                      Shared PII: everything. Google does not process these data
                      for its own purposes.
                    </li>
                    <li>
                      <A href="https://cloud.google.com/terms/cloud-privacy-notice">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://cloud.google.com/terms/data-processing-addendum">
                        Data Processing Addendum
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href={"https://www.google.com/recaptcha/about/"}>
                    reCAPTCHA
                  </A>
                  <ul>
                    <li>Usage: fraud and abuse protection.</li>
                    <li>Shared PII: none directly.</li>
                  </ul>
                </li>
              </ul>
              <h2>Payment Processor</h2>
              <p>
                <A href="https://stripe.com">Stripe, Inc.</A> processes payments
                on CoCalc's behalf. Credit card information and associated data
                is only stored by Stripe. We do not have access to full account
                numbers.
              </p>
              <ul>
                <li>Usage: payment processor.</li>
                <li>
                  Shared PII: name, email address, purchase data, account id.
                </li>
                <li>
                  <A href="https://stripe.com/us/privacy">Privacy Policy</A> and{" "}
                  <A href="https://stripe.com/legal/dpa">
                    Data Processing Agreement
                  </A>
                </li>
              </ul>
              <h2>Communication Services</h2>
              <p>
                These services facilitate interaction between you and CoCalc's
                team.
              </p>
              <ul>
                <li>
                  <A href="https://aws.amazon.com/">Amazon Web Services</A>
                  <ul>
                    <li>Usage: secondary email backend.</li>
                    <li>Shared PII: name, email address.</li>
                    <li>
                      <A href="https://aws.amazon.com/privacy/">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://d1.awsstatic.com/legal/aws-dpa/aws-dpa.pdf">
                        Data Processing Addendum
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://workspace.google.com/">Google Workspace</A>
                  <ul>
                    <li>Usage: email communication.</li>
                    <li>Shared PII: name, email address.</li>
                    <li>
                      <A href="https://cloud.google.com/terms/cloud-privacy-notice">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://cloud.google.com/terms/data-processing-addendum">
                        Data Processing Addendum
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://sendgrid.com/">Twilio SendGrid</A>
                  <ul>
                    <li>Usage: email backend.</li>
                    <li>Shared PII: name, email address.</li>
                    <li>
                      <A href="https://www.twilio.com/legal/privacy">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://www.twilio.com/legal/data-protection-addendum">
                        Data Protection Addendum
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://www.zendesk.com/">Zendesk</A>
                  <ul>
                    <li>Usage: support tickets.</li>
                    <li>Shared PII: name, email address, account id.</li>
                    <li>
                      <A href="https://www.zendesk.com/company/agreements-and-terms/privacy-notice/">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://www.zendesk.com/company/data-processing-form/">
                        Data Processing Agreement
                      </A>
                    </li>
                  </ul>
                </li>
              </ul>
              <h2>Extra Services</h2>
              <p>
                These services provide additional functionality in CoCalc. If
                you are not using respective features, you are not using these
                services.
              </p>
              <ul>
                <li>
                  <A href="https://gravatar.com/">Gravatar by Automattic</A>
                  <ul>
                    <li>Usage: avatar images.</li>
                    <li>Shared PII: email address.</li>
                    <li>
                      <A href="https://automattic.com/privacy/">
                        Privacy Policy
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://www.hyperstack.cloud/">Hyperstack</A>
                  <ul>
                    <li>Usage: compute servers.</li>
                    <li>
                      Shared PII: any files that the user chooses to process on
                      Hyperstack.
                    </li>
                    <li>
                      <A href="https://www.hyperstack.cloud/privacy-policy">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://www.hyperstack.cloud/data-processing">
                        Data Processing Agreement
                      </A>
                    </li>
                  </ul>
                </li>
              </ul>
              <h2>AI Services</h2>
              <p>
                Despite thorough integration of the AI Assistant in CoCalc's
                interface, it does not use any "background" AI services. You
                have to explicitly initiate any AI interaction and you control
                what exactly will be sent to AI models. No other PII is shared.
              </p>
              <ul>
                <li>
                  <A href="https://www.anthropic.com/">Anthropic</A>
                  <ul>
                    <li>
                      <A href="https://www.anthropic.com/legal/commercial-terms">
                        Terms of Service
                      </A>
                    </li>
                    <li>
                      <A href="https://www.anthropic.com/legal/privacy">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://www.anthropic.com/legal/commercial-terms">
                        Data Processing Agreement
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://ai.google.dev/">Google AI</A>
                  <ul>
                    <li>
                      <A href="https://ai.google.dev/gemini-api/terms">
                        Gemini API Additional Terms of Service
                      </A>
                    </li>
                    <li>
                      <A href="https://policies.google.com/privacy">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://business.safety.google/processorterms/">
                        Data Processing Addendum
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://mistral.ai/">Mistral AI</A>
                  <ul>
                    <li>
                      <A href="https://mistral.ai/terms">Terms of Service</A>
                    </li>
                    <li>
                      <A href="https://mistral.ai/terms#privacy-policy">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://mistral.ai/terms#data-processing-agreement">
                        Data Processing Agreement
                      </A>
                    </li>
                  </ul>
                </li>
                <li>
                  <A href="https://openai.com/">OpenAI</A>
                  <ul>
                    <li>
                      <A href="https://openai.com/policies/terms-of-use">
                        Terms of Use
                      </A>
                    </li>
                    <li>
                      <A href="https://openai.com/policies/privacy-policy/">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://openai.com/policies/data-processing-addendum/">
                        Data Processing Addendum
                      </A>
                    </li>
                  </ul>
                </li>
              </ul>
              <h2>Marketing</h2>
              <p>
                These services help us to reach out to current and potential
                customers, letting them know about new useful features. We do
                not sell or share our users data for marketing purposes.
              </p>
              <ul>
                <li>
                  <A href="https://www.salesloft.com/">Salesloft</A>
                  <ul>
                    <li>Usage: onboarding emails, sales, marketing.</li>
                    <li>
                      Shared PII: name, email address, purchasing activity.
                    </li>
                    <li>
                      <A href="https://www.salesloft.com/legal/privacy-notice">
                        Privacy Policy
                      </A>{" "}
                      and{" "}
                      <A href="https://www.salesloft.com/legal/data-processing-addendum">
                        Data Processing Addendum
                      </A>
                    </li>
                  </ul>
                </li>
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
                  June 7, 2025: Removed Backblaze, previously used for backups.
                </li>
                <li>
                  February 19, 2025: Removed Google Analytics, which we no
                  longer use. Broke content into categories. Unified formatting
                  and updated links to companies, Privacy Policies, and DPAs.
                  Added Anthropic, Hyperstack, Mistral AI.
                </li>
                <li>March 16, 2023: Added openai.</li>
                <li>
                  September 15, 2021: Removed appear.in, which we no longer use.
                </li>
              </ul>
            </div>
          </div>
          <Footer />
        </Layout.Content>{" "}
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
