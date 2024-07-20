/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { LOGIN_STYLE } from "components/auth/shared";

export default function Home({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={"Forgot your Password?"} />
      <Layout>
        <Header page="sign-in" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <div style={LOGIN_STYLE}>
            <Alert
              style={{ marginTop: "20px" }}
              message={<b>Success</b>}
              description={
                <div style={{ fontSize: "12pt" }}>
                  Password successfully set. You are now signed in using your
                  new password.
                </div>
              }
              type="success"
              showIcon
            />
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
