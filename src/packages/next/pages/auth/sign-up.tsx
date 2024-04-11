/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { join } from "path";

import getRequiresToken from "@cocalc/server/auth/tokens/get-requires-token";
import { gtag_id, sign_up_id } from "@cocalc/util/theme";
import SignUp from "components/auth/sign-up";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import apiPost from "lib/api/post";
import basePath from "lib/base-path";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function SignUpPage({ customize, requiresToken, requireTags }) {
  const { siteName, isCommercial } = customize;
  const router = useRouter();

  function openRoot() {
    router.push("/");
  }

  async function onSuccess({ firstFile }) {
    if (isCommercial) {
      try {
        (window as any).gtag?.("event", "conversion", {
          send_to: `${gtag_id}/${sign_up_id}`,
          event_callback: openRoot,
        });
      } catch (err) {
        console.warn("error sending gtag event", err);
      }
    }
    try {
      // If you have at least one project, open the newest one.
      const { project_id } = await apiPost("/projects/get-one");
      if (project_id) {
        let url = join(basePath, `/projects/${project_id}`);
        if (firstFile) {
          url = join(url, "files", firstFile);
        }
        window.location.href = url;
      }
      return;
    } catch (_err) {
      // no problem -- many situation where wouldn't have a project
    }
    openRoot();
  }

  return (
    <Customize value={customize}>
      <Head title={`Sign up for ${siteName}`} />
      <Layout>
        <Header page="sign-up" />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <SignUp
            requiresToken={requiresToken}
            onSuccess={onSuccess}
            requireTags={requireTags}
          />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const customize = await withCustomize({ context });
  if (customize.props.customize.account != null) {
    // user is already signed in -- redirect them to top level page for now (todo).
    const { res } = context;
    res.writeHead(302, { location: basePath });
    res.end();
    return { props: { customize: {} } };
  }
  customize.props.requiresToken = await getRequiresToken();
  // this field only has an effect, if we're on the cocalc.com site.
  customize.props.requireTags =
    process.env.COCALC_SIGNUP_REQUIRE_TAGS !== "false";
  return customize;
}
