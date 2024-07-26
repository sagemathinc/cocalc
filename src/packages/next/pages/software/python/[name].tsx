/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Layout } from "antd";

import { SoftwareEnvNames } from "@cocalc/util/consts/software-envs";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import SoftwareLibraries from "components/landing/software-libraries";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize, CustomizeType } from "lib/customize";
import { ExecutableDescription } from "lib/landing/render-envs";
import { withCustomizedAndSoftwareSpec } from "lib/landing/software-specs";
import {
  ComputeComponents,
  ComputeInventory,
  ExecInfo,
  SoftwareSpec,
} from "lib/landing/types";
import { STYLE_PAGE, STYLE_PAGE_WIDE } from "..";
import pythonScreenshot from "/public/features/frame-editor-python.png";

interface Props {
  name: SoftwareEnvNames;
  customize: CustomizeType;
  spec: SoftwareSpec["python"];
  inventory: ComputeInventory["python"];
  components: ComputeComponents["python"];
  execInfo?: ExecInfo;
  timestamp: string;
}

export default function Software(props: Props) {
  const { name, customize, spec, inventory, components, execInfo, timestamp } =
    props;

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
        <Title level={1} style={{ textAlign: "center" }}>
          Installed Python Libraries (Ubuntu {name})
        </Title>
        <div style={{ width: "50%", float: "right", padding: "0 0 15px 15px" }}>
          <Image
            src={pythonScreenshot}
            alt="Writing and running a Python program"
          />
        </div>
        <Paragraph>
          The table below lists pre-installed Python libraries for each
          supported environment, which are immediately available in every CoCalc
          project running on the default "Ubuntu {name}" image. If something is
          missing, you can{" "}
          <A href="https://doc.cocalc.com/howto/install-python-lib.html">
            install it yourself
          </A>
          , or request that we install it.
        </Paragraph>
      </>
    );
  }

  // top part has the same with, the table is wider
  function renderTop() {
    return (
      <div style={{ maxWidth: STYLE_PAGE.maxWidth, margin: "0 auto" }}>
        {renderIntro()}
        {renderBox()}
        <h2 style={{ clear: "both" }}>Python Environments</h2>
        <ExecutableDescription spec={spec} execInfo={execInfo} />
      </div>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Python Libraries in CoCalc" />
      <Layout>
        <Header page="software" subPage="python" softwareEnv={name} />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div style={STYLE_PAGE_WIDE}>
            {renderTop()}
            <SoftwareLibraries
              spec={spec}
              timestamp={timestamp}
              inventory={inventory}
              components={components}
              libWidthPct={40}
            />
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "python");
}
