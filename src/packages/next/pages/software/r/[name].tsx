/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
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
  SoftwareSpec,
} from "lib/landing/types";
import { STYLE_PAGE } from "..";
import screenshot from "/public/features/cocalc-r-jupyter.png";

interface Props {
  name: SoftwareEnvNames;
  customize: CustomizeType;
  spec: SoftwareSpec["R"];
  inventory: ComputeInventory["R"];
  components: ComputeComponents["R"];
  execInfo?: { [key: string]: string };
  timestamp: string;
}

export default function R(props: Props) {
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
        <Paragraph>
          This table lists all R pre-installed packages that are immediately
          available in every CoCalc project running on the default "Ubuntu{" "}
          {name}" image, along with their version numbers. If something is
          missing, you can{" "}
          <A href="https://doc.cocalc.com/howto/install-r-package.html">
            install it yourself
          </A>
          , or request that we install them.
        </Paragraph>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="R Packages in CoCalc" />
      <Layout>
        <Header page="software" subPage="r" softwareEnv={name} />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div style={STYLE_PAGE}>
            <Title level={1} style={{ textAlign: "center" }}>
              Installed R Statistical Software Packages (Ubuntu {name})
            </Title>
            {renderIntro()}
            {renderBox()}
            <Title level={2} style={{ clear: "both" }}>
              Available Environments
            </Title>
            <ExecutableDescription spec={spec} execInfo={execInfo} />
            <SoftwareLibraries
              timestamp={timestamp}
              spec={spec}
              inventory={inventory}
              components={components}
              libWidthPct={60}
            />
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "R");
}
