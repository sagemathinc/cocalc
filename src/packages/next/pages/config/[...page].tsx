/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";
import { join } from "path";
import ConfigLayout from "components/account/config/layout";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import basePath from "lib/base-path";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function Preferences({ customize, page }) {
  function noteAboutConfig() {
    return (
      <Paragraph
        type="secondary"
        style={{
          padding: "15px",
          margin: 0,
          textAlign: "center",
          borderTop: `1px solid lightgray`,
        }}
      >
        This is the account configuration page.{" "}
        <A href={join(basePath, "settings")} external>
          You can also adjust preferences in the main app...
        </A>
      </Paragraph>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Configuration" />
      <Layout>
        <Header page={"account"} />
        <div style={{ margin: "30px", fontSize: "15pt" }}>
          <A href="/settings/account">
            This page is deprecated. Visit the settings pages instead...
          </A>
        </div>
        <ConfigLayout page={page} />
        {noteAboutConfig()}
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { params, res } = context;
  const { page = [] } = params;

  const [_, sub] = page;
  if (sub == null) {
    return res.redirect(307, "./search/input");
  }

  return await withCustomize({ context, props: { page } });
}
