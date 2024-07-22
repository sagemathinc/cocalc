/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Statistics from "components/statistics";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import getStats from "lib/landing/stats";
import withCustomize from "lib/with-customize";
import { Paragraph, Title } from "components/misc";

export default function Stats({ customize, stats }) {
  const { siteName } = customize;

  return (
    <Customize value={customize}>
      <Head title="System Activity Monitor" />
      <Layout>
        <Header page="info" subPage="status" />
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
            <div style={{ textAlign: "center" }}>
              <Title level={1}>
                <Icon name="dashboard" style={{ marginRight: "30px" }} />
                {siteName} - System Activity Monitor
              </Title>
              <Paragraph>See how much {siteName} is being used right now.</Paragraph>
            </div>
            {stats != null ? <Statistics stats={stats} /> : "(not available)"}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const stats = await getStats();
  return await withCustomize({ context, props: { stats } });
}
