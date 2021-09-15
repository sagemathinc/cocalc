import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Products({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Products" />
      <Header page="pricing" subPage="products" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            maxWidth: "900px",
            margin: "15px auto",
            padding: "15px",
            backgroundColor: "white",
          }}
        >
          <div style={{ textAlign: "center", color: "#444" }}>
            <h1 style={{ fontSize: "28pt" }}>
              <Icon name="credit-card" style={{ marginRight: "30px" }} /> CoCalc
              - Products
            </h1>
          </div>
          <div style={{ fontSize: "12pt" }}></div>
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
