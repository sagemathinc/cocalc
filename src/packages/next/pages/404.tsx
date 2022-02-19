/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useState } from "react";
import { join } from "path";
import Head from "next/head";
import Footer from "components/landing/footer";
import LandingHeader from "components/landing/header";
import { Layout as AntdLayout } from "antd";
import basePath from "lib/base-path";
import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import apiPost from "lib/api/post";

const favicon = join(basePath, "webapp/favicon-32x32.png");

export default function Custom404() {
  const [siteName, setSiteName] = useState<string>("");
  useEffect(() => {
    (async () => {
      const customize = await apiPost("customize", { fields: ["siteName"] });
      setSiteName(customize.siteName);
    })();
  }, []);

  return (
    <>
      <Head>
        <title>{siteName ? `${siteName}  – ` : ""}404 Page Not Found</title>
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
              <a href={`${basePath}/`}>
                Back to {siteName ? `${siteName}'s ` : "the "} main page
              </a>
            </div>
          </div>
        </AntdLayout.Content>
        <Footer />
      </AntdLayout>
    </>
  );
}
