/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout as AntdLayout } from "antd";
import Head from "next/head";
import { join } from "path";
import { ReactNode } from "react";

import Analytics from "components/analytics";
import Footer from "components/landing/footer";
import basePath from "lib/base-path";
import { SHARE_MAX_WIDTH } from "lib/config";
import useCustomize from "lib/use-customize";
import Header from "./header";

const favicon = join(basePath, "webapp/favicon-32x32.png");

interface Props {
  title: string;
  top?: ReactNode;
  children: ReactNode;
}

export function Layout({ title, children, top }: Props) {
  const { siteName, noindex } = useCustomize();
  return (
    <>
      <Head>
        <title>{`${siteName} – ${title}`}</title>
        <meta name="description" content="CoCalc Share Server" />
        {noindex && <meta name="robots" content="noindex,nofollow" />}
        <link rel="icon" href={favicon} />
      </Head>
      <AntdLayout>
        <Header />
        <AntdLayout.Content style={{ background: "white" }}>
          {top}
          <div
            style={{
              color: "#555",
              margin: "0 auto",
              maxWidth: SHARE_MAX_WIDTH,
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
        <title>{`${siteName} -- ${title}`}</title>
        <link rel="icon" href={favicon} />
      </Head>
      <Analytics />
      <main>{children}</main>
    </>
  );
}
