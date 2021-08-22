import { join } from "path";
import { Layout } from "antd";
import Head from "next/head";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import { CustomizeContext } from "lib/customize";
import withCustomize from "lib/get-context";

const FAVICON = "/webapp/favicon-32x32.png";

export default function Home({ customize }) {
  return (
    <CustomizeContext.Provider value={customize}>
      <Head>
        <title>{customize.siteName} -- Collaborative Calculation</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={join(customize.basePath ?? "", FAVICON)} />
      </Head>
      <Layout>
        <Header />
        <Content />
        <Footer />
      </Layout>
    </CustomizeContext.Provider>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
