/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";
import Link from "next/link";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Logo from "components/logo";
import SiteName from "components/share/site-name";
import { Customize } from "lib/share/customize";
import withCustomize from "lib/with-customize";

export default function Home({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={"Shared Public Files"} />
      <Layout>
        <Header />
        <div style={{ fontSize: "16pt", textAlign: "center", margin: "60px" }}>
          <Logo type="icon" style={{ width: "120px", height: "120px" }} />
          <br />
          <br />
          <br />
          Browse recent{" "}
          <Link href="/share/public_paths/page/1">
            <SiteName /> Shared Public Files...
          </Link>
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
