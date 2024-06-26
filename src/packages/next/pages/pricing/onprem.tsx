/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useRouter } from "next/router";

const K8S_PRICE = "$5000";
const K8S_PRICE_ACADEMIC = "$3000";

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

  function cloud(): JSX.Element {
    const body = encodeURIComponent(
      "PLEASE EXPLAIN YOUR EXPECTED USE CASE TO HELP US GUIDE YOU:\n\nWE WOULD LOVE TO SETUP A VIDEO CALL WITH YOU! WHEN ARE YOU AVAILABLE?",
    );

    return (
      <>
        <Title level={2}>
          CoCalc Cloud <Icon name="network-wired" style={{ float: "right" }} />
        </Title>
        <Paragraph>
          <Text strong>
            <A href="https://doc-cloud.cocalc.com/">CoCalc Cloud</A>
          </Text>{" "}
          is an on-prem version of CoCalc that runs on a full-fledged{" "}
          <A href={"https://kubernetes.io"}>Kubernetes Cluster</A>. The
          underlying services and their architecture are the same, as the ones
          that power the main service at cocalc.com. This means you get the same
          overall performance, scalability and reliability as the{" "}
          <A href="https://cocalc.com">main cocalc.com website</A>.
        </Paragraph>
        <Paragraph>
          <Text strong>Features</Text>
          <ul>
            <li>
              Jupyter Notebooks, a recent version of Sage, Python 3, R, Octave
              and LaTeX. Editing code and text-files, Linux terminal, compiling
              code, and virtual X11 desktop are included as well. Beyond the
              standard set of included software, it's also possible to define
              and build customized software environments.
            </li>
            <li>
              Support for <Text strong>single sign-on</Text>, in particular,
              includes SAML.
            </li>
            <li>
              The networking is defined by standard{" "}
              <A href={"https://kubernetes.github.io/ingress-nginx/"}>
                NGINX ingress rules
              </A>
              . It's possible to run within a VPN as well.
            </li>
            <li>
              You can <Text strong>deploy</Text> this solution on your own
              bare-metal cluster or managed kubernetes clusters like{" "}
              <A href={"https://aws.amazon.com/eks/"}>Amazon's EKS</A> or{" "}
              <A href={"https://cloud.google.com/kubernetes-engine"}>
                Google's GKE
              </A>
              . Other options should work as well.
            </li>
          </ul>
        </Paragraph>
        <Paragraph>
          <Text strong>Prerequisites</Text>
          <ul>
            <li>
              A <Text strong>Kubernetes cluster</Text> and some experience
              managing it. We'll guide you through the setup and give you enough
              information to be able to manage the service, react to issues,
              plan resource requirements, and know how to scale the various
              services to your expected usage.
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
              A standard{" "}
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
          <A href="https://doc-cloud.cocalc.com/">CoCalc Cloud documentation</A>
          .
        </Paragraph>
        <Title level={3}>Purchasing CoCalc Cloud</Title>
        <Paragraph>
          CoCalc Cloud is a scalable solution and the license price depends on
          the use case and expected number of users. Additionally, various
          levels of support and custom development can be negotiated for an
          additional cost.
          <Button
            type="link"
            onClick={() =>
              router.push(
                `/support/new?hideExtra=true&type=purchase&subject=CoCalc%20Cloud%20Quote&body=${body}&title=Purchase%20CoCalc-Cloud`,
              )
            }
          >
            Contact us for a quote.
          </Button>
        </Paragraph>
        <Paragraph>
          The price starts at{" "}
          <Button
            type="primary"
            size="large"
            onClick={() =>
              router.push(
                `/support/new?hideExtra=true&type=purchase&subject=CoCalc%20Cloud%20Business&body=${body}&title=Purchase%20CoCalc-Cloud`,
              )
            }
          >
            {K8S_PRICE}/year
          </Button>{" "}
          or, if an academic discount applies, starting at{" "}
          <Button
            type="primary"
            size="large"
            onClick={() =>
              router.push(
                `/support/new?hideExtra=true&type=purchase&subject=CoCalc%20Cloud%20Academic&body=${body}&title=Purchase%20CoCalc-Cloud`,
              )
            }
          >
            {K8S_PRICE_ACADEMIC}/year
          </Button>
          .
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
        <Icon name="server" style={{ marginRight: "30px" }} /> CoCalc - On
        Premises
      </Title>

      <Paragraph>
        CoCalc's on-premises offering allow you to run CoCalc on your own
        machine or cluster in order to keep your data on-site and use compute
        resources that you already have.
      </Paragraph>
      <div>
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
              Please{" "}
              <A
                href={`/support/new?hideExtra=true&type=purchase&subject=CoCalc%20On-prem&body=&title=Purchase%20CoCalc%20On-prem`}
              >
                contact us
              </A>{" "}
              for questions, licensing details, and purchasing.
            </>
          }
        />
        {cloud()}
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
