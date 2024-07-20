/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { SoftwareEnvNames } from "@cocalc/util/consts/software-envs";
import ExecutablesTable from "components/landing/executables-table";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize, CustomizeType } from "lib/customize";
import { withCustomizedAndSoftwareSpec } from "lib/landing/software-specs";
import { ComputeInventory } from "lib/landing/types";
import executablesScreenshot from "public/software/executables.png";
import { STYLE_PAGE, STYLE_PAGE_WIDE } from "..";

interface Props {
  name: SoftwareEnvNames;
  index?: true;
  customize: CustomizeType;
  executablesSpec: ComputeInventory["executables"];
  timestamp: string;
}

export default function Executables(props: Props) {
  const { name, customize, executablesSpec, timestamp } = props;

  function renderInfo() {
    return (
      <div style={{ maxWidth: STYLE_PAGE.maxWidth, margin: "0 auto" }}>
        <Title level={1} style={{ textAlign: "center" }}>
          Executables in CoCalc (Ubuntu {name})
        </Title>
        <div
          style={{
            width: "50%",
            float: "right",
            paddingBottom: "15px",
            paddingLeft: "15px",
          }}
        >
          <Image
            src={executablesScreenshot}
            alt="Terminal showing listing executables in CoCalc"
          />
        </div>
        <Paragraph>
          This is a non-comprehensive list of executables available on CoCalc.
        </Paragraph>
        <Paragraph>
          To run anything listed below, you need to either{" "}
          <A href="/features/terminal">open a "Terminal"</A> or run the command
          indirectly via a{" "}
          <A href="/features/jupyter-notebook">Jupyter notebook</A>.
        </Paragraph>
        <Paragraph>
          On CoCalc, you can also install or compile your own executable
          binaries. You have a lot of control about your own project, which is a
          containerized environment based on x86_64 Ubuntu Linux {name}.{" "}
        </Paragraph>
      </div>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Executables in CoCalc" />
      <Layout>
        <Header page="software" subPage="executables" softwareEnv={name} />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <div style={STYLE_PAGE_WIDE}>
            {renderInfo()}
            <ExecutablesTable
              executablesSpec={executablesSpec}
              timestamp={timestamp}
            />
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "executables");
}
