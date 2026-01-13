/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Divider, Layout, List } from "antd";
import { ReactNode, type JSX } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import getSupportUrl from "@cocalc/frontend/support/url";
import {
  WORKSPACE_LABEL,
  WORKSPACES_LABEL,
} from "@cocalc/util/i18n/terminology";
import { money } from "@cocalc/util/licenses/purchase/utils";
import { COLORS } from "@cocalc/util/theme";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import PricingItem, { Line } from "components/landing/pricing-item";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";

import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

const PUBLISH_PRICE = false;

const CM = <Icon name="check" />;

const INF = "∞";
interface Item {
  title: string;
  icon: IconName;
  individuals: string;
  price: number | null;
  academic?: ReactNode;
  extra?: number;
  prod?: string;
}

const data: Item[] = [
  {
    title: "Small Business",
    icon: "experiment",
    individuals: "≤ 25",
    price: 10000,
  },
  {
    title: "Large Organization",
    icon: "home",
    individuals: "> 25",
    price: null,
    prod: "≥1",
  },
  {
    title: "University",
    icon: "graduation-cap",
    individuals: "≤ 150",
    price: 6000,
    academic: CM,
  },
];

export default function OnPrem({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`${siteName} – On-Premises Offerings`} />
      <Layout>
        <Header page="pricing" subPage="onprem" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <Body />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

function Body() {
  const contactURL = getSupportUrl({
    subject: "Purchase CoCalc OnPrem",
    type: "chat",
    url: "",
  });

  function renderContactButton(
    text: string | ReactNode = "Contact Us",
  ): JSX.Element {
    return (
      <Button size="large" href={contactURL} type="primary" block>
        {text}
      </Button>
    );
  }

  function renderContact(): JSX.Element {
    return (
      <Alert
        type="info"
        banner={true}
        showIcon={false}
        style={{
          textAlign: "center",
          padding: "30px",
          marginTop: "30px",
          marginBottom: "30px",
          borderRadius: "10px",
        }}
        message={
          <>
            <Paragraph strong style={{ fontSize: "150%" }}>
              Ready to bring CoCalc to your organization?{" "}
              <A href={contactURL} external>
                Let's get in contact!
              </A>
            </Paragraph>
            <Paragraph>
              Every enterprise deployment is unique. We'll work with you to
              understand your specific requirements, from user scale and
              security needs to integration with existing systems.
            </Paragraph>
            <Paragraph>
              <Text strong>We offer flexible licensing options</Text>, including
              volume discounts for large organizations, academic discounts for
              educational institutions, multi-year agreements, and comprehensive
              support packages. Plus, we provide a{" "}
              <Text strong>free evaluation period</Text> to ensure CoCalc OnPrem
              meets your needs before you commit.
            </Paragraph>
            {renderContactButton()}
          </>
        }
      />
    );
  }

  function renderPriceInfo(): JSX.Element {
    if (PUBLISH_PRICE) {
      return (
        <>
          <Title level={3}>Purchasing CoCalc OnPrem</Title>
          <List
            grid={{ gutter: 30, column: 3, xs: 1, sm: 1 }}
            dataSource={data}
            renderItem={({
              price,
              individuals,
              icon,
              title,
              academic,
              prod,
            }) => {
              return (
                <PricingItem title={title} icon={icon}>
                  <Line amount={individuals} desc={"Monthly Active Users¹"} />
                  <Line amount={prod ?? 1} desc="Production Deployment" />
                  <Line amount={1} desc="Test Deployment" />
                  <Line
                    amount={INF}
                    desc={`Number of ${WORKSPACES_LABEL}`}
                  />
                  <Line
                    amount={INF}
                    desc={`${WORKSPACE_LABEL} Collaborators`}
                  />
                  <Line amount={INF} desc="Cluster Resources²" />
                  <Line amount={CM} desc="Help for Initial Setup" />
                  <Line amount={CM} desc="Premium Support" />
                  <Divider />
                  <Line
                    amount={CM}
                    desc="Collaborative Jupyter, LaTeX, SageMath, R, ..."
                  />
                  <Line amount={CM} desc="Custom Software Environments" />
                  <Line amount={CM} desc="Regular Software Upgrades" />
                  <Line amount={CM} desc="Flexible LLM integration³" />
                  <Line amount={CM} desc="GPU Support" />
                  <Line amount={CM} desc="SAML SSO" />

                  <br />
                  <div
                    style={{
                      textAlign: "center",
                    }}
                  >
                    {typeof price === "number"
                      ? renderContactButton(
                          <span
                            style={{
                              fontWeight: "bold",
                              fontSize: "18pt",
                              color: COLORS.GRAY_DD,
                              padding: "10px",
                            }}
                          >
                            {money(price, true)}
                            <span style={{ color: COLORS.GRAY }}>/year</span>
                          </span>,
                        )
                      : renderContactButton()}
                  </div>
                  {academic ? (
                    <>
                      <Divider />
                      <Line
                        amount={academic}
                        desc={<Text strong>Academic discount</Text>}
                      />
                    </>
                  ) : undefined}
                </PricingItem>
              );
            }}
          />
          {renderContact()}
          <Paragraph
            style={{
              marginTop: "100px",
              borderTop: `1px solid ${COLORS.GRAY_L}`,
              color: COLORS.GRAY,
            }}
          >
            ¹ "Monthly Active Users" is defined as the maximum count of distinct
            "Active Users" during any calendar month, who actually use CoCalc.
            <br />² There are no limitations on the number of CPU cores, Memory
            or Virtual Machines your instance of CoCalc OnPrem can make use of
            in your cluster.
            <br />³ Configure CoCalc OnPrem to use your own internal LLM server
            for increased privacy.
          </Paragraph>
        </>
      );
    } else {
      return <>{renderContact()}</>;
    }
  }

  function cloud(): JSX.Element {
    return (
      <>
        {/* <Title level={2}>
          CoCalc OnPrem <Icon name="network-wired" style={{ float: "right" }} />
        </Title> */}

        <Paragraph>
          <Text strong>
            <A href="https://onprem.cocalc.com/">CoCalc OnPrem</A>{" "}
          </Text>{" "}
          brings the power of collaborative scientific computing to your
          organization's infrastructure. Keep your data secure, maintain full
          control over your environment, and provide your teams with the same
          cutting-edge tools used by leading research institutions and
          enterprises worldwide.
        </Paragraph>

        {/* IMPORTANT: keep the NASA text snippet exactly as it is -- https://github.com/sagemathinc/cocalc/issues/8545  */}
        <Paragraph>
          Our software is used by NASA's Space Science and Mission Operations
          organization.
        </Paragraph>

        <Title level={3}>Why Choose CoCalc OnPrem?</Title>
        <Paragraph>Deploy CoCalc on your own systems and gain:</Paragraph>

        <ul>
          <li>
            <Text strong>Complete data sovereignty and security</Text> - Your
            research data never leaves your infrastructure, ensuring compliance
            with regulatory requirements and protecting sensitive intellectual
            property.
          </li>
          <li>
            <Text strong>Seamless IT integration</Text> - Works with your
            existing authentication systems (SAML SSO), network policies, and
            security frameworks.
          </li>
          <li>
            <Text strong>Customizable environments</Text> - Tailor software
            stacks and computing resources to match your specific research
            workflows and organizational needs.
          </li>
          <li>
            <Text strong>Expert deployment and support</Text> - Our team
            provides comprehensive guidance through setup, configuration, and
            ongoing management.
          </li>
          <li>
            <Text strong>Scalable performance</Text> - Handle growing teams and
            computational demands without compromising on collaboration or
            security.
          </li>
        </ul>

        <Paragraph>
          Experience the cutting-edge capabilities of CoCalc within your own
          secure ecosystem, providing your team or institution with a tailored,
          high-performance platform for scientific computing, mathematics, and
          data science collaboration.
        </Paragraph>

        <Title level={3}>Complete Research Environment</Title>
        <ul>
          <li>
            <Text strong>Accelerated Research</Text> - Reduce time-to-insight
            with collaborative tools that streamline scientific workflows
          </li>
          <li>
            <Text strong>Interactive Computing</Text> - Jupyter notebooks for
            Python, R, SageMath, and Octave
          </li>
          <li>
            <Text strong>Collaboration</Text> - Real-time editing of LaTeX,
            Markdown, and code files, as well as integrated chatrooms and task
            lists
          </li>
          <li>
            <Text strong>Linux Terminals</Text> - Use any CLI tool to maximize
            flexibility or conduct advanced computing tasks
          </li>
          <li>
            <Text strong>Custom Software</Text> - Flexible environments
            supporting your specific research needs
          </li>
        </ul>

        <Paragraph>
          All tools work seamlessly together, enabling your researchers to focus
          on discovery rather than technical setup.
        </Paragraph>

        <Title level={3}>Enterprise Benefits</Title>
        <ul>
          <li>
            <Text strong>Cost Efficiency</Text> - Reduce dependency on external
            SaaS/cloud services and unify several tools in one place
          </li>
          <li>
            <Text strong>Regulatory Compliance</Text> - Meet stringent data
            residency and security requirements
          </li>
        </ul>

        {renderPriceInfo()}

        <Title level={3}>Technical Requirements</Title>
        <Paragraph>
          CoCalc OnPrem requires a modern infrastructure setup. Our team will
          work with your IT department to ensure smooth deployment:
        </Paragraph>
        <Paragraph>
          <ul>
            <li>
              <Text strong>Kubernetes</Text> - A modern container management
              system for scalable deployment: starting at just a single VM up to
              dozens of heterogeneous nodes.
            </li>
            <li>
              <Text strong>Domain and SSL certificate</Text> - Secure access
              configuration for your users.
            </li>
            <li>
              <Text strong>Database infrastructure</Text> - PostgreSQL for
              application data storage.
            </li>
            <li>
              <Text strong>Shared storage system</Text> - Network file system
              for collaborative {WORKSPACE_LABEL.toLowerCase()} data.
            </li>
            <li>
              <Text strong>IT support resources</Text> - Your internal team or
              our experts to manage the deployment.
            </li>
          </ul>
        </Paragraph>

        <Paragraph>
          Read more about how to deploy mand manage CoCalc Onprem in its{" "}
          <A href="https://onprem.cocalc.com/">online documentation</A>.
        </Paragraph>
      </>
    );
  }

  return (
    <div
      style={{
        maxWidth: MAX_WIDTH,
        margin: "15px auto",
        padding: "15px",
        backgroundColor: "white",
      }}
    >
      <Title level={1} style={{ textAlign: "center" }}>
        <Icon name="server" style={{ marginRight: "30px" }} /> CoCalc
        On-Premises
      </Title>

      <div>{cloud()}</div>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
