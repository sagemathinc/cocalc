import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import ExecutablesTable, {
  DataSource,
} from "components/landing/executables-table";
import Code from "components/landing/code";
import Image from "components/landing/image";
import { Layout } from "antd";
import A from "components/misc/A";

import executablesScreenshot from "public/software/executables.png";

const dataSource = [
  {
    name: "4Ti2-Zsolve",
    path: "/usr/bin/4ti2-zsolve",
    output: `-------------------------------------------------
4ti2 version 1.6.9
Copyright 1998, 2002, 2006, 2015 4ti2 team.
4ti2 comes with ABSOLUTELY NO WARRANTY.
This is free software, and you are welcome
to redistribute it under certain conditions.
For details, see the file COPYING.
-------------------------------------------------`,
  },
] as DataSource;

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
          <div style={{ width: "50%", float: "right" }}>
            <Image src={executablesScreenshot} />
          </div>
          <p>
            This is a non-comprehensive list of executables available on CoCalc.
            We show the output of running the executable with{" "}
            <Code>--version</Code>, which provides information about the utility
            and its version.
          </p>
          <p>
            To run anything listed below, you need to either{" "}
            <A href="/features/terminal">open a "Terminal"</A> or run the
            command indirectly via a{" "}
            <A href="/features/jupyter">Jupyter notebook</A>.
          </p>
          <p>
            On CoCalc, you can also install and/or compile your own executable
            binaries. You have a lot of control about your own project, which is
            essentially a containerized Linux environment.{" "}
          </p>
          <ExecutablesTable dataSource={dataSource} />
        </div>
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
