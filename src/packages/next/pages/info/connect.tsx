import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import IndexList, { DataSource } from "components/landing/index-list";
import SiteName from "components/share/site-name";

import Discord from "public/info/discord.png";

const dataSource = [
  {
    link: "https://discord.gg/nEHs2GK",
    title: "Chat about CoCalc on Discord",
    logo: "comment",
    image: Discord,
    imageWidth: "450px",
    description: (
      <>
        Visit the <A href="https://discord.gg/nEHs2GK">CoCalc Discord server</A>{" "}
        to chat with other CoCalc users, ask questions, and give us quick
        feedback.
      </>
    ),
  },
  {
    link: "/share",
    logo: "bullhorn",
    title: "Explore Published Files",
    description: (
      <>
        You can{" "}
        <A href="/share">
          browse the <SiteName /> share server
        </A>{" "}
        to see what other users of this site are publishing.
      </>
    ),
  },
] as DataSource;

export default function Connect({ customize }) {
  const { siteName, contactEmail, shareServer } = customize;

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
            <h1 style={{ fontSize: "28pt" }}></h1>
          </div>
          <IndexList
            title={
              <>
                <Icon name="users" style={{ marginRight: "30px" }} />
                Connect with the Cocalc Community
              </>
            }
            description={
              <>
                There are many ways that you can connect with the broader CoCalc
                community.
              </>
            }
            dataSource={dataSource}
            filter={(item) => {
              if (item.link == "/share" && !shareServer) return false;
              return true;
            }}
          />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
