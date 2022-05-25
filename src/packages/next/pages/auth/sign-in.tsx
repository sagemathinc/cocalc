/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getStrategies from "@cocalc/server/auth/sso/get-strategies";
import { Layout } from "antd";
import SignIn from "components/auth/sign-in";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import basePath from "lib/base-path";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useRouter } from "next/router";

export default function Home({ customize, strategies }) {
  const { siteName } = customize;
  const router = useRouter();
  return (
    <Customize value={customize}>
      <Head title={`Sign in to ${siteName}`} />
      <Layout>
        <Header page="sign-in" subPage="sign-in" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SignIn strategies={strategies} onSuccess={() => router.push("/")} />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const customize = await withCustomize({ context });
  if (customize.props.customize.account != null) {
    // user is already signed in -- redirect them to top level page.
    const { res } = context;
    res.writeHead(302, { location: basePath });
    res.end();
    return { props: {} };
  }
  customize.props.strategies = await getStrategies();
  return customize;
}
