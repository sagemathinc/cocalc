import Head from "next/head";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import { CustomizeContext } from "lib/customize";
import getCustomize from "@cocalc/util-node/server-settings/customize";

// The favicon.ico should be this, but it doesn't work
// when there a base path.  This will cause a problem, e.g, for
// a server with a basePath that isn't running from cocalc.com.
// TODO: why?  Fix this.  No clue...
//const FAVICON = join(basePath, "webapp/favicon.ico");
const FAVICON = "/webapp/favicon.ico";

export default function Home({ customize }) {
  return (
    <CustomizeContext.Provider value={customize}>
      <Head>
        <title>{customize.siteName} -- Collaborative Calculation</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={FAVICON} />
      </Head>
      <Layout>
        <Header />
        <Content />
        <Footer />
      </Layout>
    </CustomizeContext.Provider>
  );
}

export async function getStaticProps() {
  try {
    const customize = await getCustomize();
    return { props: { customize }, revalidate: 15 };
  } catch (_err) {
    return { notFound: true };
  }
}
