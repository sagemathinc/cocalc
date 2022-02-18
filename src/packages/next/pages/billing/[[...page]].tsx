/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import Error from "next/error";
import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Billing from "components/billing/layout";
import { MainPages } from "components/billing/consts";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Preferences({ customize, pageNotFound, page }) {
  if (pageNotFound) {
    return <Error statusCode={404} />;
  }
  return (
    <Customize value={customize}>
      <Head title="Billing" />
      <Layout>
        <Header />
        <Billing page={page} />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { params, res } = context;
  const { page = [] } = params;

  // deprecated – https://github.com/sagemathinc/cocalc/issues/5739
  // see billing/layout.tsx for possible pages
  const [main] = page;
  switch (main) {
    // 307: temp redirect
    case "payment-methods":
      return res.redirect(307, "./cards");
    case "invoices-and-receipts":
      return res.redirect(307, "./receipts");
  }

  if (main != null && !MainPages.includes(main)) {
    return withCustomize({ context, props: { pageNotFound: true } });
  }

  return await withCustomize({ context, props: { page } });
}
