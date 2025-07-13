/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";
import { useRouter } from "next/router";

import SignIn from "components/auth/sign-in";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import basePath from "lib/base-path";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Home({ customize }) {
  const { siteName = "CoCalc" } = customize ?? {};
  const router = useRouter();
  return (
    <Customize value={customize}>
      <Head title={`Sign in to ${siteName}`} />
      <Layout>
        <Header page="sign-in" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SignIn onSuccess={() => router.push("/app?sign-in")} />
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
    return { props: { customize: {} } };
  }
  return customize;
}
