/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show info and allow managing subscription with given id

import { Layout, Space } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { ManageSubscription } from "@cocalc/frontend/purchases/manage-subscription";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import basePath from "lib/base-path";
import { join } from "path";

export default function Preferences({ customize, id }) {
  return (
    <Customize value={customize}>
      <Head title={`Subscription Id=${id}`} />
      <Layout>
        <Header />
        <div style={{ background: "#fff" }}>
          <div style={{ float: "right", margin: "30px" }}>
            <Space>
              <a href={join(basePath, "settings/subscriptions")}>
                Subscriptions
              </a>
              <a href={join(basePath, "settings/licenses")}>Licenses</a>
              <a href={join(basePath, "settings/purchases")}>Purchases</a>
            </Space>
          </div>
          <h3 style={{ marginTop: "30px", textAlign: "center" }}>
            Subscription Id={id}
          </h3>
          <ManageSubscription
            subscription_id={id}
            style={{ margin: "0 auto", padding: "30px", maxWidth: "1100px" }}
          />
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  let { id } = context.params;

  return await withCustomize({ context, props: { id } });
}
