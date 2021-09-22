import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Connect({ customize }) {
  const { siteName, contactEmail } = customize;

  return (
    <Customize value={customize}>
      <Head title="Connect with the Community" />
      <Header page="info" subPage="connect" />
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
              <Icon name="users" style={{ marginRight: "30px" }} />
              Connect with the Cocalc Community
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
