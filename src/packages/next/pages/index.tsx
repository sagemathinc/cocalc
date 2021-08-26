import { join } from "path";
import { Layout } from "antd";
import Head from "next/head";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import { CustomizeContext, Customize } from "lib/customize";
import withCustomize from "lib/get-context";
import { basePath } from "lib/base-path";

const FAVICON = "/webapp/favicon-32x32.png";

export default function Home({ customize }: { customize: Customize }) {
  return (
    <CustomizeContext.Provider value={customize}>
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
    </CustomizeContext.Provider>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
