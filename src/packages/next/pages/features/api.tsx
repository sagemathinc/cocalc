import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Head from "components/landing/head";
import Info from "components/landing/info";
import A from "components/misc/A";

import screenshot from "public/features/api-screenshot.png";

const title = "API";

export default function API({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="api" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={"CoCalc"}
              title={title}
              subtitle={
                <>
                  Programmatically control CoCalc from your own server. Embed
                  CoCalc within other products with a customized external look
                  and feel.
                </>
              }
              image={screenshot}
              alt={"Using the API"}
            />
          </div>

          <Info.Heading
            description={
              <>
                The documentation explains what you can do with the CoCalc API.
              </>
            }
          >
            <A href="https://doc.cocalc.com/api/">CoCalc API Documentation</A>
          </Info.Heading>
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
