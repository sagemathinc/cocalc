import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Layout } from "antd";
import getStats from "lib/landing/stats";
import { Icon } from "@cocalc/frontend/components/icon";
import Statistics from "components/landing/statistics";

export default function Stats({ customize, stats }) {
  const { siteName } = customize;

  return (
    <Customize value={customize}>
      <Head title="Statistics" />
      <Header page="info" subPage="stats" />
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
              <Icon name="dashboard" style={{ marginRight: "30px" }} />
              {siteName} - Statistics
            </h1>
          </div>
          {stats != null ? <Statistics stats={stats} /> : "(not available)"}
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps() {
  const stats = await getStats();
  return await withCustomize({ props: { stats } });
}
