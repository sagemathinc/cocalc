import { Alert, Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import SoftwareLibraries from "components/landing/software-libraries";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import { getSpec } from "lib/landing/libraries";
import withCustomize from "lib/with-customize";
import { STYLE_PAGE } from ".";
import pythonScreenshot from "/public/features/frame-editor-python.png";

export default function Software({ customize }) {
  function renderEnvs() {
    const envs: JSX.Element[] = [];
    for (const [key, spec] of Object.entries(getSpec()["python"])) {
      envs.push(
        <div key={key}>
          <b>
            <A href={spec.url}>{spec.name}</A>:
          </b>{" "}
          {spec.doc}
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

  return (
    <Customize value={customize}>
      <Head title="Python Libraries in CoCalc" />
      <Header page="software" subPage="python" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div style={STYLE_PAGE}>
          <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
            Installed Python Libraries
          </h1>
          {renderIntro()}
          {renderBox()}
          <h2>
            <A href="/features/python">Python Environments</A>
          </h2>
          <ul>{renderEnvs()}</ul>
          <SoftwareLibraries lang="python" libWidthPct={40} />;
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
