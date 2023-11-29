/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Text, Title } from "components/misc";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import ComputeServerInfographic from "public/features/cocalc-compute-infographic-20231124.jpg";
import ComputeServerCreate from "public/features/cocalc-compute_server-create-20231127.png";
import ComputeServerGPU from "public/features/cocalc-compute_server-gpu-20231127.png";
import ComputeServerSelector from "public/features/cocalc-compute_server-select-20231127.png";

export const component = "Compute Server";
export const title = `Enhance your project with a ${component}`;
export const logo = "servers";

export default function ComputeServer({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="compute-server" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            logo={<Icon name={logo} style={{ fontSize: "128px" }} />}
            title={title}
            subtitleBelow={true}
            subtitle={
              <div>
                Extend your project's compute capabilities far beyond the bounds
                of its underlying compute environment.
              </div>
            }
            image={ComputeServerInfographic}
            alt={
              "Illustration of Compute servers enhancing your CoCalc project"
            }
            caption={"Compute servers enhancing your CoCalc project"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>Versatility</Title>
                <Paragraph>
                  Configure the remote compute servers exactly to your needs
                </Paragraph>
                <Paragraph>
                  <ul>
                    <li>
                      <Text strong>CPU</Text>: you can not only select the
                      number of CPU cores, but also the type of machine.
                    </li>
                    <li>
                      <Text strong>Memory</Text>: depending on the type of
                      machine, select from the full range of possible memory
                      configurations.
                    </li>
                    <li>
                      <Text strong>GPU</Text>: select one ore more GPUs for your
                      selected machine
                    </li>
                    <li>
                      <Text strong>Disk</Text>: configure the size and speed of
                      the provisioned disk
                    </li>
                    <li>
                      <Text strong>Hosting</Text>: rent a sub-domain, in order
                      to host any kind of web application
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>Use cases</Title>
                <Paragraph>
                  <ul>
                    <li>xxx</li>
                    <li>xxx</li>
                    <li>xxx</li>
                    <li>xxx</li>
                  </ul>
                </Paragraph>
              </>
            }
          />

          <Info.Heading description={"More details about compute servers"}>
            Compute Server Functionality
          </Info.Heading>

          <Info
            title="GPU support"
            image={ComputeServerGPU}
            icon="gpu"
            anchor="a-gpu"
            alt="GPU support in CoCalc compute servers"
            wide
          >
            <Paragraph>xxx</Paragraph>
            <Paragraph>
              On top of that, such compute servers have a{" "}
              <Text strong>quick startup time</Text>. Pre-configured Docker
              images are already pulled into the virtual machine. You neither
              have to wait an extensively longtime to provision the machine, nor
              do you have to wait for preparing and installing the ncessary
              software environment.
            </Paragraph>
          </Info>

          <Info
            title="Seamless integration"
            icon="sync"
            image={ComputeServerSelector}
            anchor="a-integration"
            alt="Select compute server"
            wide
          >
            <Paragraph>
              {siteName} makes switching between the local compute environment
              and the remote compute server very easy.
            </Paragraph>
            <Paragraph>
              The files in your project a synchronized, which eliminates any
              headaches of having to provisioning enough storage and
              transferring files back and forth.
            </Paragraph>
            <Paragraph>
              As part of configuring the remote server, you can tune which
              folders are excluded from synchronization, select additional
              scratch storage space, and also configure the size of the remote
              storage disk.
            </Paragraph>
            <Paragraph>
              At the end of using the compute machine, you can either stop it to
              preserve the data, or delete it to save costs for keeping the
              stored files around.
            </Paragraph>
          </Info>

          <Info
            title="Versatile configuration"
            icon="servers"
            image={ComputeServerCreate}
            anchor="a-create"
            alt="Configuration compute server"
            wide
          >
            <Paragraph>xxx</Paragraph>
            <Paragraph>xxx</Paragraph>
          </Info>

          <SignIn />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
