/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show info and allow managing subscription with given id

import { Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { ManageSubscription } from "@cocalc/frontend/purchases/manage-subscription";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Preferences({ customize, id }) {
  return (
    <Customize value={customize}>
      <Head title={`Subscription Id=${id}`} />
      <Layout>
        <Header />
        <div>
          <ManageSubscription
            subscription_id={id}
            style={{ margin: "30px auto", maxWidth: "1100px" }}
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
