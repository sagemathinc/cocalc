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
import { STYLE_PAGE } from ".";
import screenshot from "/public/features/cocalc-r-jupyter.png";

interface Props {
  customize: CustomizeType;
  spec: SoftwareSpec["R"];
  inventory: ComputeInventory["R"];
  components: ComputeComponents["R"];
}

export default function R(props: Props) {
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
              <A href="/features/r-statistical-software">
                R functionality in CoCalc
              </A>
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
          <Image src={screenshot} alt="Using R in a Jupyter notebook" />
        </div>
        <p>
          This table lists all R packages that are{" "}
          <b>immediately available by default in every CoCalc project</b>, along
          with their version numbers. If something is missing, you can{" "}
          <A href="https://doc.cocalc.com/howto/install-r-package.html">
            install it yourself
          </A>
          , or request that we install them.
        </p>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="R Packages in CoCalc" />
      <Header page="software" subPage="r" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div style={STYLE_PAGE}>
          <h1 style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}>
            Installed R Statistical Software Packages
          </h1>
          {renderIntro()}
          {renderBox()}
          <h2>R Statistical Software Environments</h2>
          <ul>{renderEnvs()}</ul>
          <SoftwareLibraries
            spec={spec}
            inventory={inventory}
            components={components}
            libWidthPct={60}
          />
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "R");
}
