/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Divider, Layout, List } from "antd";
import { ReactNode } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import getSupportUrl from "@cocalc/frontend/support/url";
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
              For inquiries about licensing, further details and purchasing
              options, please{" "}
              <A href={contactURL} external>
                contact us
              </A>
              .
            </Paragraph>
            <Paragraph>
              CoCalc OnPrem's pricing is tailored to your specific needs, taking
              into account your use case, anticipated number of active monthly
              users, desired level of support, and any customization or training
              requirements. We offer a <Text strong>free trial period</Text> to
              ensure seamless integration within your environment. Importantly,
              pricing is <Text strong>not</Text> based on the number of CPU
              cores, memory, or virtual machines in your cluster.
            </Paragraph>
            <Paragraph>
              <Text strong>We offer flexible licensing options</Text>, including
              discounts for academic institutions, multi-year agreements, and
              first-year customers. Let us help you find the best solution for
              your organization.
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
                  <Line amount={INF} desc="Number of Projects" />
                  <Line amount={INF} desc="Project Collaborators" />
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
      return renderContact();
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
          is a <Text strong>self-hosted version of CoCalc</Text> designed to run
          on your own infrastructure. Built on the same robust architecture that
          powers the main CoCalc platform, OnPrem delivers exceptional
          performance, scalability, and reliability. This enterprise-grade
          solution offers:
        </Paragraph>

        <ul>
          <li>
            The full suite of collaborative tools available on cocalc.com:{" "}
            <Text strong>
              Jupyter Notebooks for Python, SageMath, R, Octave
            </Text>
            , editing <Text strong>LaTeX, Code- and Markdown/Text-files</Text>,
            a <Text strong>collaborative Linux Terminal</Text>, and a{" "}
            <Text strong>virtual X11 desktop</Text>.
          </li>
          <li>
            Complete control over your data and computing environment, which
            results in enhanced <Text strong>privacy and security</Text> for
            sensitive research and educational content;
          </li>
          <li>
            Integration with your existing IT infrastructure – for example SAML
            based SSO authentication or using your own internal LLM server for
            increased privacy;
          </li>
          <li>
            Beyond the standard set of included software, it's possible to
            define <Text strong>customizable software environments</Text> and
            adjust specific features to meet specific institutional needs;
          </li>
          <li>
            We'll guide you through the setup process and give you enough
            information to be able to manage the service, react to issues, plan
            resource requirements, and know how to scale the various services to
            your expected usage.
          </li>
        </ul>

        <Paragraph>
          Experience the cutting-edge capabilities of CoCalc within your own
          secure ecosystem, providing your team or institution with a tailored,
          high-performance platform for scientific computing, mathematics, and
          data science collaboration.
        </Paragraph>

        <Title level={3}>Prerequisites</Title>
        <Paragraph>
          <ul>
            <li>
              A{" "}
              <Text strong>
                <A href={"https://kubernetes.io"}>Kubernetes Cluster</A>
              </Text>{" "}
              and some experience managing it. OnPrem should run on your own
              bare-metal cluster or a managed kubernetes cluster like{" "}
              <A href={"https://onprem.cocalc.com/deploy/eks.html"}>
                Amazon's EKS
              </A>
              ,{" "}
              <A href={"https://onprem.cocalc.com/deploy/gke.html"}>
                Google's GKE
              </A>
              , or{" "}
              <A href={"https://onprem.cocalc.com/deploy/aks.html"}>
                Azure's AKS
              </A>
              . Kubernetes is required to orchestrate and manage the
              containerized CoCalc OnPrem services.
            </li>
            <li>
              Some experience working with{" "}
              <A href={"https://helm.sh/"}>
                <b>HELM</b> charts
              </A>
              . Helm is used to simplify the deployment and management of CoCalc
              OnPrem on Kubernetes.
            </li>
            <li>
              A (sub)<Text strong>domain</Text> and TLS certificate (e.g.{" "}
              <A href={"https://letsencrypt.org/"}>letsencrypt</A>). A domain
              and TLS certificate are needed to securely access your CoCalc
              OnPrem instance over HTTPS. You can also run OnPrem inside a VPN,
              isolated from the public internet.
            </li>
            <li>
              A common{" "}
              <Text strong>
                <A href={"https://www.postgresql.org/"}>PostgreSQL</A>
              </Text>{" "}
              database and{" "}
              <Text strong>
                <A href={"https://nats.io/"}>NATS.io</A>
              </Text>{" "}
              communication service. PostgreSQL is used for persistent data
              storage, and NATS for internal communication between CoCalc
              services.
            </li>
            <li>
              A shared network file-system like <Text strong>NFS</Text>. It must
              support the Kubernetes{" "}
              <A
                href={
                  "https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes"
                }
              >
                ReadWriteMany
              </A>{" "}
              file-system access mode. A shared network file system is required
              for persistent storage of project data and collaborative files.
            </li>
          </ul>
        </Paragraph>

        <Paragraph>
          For more details, see the{" "}
          <Text strong>
            <A href="https://onprem.cocalc.com/">CoCalc OnPrem documentation</A>
          </Text>
          .
        </Paragraph>
        <Title level={3}>Purchasing CoCalc OnPrem</Title>
        {renderPriceInfo()}
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
