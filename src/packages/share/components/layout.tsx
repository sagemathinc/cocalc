/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import SiteName from "components/site-name";
import Head from "next/head";
import GoogleSearch from "components/google-search";
import Analytics from "components/analytics";
import { Layout as AntdLayout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";

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
      <AntdLayout>
        <Header />
        <AntdLayout.Content>
          {children}
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
