/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import SiteName from "components/site-name";
import Head from "next/head";
import GoogleSearch from "components/google-search";
import Analytics from "components/analytics";

export function Layout({ children }) {
  return (
    <>
      <Head>
        <title>
          <SiteName />
        </title>
        <link rel="icon" href={`${process.env.basePath ?? ""}/favicon.ico`} />
        <Analytics />
      </Head>
      <main>
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

        <footer
          style={{
            borderTop: "1px solid lightgrey",
            background: "#efefef",
            marginTop: "30px",
            fontSize: "12pt",
            textAlign: "center",
            color: "#999",
          }}
        >
          <a href="https://cocalc.com">
            <SiteName />
          </a>{" "}
          by Sagemath, Inc. ·{" "}
          <a href="mailto:help@cocalc.com">help@cocalc.com</a>
        </footer>
      </main>
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
