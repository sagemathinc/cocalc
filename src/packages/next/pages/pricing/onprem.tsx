/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Layout, List } from "antd";
import { useRouter } from "next/router";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
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

const PUBLISH_PRICE = true;

interface Item {
  title: string;
  icon: IconName;
  individuals: string;
  price: number | null;
  academic?: boolean;
}

const data: Item[] = [
  {
    title: "Small Business",
    icon: "experiment",
    individuals: "up to 25",
    price: 5000,
  },
  {
    title: "Academic Research",
    icon: "graduation-cap",
    individuals: "up to 25",
    price: 3000,
    academic: true,
  },
  {
    title: "Large institution",
    icon: "project-outlined",
    individuals: "more than 25",
    price: null,
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
  const router = useRouter();

  const body = encodeURIComponent(
    "PLEASE EXPLAIN YOUR EXPECTED USE CASE TO HELP US GUIDE YOU:\n\nWE WOULD LOVE TO SETUP A VIDEO CALL WITH YOU! WHEN ARE YOU AVAILABLE?",
  );

  const contactURL = `/support/new?hideExtra=true&type=purchase&subject=CoCalc%20On-prem&body=${body}&title=Purchase%20CoCalc%20On-prem`;

  function renderContact(): JSX.Element {
    return (
      <Alert
        type="info"
        banner={true}
        showIcon={false}
        style={{
          textAlign: "center",
          fontSize: "125%",
          marginTop: "30px",
          marginBottom: "30px",
        }}
        message={
          <>
            Please <A href={contactURL}>contact us</A> for questions, licensing
            details, and purchasing.
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
            renderItem={({ price, individuals, icon, title, academic }) => {
              return (
                <PricingItem title={title} icon={icon}>
                  <Line amount={individuals} desc={"Users"} />
                  {academic ? (
                    <Line amount={1} desc="Academic discount" />
                  ) : undefined}
                  <br />
                  <br />
                  <div>
                    <span
                      style={{
                        fontWeight: "bold",
                        fontSize: "18pt",
                        color: COLORS.GRAY_DD,
                      }}
                    >
                      {typeof price === "number" ? (
                        <>
                          {money(price, true)}
                          <span style={{ color: COLORS.GRAY_L }}>/year</span>
                        </>
                      ) : (
                        <Button onClick={() => router.push(contactURL)}>
                          Contact us
                        </Button>
                      )}
                    </span>
                  </div>
                </PricingItem>
              );
            }}
          />
          <Paragraph>
            Discounts for: academic institutions, multi-year committments,
            first-year discounts, ...
          </Paragraph>
          {renderContact()}
        </>
      );
    } else {
      return (
        <>
          <Paragraph>
            CoCalc OnPrem is a scalable solution and the license price depends
            on the use case, expected number of users, level of support, and
            amount of customization and training involved.
          </Paragraph>
          {renderContact()}
        </>
      );
    }
  }

  function cloud(): JSX.Element {
    return (
      <>
        <Title level={2}>
          CoCalc OnPrem <Icon name="network-wired" style={{ float: "right" }} />
        </Title>

        <Paragraph>
          <Text strong>
            <A href="https://onprem.cocalc.com/">CoCalc OnPrem</A>{" "}
          </Text>{" "}
          is a <Text strong>self-hosted version of CoCalc</Text> designed to run
          on your own infrastructure. Built on the same robust architecture that
          powers the main CoCalc platform, OnPrem delivers exceptional
          performance, scalability, and reliability. This enterprise-grade
          solution offers:
          <ul>
            <li>Complete control over your data and computing environment;</li>
            <li>
              Enhanced privacy and security for sensitive research and
              educational content;
            </li>
            <li>
              Seamless integration with your existing IT infrastructure – for
              example SAML based SSO authentication;
            </li>
            <li>Customizable features to meet specific institutional needs;</li>
            <li>
              The full suite of collaborative tools available on cocalc.com:{" "}
              <Text strong>
                Jupyter Notebooks, Python, SageMath, R, Octave and LaTeX
              </Text>
              . Editing code- and text-files, Linux terminal, compiling code,
              and a virtual X11 desktop are included as well. Beyond the
              standard set of included software, it's also possible to define{" "}
              <Text strong>customized software environments</Text>.
            </li>
            <li>
              We'll guide you through the setup process and give you enough
              information to be able to manage the service, react to issues,
              plan resource requirements, and know how to scale the various
              services to your expected usage.
            </li>
          </ul>
          Experience the cutting-edge capabilities of CoCalc within your own
          secure ecosystem, providing your team or institution with a tailored,
          high-performance platform for scientific computing, mathematics, and
          data science collaboration.
        </Paragraph>

        <Paragraph>
          <Text strong>Prerequisites</Text>
          <ul>
            <li>
              A{" "}
              <Text strong>
                <A href={"https://kubernetes.io"}>Kubernetes Cluster</A>
              </Text>{" "}
              and some experience managing it. OnPrem should run on your own
              bare-metal cluster or a managed kubernetes clusters like{" "}
              <A href={"https://aws.amazon.com/eks/"}>Amazon's EKS</A> or{" "}
              <A href={"https://cloud.google.com/kubernetes-engine"}>
                Google's GKE
              </A>
              .
            </li>
            <li>
              Some experience working with{" "}
              <A href={"https://helm.sh/"}>
                <b>HELM</b> charts
              </A>
              .
            </li>
            <li>
              A (sub)<Text strong>domain</Text> and TLS certificate (e.g.{" "}
              <A href={"https://letsencrypt.org/"}>letsencrypt</A>).
            </li>
            <li>
              A common{" "}
              <A href={"https://www.postgresql.org/"}>
                <Text strong>PostgreSQL</Text>
              </A>{" "}
              database.
            </li>
            <li>
              Regarding storage, a shared network file-system like{" "}
              <Text strong>NFS</Text> will hold the data of all projects. The
              only pre-requisite is it needs to support the Kubernetes{" "}
              <A
                href={
                  "https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes"
                }
              >
                ReadWriteMany
              </A>{" "}
              file-system access mode.
            </li>
          </ul>
        </Paragraph>
        <Paragraph>
          For more details, see the{" "}
          <A href="https://onprem.cocalc.com/">CoCalc OnPrem documentation</A>.
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
        <Icon name="server" style={{ marginRight: "30px" }} /> CoCalc - On
        Premises
      </Title>

      <div>{cloud()}</div>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
