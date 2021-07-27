/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout as AntdLayout } from "antd";

import Link from "next/link";
import Head from "next/head";

import SiteName from "components/site-name";
import GoogleSearch from "components/google-search";
import Analytics from "components/analytics";
import Footer from "components/footer";
import Header from "components/header";

/*
// The favicon.ico should be this, but it doesn't work
// when there a base path.  This will cause a problem, e.g, for
// a server with a basePath that isn't running from cocalc.com.
// TODO: why?  Fix this.  No clue...
//const FAVICON = join(basePath, "webapp/favicon.ico");
const FAVICON = "/webapp/favicon.ico";
      <Head>
        <title>{siteName} -- Shared Files</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={FAVICON} />
      </Head>

*/

export function Layout({ children }) {
  return (
    <>
      <Head>
        <title>
          <SiteName />
        </title>
        <meta name="description" content="CoCalc Share Server" />
        <link rel="icon" href={`${process.env.basePath ?? ""}/favicon.ico`} />
        <Analytics />
      </Head>
      <AntdLayout>
        <Header />
        <AntdLayout.Content>
          {children}

          <div
            style={{
              background: "#efefef",
              padding: "0 30px",
              marginBottom: "30px",
              borderBottom: "1px solid lightgrey",
              display: "flex",
            }}
          >
            <Link href="/home">
              <a style={{ margin: "auto 0" }}>
                <SiteName />{" "}
              </a>
            </Link>
            <div style={{ flex: "1" }}></div>
            <div style={{ maxWidth: "40ex" }}>
              <GoogleSearch />
            </div>
          </div>

          <div
            style={{
              color: "#555",
              margin: "0 auto",
              maxWidth: "1200px",
              fontSize: "11pt",
              padding: "0 15px",
            }}
          >
            {children}
          </div>
        </AntdLayout.Content>
        <Footer />
      </AntdLayout>
    </>
  );
}

export function Embed({ children }) {
  return (
    <>
      <Head>
        <title>
          <SiteName />
        </title>
        <link rel="icon" href={`${process.env.basePath ?? ""}/favicon.ico`} />
        <Analytics />
      </Head>
      <main>{children}</main>
    </>
  );
}
