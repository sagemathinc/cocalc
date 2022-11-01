/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { Alert, Layout, Typography } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize, useCustomize } from "lib/customize";
import withCustomize from "lib/with-customize";

const { Paragraph, Text } = Typography;

export default function OnPrem({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="On Premises Offerings" />
      <Header page="pricing" subPage="onprem" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <Body />
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

function Body() {
  const { helpEmail } = useCustomize();

  function docker(): JSX.Element {
    return (
      <>
        <h2>
          CoCalc Docker <Icon name="docker" style={{ float: "right" }} />
        </h2>
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
          The license is business-friendly and costs $999/year.
        </Paragraph>
      </>
    );
  }

  function cloud(): JSX.Element {
    return (
      <>
        <h2>
          CoCalc Cloud <Icon name="network-wired" style={{ float: "right" }} />
        </h2>
        <Paragraph>
          This version of on-prem CoCalc runs on a full-fledged{" "}
          <A href={"https://kubernetes.io"}>Kubernetes Cluster</A>. The
          underlying services and their architecture are the same as the ones
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
              . It's possible to run inside a VPN as well.
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
                <Text strong>HELM</Text> charts
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
              Regarding storage, a network file-system like{" "}
              <Text strong>NFS</Text>, supporting{" "}
              <A
                href={
                  "https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes"
                }
              >
                ReadWriteMany
              </A>
              , will hold the data of all projects.
            </li>
          </ul>
        </Paragraph>
        <Paragraph>
          The license is business-friendly and please{" "}
          <A href={`mailto:${helpEmail}`}>contact us</A> for pricing.
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
      <div style={{ textAlign: "center", color: COLORS.GRAY_DD }}>
        <h1 style={{ fontSize: "28pt" }}>
          {" "}
          <Icon name="laptop" style={{ marginRight: "30px" }} /> CoCalc - On
          Premises Offerings
        </h1>
      </div>
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
              Contact us at <A href={`mailto:${helpEmail}`}>{helpEmail}</A> for
              questions, licensing details, and purchasing.
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
