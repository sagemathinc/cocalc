import { join } from "path";
import { Layout } from "antd";
import Head from "next/head";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/share/customize";

import basePath from "lib/base-path";

const FAVICON = "/webapp/favicon-32x32.png";

export default function Home({ customize }) {
  return (
    <Customize value={customize}>
      <Head>
        <title>{customize.siteName} -- Collaborative Calculation</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={join(basePath ?? "", FAVICON)} />
      </Head>
      <Layout>
        <Header />
        <Content />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
