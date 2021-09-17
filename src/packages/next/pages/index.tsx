import { Layout } from "antd";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import SquareLogo from "components/logo-square";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";

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
      <Head title="Collaborative Calculation" />
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
