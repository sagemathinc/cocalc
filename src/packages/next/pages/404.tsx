/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import Head from "next/head";
import Footer from "components/landing/footer";
import LandingHeader from "components/landing/header";
import { Layout as AntdLayout } from "antd";
import basePath from "lib/base-path";
import getCustomize from "@cocalc/server/settings/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";

const favicon = join(basePath, "webapp/favicon-32x32.png");

export default function Custom404({ customize }) {
  const { siteName } = customize;
  return (
    <>
      <Head>
        <title>{siteName} – 404 Page Not Found</title>
        <meta name="description" content="404 Page Not Found" />
        <meta name="robots" content="noindex,nofollow" />
        <link rel="icon" href={favicon} />
      </Head>
      <AntdLayout>
        <LandingHeader />
        <AntdLayout.Content style={{ background: "white" }}>
          <div
            style={{
              color: "#555",
              margin: "50px auto",
              minHeight: "50vh",
              maxWidth: "900px",
              fontSize: "150%",
            }}
          >
            <h1>
              404 – Page Not Found
              <span
                style={{
                  float: "right",
                  fontSize: "200%",
                  color: COLORS.ANTD_RED,
                }}
              >
                <Icon name="robot" />
              </span>
            </h1>

            <div>
              <a href={`${basePath}/`}>Back to {siteName}'s main page</a>
            </div>
          </div>
        </AntdLayout.Content>
        <Footer />
      </AntdLayout>
    </>
  );
}

export async function getStaticProps() {
  return { props: { customize: await getCustomize() } };
}
