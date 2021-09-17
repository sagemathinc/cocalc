/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ReactNode } from "react";
import { join } from "path";
import { Layout as AntdLayout } from "antd";

import Head from "next/head";
import Analytics from "components/analytics";
import Footer from "./footer";
import Header from "./header";
import basePath from "lib/base-path";
import useCustomize from "lib/use-customize";

const favicon = join(basePath, "webapp/favicon-32x32.png");

interface Props {
  title: string;
  children: ReactNode;
}

export function Layout({ title, children }: Props) {
  const { siteName } = useCustomize();
  return (
    <>
      <Head>
        <title>
          {siteName} -- {title}
        </title>
        <meta name="description" content="CoCalc Share Server" />
        <link rel="icon" href={favicon} />
      </Head>
      <AntdLayout>
        <Header />
        <AntdLayout.Content style={{ background: "white" }}>
          <div
            style={{
              color: "#555",
              margin: "0 auto",
              maxWidth: "900px",
              fontSize: "11pt",
              padding: "15px",
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

export function Embed({ title, children }: Props) {
  const { siteName } = useCustomize();
  return (
    <>
      <Head>
        <title>
          {siteName} -- {title}
        </title>
        <link rel="icon" href={favicon} />
      </Head>
      <Analytics />
      <main>{children}</main>
    </>
  );
}
