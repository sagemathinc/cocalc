import { join } from "path";
import { Layout } from "antd";
import Head from "next/head";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import SquareLogo from "components/logo-square";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import basePath from "lib/base-path";

const FAVICON = "/webapp/favicon-32x32.png";

export default function Home({ customize }) {
  const {
    siteName,
    siteDescription,
    organizationName,
    organizationURL,
    splashImage,
  } = customize;
  return (
    <Customize value={customize}>
      <Head>
        <title>{siteName} -- Collaborative Calculation</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={join(basePath ?? "", FAVICON)} />
      </Head>
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "#c7d9f5" }}>
          <Content
            logo={<SquareLogo style={{ width: "120px" }} />}
            title={siteName}
            subtitle={siteDescription}
            description={
              <div>
                An instance of <A href="https://cocalc.com">CoCalc</A>{" "}
                {organizationName && organizationURL && (
                  <>
                    hosted by <A href={organizationURL}>{organizationName}</A>
                  </>
                )}
              </div>
            }
            image={splashImage}
          />
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
