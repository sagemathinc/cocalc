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

const DOCKER_PRICE = "$999";
const K8S_PRICE = "$5000";
const K8S_PRICE_ACADEMIC = "$3000";

export default function OnPrem({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`${siteName} – On Premises Offerings`} />
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

  function docker(): JSX.Element {
    const body = encodeURIComponent(
      "I'm interested in puchasing CoCalc Docker on-premises."
    );

    return (
      <>
        <Title level={2}>
          CoCalc Docker <Icon name="docker" style={{ float: "right" }} />
        </Title>
        <Paragraph>
          <Text strong>
            <A
              href={"https://github.com/sagemathinc/cocalc-docker#what-is-this"}
            >
              CoCalc Docker
            </A>
          </Text>{" "}
          is a downsized but feature complete version of CoCalc. It can be used
          on your own laptop, desktop or server. It is suitable for{" "}
          <Text strong>personal use</Text> or a small{" "}
          <Text strong>working group</Text>, e.g. a few researchers in an office
          or lab.
        </Paragraph>
        <Text strong>Features</Text>: it includes support for Jupyter Notebooks,
        a recent version of Sage, Python 3, R, Julia, Octave and LaTeX. Also,
        X11 support, editing and compiling code and much more is included as
        well. If something is missing, you could{" "}
        <A
          href={
            "https://github.com/sagemathinc/cocalc-docker#adding-custom-software-to-your-cocalc-instance"
          }
        >
          extend the base image
        </A>{" "}
        to fit your needs.
        <Paragraph></Paragraph>
        <Paragraph>
          The <Text strong>setup</Text> is very easy: CoCalc Docker comes as a
          pre-packaged single <A href={"https://www.docker.com/"}>Docker</A>{" "}
          image. All services are included and ready to work out of the box.
        </Paragraph>
        <Paragraph>
          The license is business-friendly and costs {DOCKER_PRICE}/year.
        </Paragraph>
        <Paragraph style={{ textAlign: "center" }}>
          <Button
            type="primary"
            size="large"
            onClick={() =>
              router.push(
                `/support/new?hideExtra=true&type=purchase&subject=CoCalc%20Docker&body=${body}&title=Purchase%20CoCalc-Docker`
              )
            }
          >
            Purchase CoCalc Docker at {DOCKER_PRICE}/year
          </Button>
        </Paragraph>
      </>
    );
  }

  function cloud(): JSX.Element {
    const body = encodeURIComponent(
      "I'm interested in puchasing CoCalc Cloud on-premises."
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
          overall performance, scalability and reliability as the main SaaS
          site.
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
              <A href={"https://aws.amazon.com/eks/"}>Amazon's AWS EKS</A> or{" "}
              <A href={"https://cloud.google.com/kubernetes-engine"}>
                Google's GCE GKE
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
          <A href="https://doc-cloud.cocalc.com/">cocalc cloud documentation</A>
          .
        </Paragraph>
        <Title level={3}>Purchasing CoCalc Cloud</Title>
        <Paragraph>
          In contrast to the Docker variant, CoCalc Cloud is a scalable
          solution. Therefore, the price is proportional to the expected number
          of users. Additionally, various levels of support can be negotiated
          for an additional cost. Please contact us for a quote.
        </Paragraph>
        <Paragraph>
          The price starts at{" "}
          <Button
            type="primary"
            size="large"
            onClick={() =>
              router.push(
                `/support/new?hideExtra=true&type=purchase&subject=CoCalc%20Cloud%20Business&body=${body}&title=Purchase%20CoCalc-Cloud`
              )
            }
          >
            {K8S_PRICE}/year
          </Button>{" "}
          or if an academic discount applies, starting at{" "}
          <Button
            type="primary"
            size="large"
            onClick={() =>
              router.push(
                `/support/new?hideExtra=true&type=purchase&subject=CoCalc%20Cloud%20Academic&body=${body}&title=Purchase%20CoCalc-Cloud`
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
        Premises Offerings
      </Title>

      <Paragraph>
        CoCalc's on-premises offerings allow you to run CoCalc on your own
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
        {docker()}
        <hr style={{ margin: "30px 0" }} />
        {cloud()}
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
