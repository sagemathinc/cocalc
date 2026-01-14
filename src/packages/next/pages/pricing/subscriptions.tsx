/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph } from "components/misc";
import Memberships from "components/store/memberships";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import type { JSX } from "react";

export default function Subscriptions({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={`${siteName} – Pricing – Memberships`} />
      <Layout>
        <Header page="pricing" subPage="subscriptions" />
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

function Body(): JSX.Element {
  return (
    <div style={{ maxWidth: MAX_WIDTH, margin: "auto", padding: "20px 0" }}>
      <Paragraph>
        Memberships replace legacy project licenses. Pick a plan below to cover
        workspace resources and included entitlements.
      </Paragraph>
      <Memberships />
    </div>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
