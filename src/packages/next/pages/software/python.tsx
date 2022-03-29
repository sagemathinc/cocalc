import { Alert, Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import SoftwareLibraries from "components/landing/software-libraries";
import A from "components/misc/A";
import { Customize, CustomizeType } from "lib/customize";
import { withCustomizedAndSoftwareSpec } from "lib/landing/software-specs";
import {
  ComputeComponents,
  ComputeInventory,
  SoftwareSpec,
} from "lib/landing/types";
import { STYLE_PAGE, STYLE_PAGE_WIDE } from ".";
import pythonScreenshot from "/public/features/frame-editor-python.png";

interface Props {
  customize: CustomizeType;
  spec: SoftwareSpec["python"];
  inventory: ComputeInventory["python"];
  components: ComputeComponents["python"];
}

export default function Software(props: Props) {
  const { customize, spec, inventory, components } = props;

  function renderEnvs() {
    const envs: JSX.Element[] = [];
    for (const [key, info] of Object.entries(spec)) {
      envs.push(
        <div key={key}>
          <b>
            <A href={info.url}>{info.name}</A>:
          </b>{" "}
          {info.doc}
        </div>
      );
    }
    return envs;
  }

  function renderBox() {
    return (
      <Alert
        style={{ margin: "15px 0" }}
        message="Learn More"
        description={
          <span style={{ fontSize: "10pt" }}>
            Learn more about{" "}
            <strong>
              <A href="/features/python">Python in CoCalc</A>
            </strong>{" "}
            and{" "}
            <strong>
              <A href="/features/jupyter-notebook">Jupyter Notebook support</A>
            </strong>
            .
          </span>
        }
        type="info"
        showIcon
      />
    );
  }

  function renderIntro() {
    return (
      <>
        <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
          Installed Python Libraries
        </h1>
        <div style={{ width: "50%", float: "right", padding: "0 0 15px 15px" }}>
          <Image
            src={pythonScreenshot}
            alt="Writing and running a Python program"
          />
        </div>
        <p>
          The table below lists available Python libraries for each supported
          environment. If something is missing, you can{" "}
          <A href="https://doc.cocalc.com/howto/install-python-lib.html">
            install it yourself
          </A>
          , or request that we install it.
        </p>
      </>
    );
  }

  // top part has the same with, the table is wider
  function renderTop() {
    return (
      <div style={{ maxWidth: STYLE_PAGE.maxWidth, margin: "0 auto" }}>
        {renderIntro()}
        {renderBox()}

        <h2>
          <A href="/features/python">Python Environments</A>
        </h2>
        <ul>{renderEnvs()}</ul>
      </div>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Python Libraries in CoCalc" />
      <Header page="software" subPage="python" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div style={STYLE_PAGE_WIDE}>
          {renderTop()}
          <SoftwareLibraries
            spec={spec}
            inventory={inventory}
            components={components}
            libWidthPct={40}
          />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "python");
}
