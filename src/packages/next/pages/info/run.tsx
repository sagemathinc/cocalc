import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import IndexList, { DataSource } from "components/landing/index-list";
import { MAX_WIDTH } from "lib/config";

const dataSource: DataSource = [
  {
    landingPages: true,
    link: "https://github.com/sagemathinc/cocalc-desktop#readme",
    title: "Install the CoCalc Desktop Application",
    logo: "laptop",
    description: (
      <>
        If you're having browser compatibility issues with CoCalc, you can try
        installing the{" "}
        <A href="https://github.com/sagemathinc/cocalc-desktop#readme">
          CoCalc desktop application for Windows and MacOS
        </A>
        . This is a lightweight application that connects to the main cocalc.com
        site, but is completely separate from your web browser.
      </>
    ),
  },
  {
    landingPages: true,
    link: "/pricing/onprem",
    title: "Install CoCalc on Your Own Server or Cluster",
    logo: "server",
    description: (
      <>
        You can{" "}
        <A href="/pricing/onprem">
          fully run your own commercially supported instance of CoCalc
        </A>{" "}
        on anything from your laptop to a large Kubernetes cluster.
      </>
    ),
  },
] as DataSource;

export default function Help({ customize }) {
  let data = dataSource;
  return (
    <Customize value={customize}>
      <Head title="Run CoCalc" />
      <Header page="info" subPage="run" />
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
          <IndexList
            title={
              <>
                <Icon name="laptop" style={{ marginRight: "30px" }} />
                Other Ways to Run CoCalc
              </>
            }
            description={
              <>
                In addition to using CoCalc via the website cocalc.com, there
                are several other ways to run CoCalc.
              </>
            }
            dataSource={data}
          />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
