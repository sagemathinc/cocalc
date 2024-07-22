/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import Header from "components/landing/header";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import Redirect from "components/misc/redirect";

// just redirect
export default function Preferences({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Configuration" />
      <Layout>
        <Header />
        <Redirect target={"/config/search/input"} />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
