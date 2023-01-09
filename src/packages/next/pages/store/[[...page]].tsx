/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Store from "components/store";
import { StorePages } from "components/store/types";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { capitalize } from "@cocalc/util/misc";
import Error from "next/error";

export default function Preferences({ customize, page, pageNotFound }) {
  const subpage = page[0] != null ? ` - ${capitalize(page[0])}` : "";

  return (
    <Customize value={customize}>
      <Head title={`Store${subpage}`} />
      <Layout>
        <Header page={"store"} />
        {pageNotFound ? <Error statusCode={404} /> : <Store page={page} />}
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  let { page } = context.params;
  if (page == null) {
    page = [];
  }
  if (page.length > 0 && !StorePages.includes(page[0])) {
    return await withCustomize({
      context,
      props: { pageNotFound: true, page },
    });
  }

  return await withCustomize({ context, props: { page } });
}
