/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getStrategies from "@cocalc/server/auth/sso/get-strategies";
import getRequiresToken from "@cocalc/server/auth/tokens/get-requires-token";
import { Layout } from "antd";
import SignUp from "components/auth/sign-up";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import basePath from "lib/base-path";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useRouter } from "next/router";

export default function SignUpPage({ customize, strategies, requiresToken }) {
  const { siteName } = customize;
  const router = useRouter();
  return (
    <Customize value={customize}>
      <Head title={`Sign up for ${siteName}`} />
      <Layout>
        <Header page="sign-up" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SignUp
            strategies={strategies}
            requiresToken={requiresToken}
            onSuccess={() => router.push("/")}
          />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const customize = await withCustomize({ context });
  if (customize.props.customize.account != null) {
    // user is already signed in -- redirect them to top level page for now (todo).
    const { res } = context;
    res.writeHead(302, { location: basePath });
    res.end();
    return { props: {} };
  }
  customize.props.strategies = await getStrategies();
  customize.props.requiresToken = await getRequiresToken();
  return customize;
}
