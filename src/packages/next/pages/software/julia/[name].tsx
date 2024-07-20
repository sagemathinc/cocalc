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
  SoftwareSpec,
} from "lib/landing/types";
import { STYLE_PAGE } from "..";
import screenshot from "/public/software/julia-jupyter.png";

interface Props {
  name: SoftwareEnvNames;
  customize: CustomizeType;
  spec: SoftwareSpec["julia"];
  inventory: ComputeInventory["julia"];
  components: ComputeComponents["julia"];
  execInfo?: { [key: string]: string };
  timestamp: string;
}

export default function Julia(props: Props) {
  const { name, customize, spec, inventory, components, execInfo, timestamp } =
    props;

  function renderIntro() {
    return (
      <>
        <div style={{ width: "50%", float: "right", padding: "0 0 15px 15px" }}>
          <Image src={screenshot} alt="Using Julia in a Jupyter notebook" />
        </div>
        <Paragraph>
          Julia is a fast modern compiled language that is{" "}
          <A href="/features/julia">well supported</A> on CoCalc. This table
          lists pre-installed <A href="https://julialang.org/">Julia</A>{" "}
          libraries immediately available in every CoCalc project running on the
          default "Ubuntu {name}" image. If something is missing, you can{" "}
          <A href="https://doc.cocalc.com/howto/install-julia-package.html">
            install additional libraries
          </A>
          , or request that we install them.
        </Paragraph>
      </>
    );
  }

  function renderInfoBox() {
    return (
      <Alert
        style={{ margin: "15px 0" }}
        message="Learn More"
        description={
          <span style={{ fontSize: "10pt" }}>
            Learn more about{" "}
            <strong>
              <A href="/features/julia">Julia in CoCalc</A>
            </strong>{" "}
            and our{" "}
            <strong>
              <A href="https://doc.cocalc.com/howto/pluto.html">Pluto</A>
            </strong>{" "}
            and{" "}
            <strong>
              <A href="/features/jupyter-notebook">Jupyter</A>
            </strong>{" "}
            Notebook support.
          </span>
        }
        type="info"
        showIcon
      />
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Julia Packages in CoCalc" />
      <Layout>
        <Header page="software" subPage="julia" softwareEnv={name} />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div style={STYLE_PAGE}>
            <Title style={{ textAlign: "center" }}>
              Installed Julia Packages (Ubuntu {name})
            </Title>
            {renderIntro()}
            {renderInfoBox()}
            <ExecutableDescription spec={spec} execInfo={execInfo} />
            <SoftwareLibraries
              spec={spec}
              inventory={inventory}
              components={components}
              libWidthPct={60}
              timestamp={timestamp}
            />
          </div>
          <Footer />
        </Layout.Content>{" "}
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "julia");
}
