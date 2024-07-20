/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";
import PasswordReset from "components/auth/password-reset";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Home({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={"Forgot your Password?"} />
      <Layout>
        <Header page="sign-in" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <PasswordReset />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
