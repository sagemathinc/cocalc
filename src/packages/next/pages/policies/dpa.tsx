/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { COLORS } from "@cocalc/util/theme";
import A from "components/misc/A";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { MAX_WIDTH } from "lib/config";
import { Customize, type CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
}

export default function DataProcessingAddendumPage({ customize }: Props) {
  return (
    <Customize value={customize}>
      <Head title="Data Processing Addendum" />
      <Layout>
        <Header page="policies" subPage="dpa" />
        <Layout.Content
          style={{
            backgroundColor: COLORS.WHITE,
          }}
        >
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              fontSize: "12pt",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <h1>CoCalc - Data Processing Addendum</h1>
              <p>Last Updated: April 15, 2026</p>
            </div>
            <div>
              <p>
                This Data Processing Addendum ("<b>DPA</b>") is incorporated
                into the SageMath, Inc. Terms of Service ("<b>Agreement</b>")
                and applies to the processing of Personal Data by SageMath, Inc.
                on behalf of its Users.
              </p>
              <h1>1. Nature and Purpose of Processing</h1>
              <p>
                SageMath, Inc. provides a collaborative cloud-based platform
                (CoCalc) for research, analysis, and scientific publishing. The
                Subject Matter of the processing is the data uploaded, created,
                or processed by the User within the CoCalc environment.
              </p>
              <ul>
                <li>
                  <b>Hosted Platform</b>: Data is stored and processed on
                  SageMath, Inc. infrastructure to provide core platform
                  functionality.
                </li>
                <li>
                  <b>User-Directed Compute</b>: Users may explicitly choose the
                  geographic location and infrastructure provider for specific
                  compute tasks. In such cases, SageMath, Inc. processes data in
                  the location selected by the User.
                </li>
                <li>
                  <b>AI-Assisted Features</b>: SageMath, Inc. provides optional
                  integrations with third-party AI providers. Data is
                  transmitted to these providers only upon explicit initiation
                  by the User.
                </li>
              </ul>
              <h1>2. Sub-processors</h1>
              <p>
                The Controller (User) provides a general authorization for
                SageMath, Inc. to engage sub-processors.
              </p>
              <ul>
                <li>
                  <b>Current List</b>: A current list of sub-processors is
                  maintained at the{" "}
                  <b>
                    SageMath, Inc. Trust Center (
                    <A href="https://trust.cocalc.com/">
                      https://trust.cocalc.com/
                    </A>
                    )
                  </b>
                  .
                </li>
                <li>
                  <b>Notification of Changes</b>: Users may subscribe to
                  notifications of changes to the sub-processor list directly
                  via the Trust Center. SageMath, Inc. will provide at least{" "}
                  <b>15 days&apos; notice</b> before authorizing any new
                  sub-processor to process Customer Data, during which time the
                  Controller may object to the change in writing.
                </li>
              </ul>
              <h1>3. Security of Processing</h1>
              <p>
                SageMath, Inc. shall implement and maintain appropriate
                technical and organizational measures to protect Customer Data
                against unauthorized access, loss, or disclosure. These measures
                include, but are not limited to:
              </p>
              <ul>
                <li>
                  <b>Encryption</b>: Data is encrypted at rest and in transit
                  using industry-standard protocols.
                </li>
                <li>
                  <b>Access Control</b>: Access to production environments is
                  restricted to authorized personnel on a "need-to-know" basis.
                </li>
                <li>
                  <b>Audit</b>: SageMath, Inc. undergoes regular security
                  assessments and maintains documentation of its security
                  controls (e.g., SOC 2 Type II report).
                </li>
              </ul>
              <h1>4. GDPR Representation</h1>
              <p>
                Pursuant to Article 27 of the GDPR, SageMath, Inc. has appointed
                the following representatives for data protection matters in the
                EU and UK:
              </p>
              <ul>
                <li>
                  <b>EU Representative</b>: Adam Brogden, Instant EU GDPR
                  Representative Ltd (Ireland). Contact:{" "}
                  <A href="mailto:contact@gdprlocal.com">
                    contact@gdprlocal.com
                  </A>
                  .
                </li>
                <li>
                  <b>UK Representative</b>: Adam Brogden, GDPRLocal Ltd.
                  Contact:{" "}
                  <A href="mailto:contact@gdprlocal.com">
                    contact@gdprlocal.com
                  </A>
                  .
                </li>
              </ul>
              <h1>5. Data Subject Rights and Collaboration</h1>
              <ul>
                <li>
                  <b>User-Controlled Deletion</b>: SageMath, Inc. provides the
                  Controller with the ability to delete files, projects, and
                  accounts directly through the CoCalc interface.
                </li>
                <li>
                  <b>Requests to SageMath, Inc.</b>: If SageMath, Inc. receives
                  a request from a Data Subject to exercise their rights
                  regarding data contained within a project owned by another
                  User, SageMath, Inc. will forward that request to the project
                  owner.
                </li>
                <li>
                  <b>Collaborative Integrity</b>: The Controller acknowledges
                  that in a collaborative environment, the deletion of a Data
                  Subject&apos;s account may not result in the deletion of data
                  contained within projects owned by other Users, as that data
                  is part of the other User&apos;s records.
                </li>
              </ul>
              <h1>6. International Data Transfers</h1>
              <ul>
                <li>
                  <b>Standard Contractual Clauses (SCCs)</b>: For transfers of
                  Personal Data from the EU/EEA to countries that do not ensure
                  an adequate level of data protection, the parties hereby
                  incorporate by reference the{" "}
                  <b>
                    Standard Contractual Clauses (Module Two:
                    Controller-to-Processor)
                  </b>
                  .
                </li>
                <li>
                  <b>UK Addendum</b>: For transfers from the UK, the{" "}
                  <b>International Data Transfer Addendum</b> to the EU SCCs is
                  hereby incorporated.
                </li>
                <li>
                  <b>Hierarchy</b>: In the event of a conflict between this DPA
                  and the SCCs, the SCCs shall prevail.
                </li>
              </ul>
              <h1>7. Data Deletion and Return</h1>
              <p>
                Upon termination of the Agreement or at the Controller&apos;s
                request, SageMath, Inc. shall delete or return all Customer Data
                in its possession, unless applicable law requires continued
                storage. Data is typically deleted within 60 days of contract
                termination.
              </p>
              <h1>8. Audit and Compliance</h1>
              <p>
                SageMath, Inc. shall make available to the Controller all
                information reasonably necessary to demonstrate compliance with
                Article 28 of the GDPR. The Controller acknowledges that
                SageMath, Inc.&apos;s maintenance of a <b>SOC 2 Type II</b>{" "}
                report satisfies the Controller&apos;s right to audit SageMath,
                Inc.&apos;s technical and organizational measures.
              </p>
              <h1>9. Liability</h1>
              <p>
                The total liability of each party under this DPA shall be
                subject to the limitation of liability provisions set forth in
                the SageMath, Inc. Terms of Service.
              </p>
              <hr />
              <p>
                <b>
                  This DPA is incorporated into the SageMath, Inc. Terms of
                  Service by reference and is effective as of the date the User
                  first accesses the CoCalc platform.
                </b>
              </p>
            </div>
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
