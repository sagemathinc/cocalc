import { Layout } from "antd";
import ExecutablesTable from "components/landing/executables-table";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import A from "components/misc/A";
import { Customize, CustomizeType } from "lib/customize";
import { withCustomizedAndSoftwareSpec } from "lib/landing/software-specs";
import { ComputeInventory } from "lib/landing/types";
import executablesScreenshot from "public/software/executables.png";
import { STYLE_PAGE, STYLE_PAGE_WIDE } from ".";
interface Props {
  customize: CustomizeType;
  executablesSpec: ComputeInventory["executables"];
}

export default function Executables(props: Props) {
  const { customize, executablesSpec } = props;

  function renderInfo() {
    return (
      <div style={{ maxWidth: STYLE_PAGE.maxWidth, margin: "0 auto" }}>
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
          <A href="/features/terminal">open a "Terminal"</A> or run the command
          indirectly via a{" "}
          <A href="/features/jupyter-notebook">Jupyter notebook</A>.
        </p>
        <p>
          On CoCalc, you can also install or compile your own executable
          binaries. You have a lot of control about your own project, which is a
          containerized x86_64 Ubuntu Linux environment.{" "}
        </p>
      </div>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Executables in CoCalc" />
      <Header page="software" subPage="executables" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div style={STYLE_PAGE_WIDE}>
          {renderInfo()}
          <ExecutablesTable executablesSpec={executablesSpec} />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "executables");
}
