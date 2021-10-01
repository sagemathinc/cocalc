import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import ExecutablesTable from "components/landing/executables-table";
import Image from "components/landing/image";
import { Layout } from "antd";
import A from "components/misc/A";

import executablesScreenshot from "public/software/executables.png";

export default function Software({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Executables in CoCalc" />
      <Header page="software" subPage="executables" />
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
          <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
            Executables in CoCalc
          </h1>
          <div style={{ width: "50%", float: "right", paddingBottom: "15px" }}>
            <Image
              src={executablesScreenshot}
              alt="Terminal showing listing executables in CoCalc"
            />
          </div>
          <p>
            This is a non-comprehensive list of executables available on CoCalc.
          </p>
          <p>
            To run anything listed below, you need to either{" "}
            <A href="/features/terminal">open a "Terminal"</A> or run the
            command indirectly via a{" "}
            <A href="/features/jupyter-notebook">Jupyter notebook</A>.
          </p>
          <p>
            On CoCalc, you can also install or compile your own executable
            binaries. You have a lot of control about your own project, which is
            a containerized x86_64 Ubuntu Linux environment.{" "}
          </p>
          <ExecutablesTable />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
