/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ReactNode } from "react";
import { join } from "path";
import { Layout as AntdLayout } from "antd";
import { SHARE_MAX_WIDTH } from "lib/config";
import Head from "next/head";
import Analytics from "components/analytics";
import Footer from "components/landing/footer";
import Header from "./header";
import basePath from "lib/base-path";
import useCustomize from "lib/use-customize";

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
        <title>{`${siteName} -- ${title}`}</title>
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
            }}
          >
            <div style={{ margin: "15px" }}>{children}</div>
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
