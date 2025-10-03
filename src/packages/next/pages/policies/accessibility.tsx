import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Accessibility from "components/landing/accessibility";
import { MAX_WIDTH } from "lib/config";

export default function AccessibilityPage({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Accessibility" />
      <Layout>
        <Header page="policies" subPage="accessibility" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <div style={{ textAlign: "center", color: "#444" }}>
              <h1 style={{ fontSize: "28pt" }}>
                CoCalc Voluntary Product Accessibility Template (VPAT)
              </h1>
              <h2>Last Updated: July 3, 2019</h2>
            </div>
            <div style={{ fontSize: "12pt", overflowX: "auto" }}>
              <Accessibility />
            </div>
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
