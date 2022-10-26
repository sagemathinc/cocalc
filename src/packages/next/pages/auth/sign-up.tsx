/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getRequiresToken from "@cocalc/server/auth/tokens/get-requires-token";
import { gtag_id, sign_up_id } from "@cocalc/util/theme";
import { Layout } from "antd";
import SignUp from "components/auth/sign-up";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import basePath from "lib/base-path";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useRouter } from "next/router";

export default function SignUpPage({ customize, requiresToken }) {
  const { siteName, isCommercial } = customize;
  const router = useRouter();

  function openRoot() {
    router.push("/");
  }

  function onSuccess() {
    if (isCommercial) {
      setTimeout(openRoot, 2000); // make sure to open root after 2 secs, even if there is an error
      try {
        (window as any).gtag?.("event", "conversion", {
          send_to: `${gtag_id}/${sign_up_id}`,
          event_callback: openRoot,
        });
      } catch (err) {
        console.warn("error sending gtag event", err);
      }
    } else {
      openRoot();
    }
  }

  return (
    <Customize value={customize}>
      <Head title={`Sign up for ${siteName}`} />
      <Layout>
        <Header page="sign-up" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SignUp requiresToken={requiresToken} onSuccess={onSuccess} />
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
  customize.props.requiresToken = await getRequiresToken();
  return customize;
}
