/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Layout } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import SoftwareLibraries from "components/landing/software-libraries";
import A from "components/misc/A";
import { SoftwareEnvNames } from "lib/landing/consts";
import { Customize, CustomizeType } from "lib/customize";
import { Paragraph } from "components/misc";
import { ExecutableDescription } from "lib/landing/render-envs";
import { withCustomizedAndSoftwareSpec } from "lib/landing/software-specs";
import {
  ComputeComponents,
  ComputeInventory,
  SoftwareSpec,
} from "lib/landing/types";
import { STYLE_PAGE } from "..";
import screenshot from "/public/features/cocalc-octave-jupyter-20200511.png";

interface Props {
  name: SoftwareEnvNames;
  customize: CustomizeType;
  spec: SoftwareSpec["octave"];
  inventory: ComputeInventory["octave"];
  components: ComputeComponents["octave"];
  execInfo?: { [key: string]: string };
  timestamp: string;
}
export default function Octave(props: Props) {
  const { name, customize, spec, inventory, components, execInfo, timestamp } =
    props;

  // function renderBox() {
  //   return (
  //     <Alert
  //       style={{ margin: "15px 0" }}
  //       message="Learn More"
  //       description={
  //         <span style={{ fontSize: "10pt" }}>
  //           Learn more about{" "}
  //           <strong>
  //             <A href="/features/octave">
  //               GNU Octave related functionality in CoCalc
  //             </A>
  //           </strong>
  //           .
  //         </span>
  //       }
  //       type="info"
  //       showIcon
  //     />
  //   );
  // }

  function renderInfo() {
    return (
      <>
        <div style={{ width: "50%", float: "right", padding: "0 0 15px 15px" }}>
          <Image src={screenshot} alt="SageMath" />
        </div>
        <Paragraph>
          This table lists pre-installed{" "}
          <A href="https://www.sagemath.org">SageMath</A> packages that are
          immediately available in every CoCalc project running on the default
          "Ubuntu {name}" image, along with their respective version numbers.
        </Paragraph>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="SageMath in CoCalc" />
      <Layout>
        <Header page="software" subPage="sagemath" softwareEnv={name} />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div style={STYLE_PAGE}>
            <h1
              style={{ textAlign: "center", fontSize: "32pt", color: "#444" }}
            >
              SageMath (Ubuntu {name})
            </h1>
            {renderInfo()}
            {/* {renderBox()} */}
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
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomizedAndSoftwareSpec(context, "sagemath");
}
