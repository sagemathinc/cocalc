/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Products({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`${siteName} – Dedicated Virtual Machines`} />
      <Layout>
        <Header page="pricing" subPage="dedicated" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <Title level={1} style={{ textAlign: "center" }}>
              <Icon name="server" style={{ marginRight: "30px" }} /> Dedicated
              Virtual Machines
            </Title>
            <Paragraph>Dedicated VM's are now deprecated.</Paragraph>
            <Paragraph>
              <b>
                NEW MUCH MORE FLEXIBLE ALTERNATIVE TO DEDICATED VM's:{" "}
                <A href="https://doc.cocalc.com/compute_server.html">
                  Create a Compute Server Instead...
                </A>
              </b>
            </Paragraph>
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
