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
              questions, licensing details, and purchase.
            </>
          }
        />
        <h2>CoCalc Docker</h2>
        <Paragraph>
          <Text strong>
            <A
              href={"https://github.com/sagemathinc/cocalc-docker#what-is-this"}
            >
              CoCalc Docker
            </A>
          </Text>{" "}
          is a feature complete, but downsized version CoCalc. It can be used on
          your own laptop, desktop or server. It is suitable for{" "}
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
        to your needs.
        <Paragraph></Paragraph>
        <Paragraph>
          The setup is very easy: CoCalc Docker comes as a pre-packaged single
          Docker image. All services are included and ready to work out of the
          box.
        </Paragraph>
        <Paragraph>
          The The license is business-friendly and costs $999/year.
        </Paragraph>
        <h2>CoCalc Cloud</h2>
        <Paragraph>
          Manage CoCalc on your larger Kubernetes cluster (
          <A href={`mailto:${helpEmail}`}>contact us</A> for pricing).
        </Paragraph>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
