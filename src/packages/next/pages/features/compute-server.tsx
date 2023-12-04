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
import A from "components/misc/A";

export const component = "Compute Servers";
export const title = `Enhance your project with ${component}`;
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
            caption={
              <div style={{ marginTop: "10px" }}>
                Compute servers enhance your CoCalc project
              </div>
            }
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
                      <Text strong>GPU</Text>: select one or more GPUs for your
                      selected machine
                    </li>
                    <li>
                      <Text strong>Disk</Text>: configure the size and speed of
                      the provisioned disk
                    </li>
                    <li>
                      <Text strong>Hosting</Text>: choose a subdomain, in order
                      to host any kind of web application
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>
                  <A href="https://github.com/sagemathinc/cocalc-howto#readme">
                    Use cases
                  </A>
                </Title>
                <Paragraph>
                  <ul>
                    <li>
                      Use the{" "}
                      <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/colab.md">
                        Google Colab Softwar Environment with a GPU
                      </A>
                    </li>
                    <li>
                      <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/pytorch.md">
                        Use the official PyTorch image with a GPU
                      </A>
                    </li>
                    <li>
                      <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/mathematica.md">
                        Use the Mathematica Jupyter Kernel
                      </A>
                    </li>
                    <li>
                      <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/ollama.md">
                        Use Ollama with a nice web UI to run Large Language
                        Models using GPUs
                      </A>
                    </li>
                    <li>
                      Use a large number of CPUs and RAM to run resource
                      intensive computations in parallel using R, SageMath, etc.
                    </li>
                    <li>
                      Run your own custom{" "}
                      <A href="https://github.com/sagemathinc/cocalc-docker/blob/master/docs/cocalc.com.md">
                        CoCalc server
                      </A>{" "}
                      or{" "}
                      <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/SageMathCell.md">
                        Sage Cell Server
                      </A>{" "}
                      anywhere in the world.
                    </li>
                  </ul>
                  {/* Not an ideal choice of video -- will change later. */}
                  <iframe
                    width="560"
                    height="315"
                    src="https://www.youtube.com/embed/kcxyShH3wYE?si=1utaPIniNOXgSJ2N"
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  ></iframe>
                </Paragraph>
              </>
            }
          />

          <Info.Heading description={"More details about compute servers"}>
            Compute Server Functionality
          </Info.Heading>

          <Info
            title="GPU Support"
            image={ComputeServerGPU}
            icon="gpu"
            anchor="a-gpu"
            alt="GPU support in CoCalc compute servers"
            wide
          >
            <Paragraph>
              Compute servers have a <Text strong>quick startup time</Text>.
              Pre-configured Docker images are already pulled into the virtual
              machine. You neither have to wait a longtime to provision the
              machine, nor do you have to wait for preparing and installing the
              ncessary software environment.
            </Paragraph>
          </Info>

          <Info
            title="Seamless Integration"
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
              The files in your project are synchronized with the compute
              server, which eliminates any headaches provisioning storage and
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
              preserve the data, or delete it to save the cost of keeping the
              stored files around.
            </Paragraph>
          </Info>

          <Info
            title="Versatile Configuration"
            icon="servers"
            image={ComputeServerCreate}
            anchor="a-create"
            alt="Configuring compute server"
            wide
          >
            <Paragraph>
              You can create VM's with over 10TB of RAM, over 400 cores, and up
              to 65TB of disk space.
            </Paragraph>
            <Paragraph>
              You can choose one or more T4, L4, and A100 GPU's.
            </Paragraph>
            <Paragraph>
              Many preconfigured software stacks are available, including
              PyTorch, Tensorflow, Google Colab, CUDA, SageMath, Julia, and R.
            </Paragraph>
            <Paragraph>
              You can easily compare prices in different regions across the
              world, and get the best spot instance deals, or select low CO2
              data centers. Compute servers have a cached networked filesystem,
              so you can take advantage of much better global rates, rather than
              being stuck in one region.
            </Paragraph>
            <Paragraph>
              You can dynamically enlarge your disk at any time, even while the
              server is running, and the OS will automatically enlarge the
              available space.
            </Paragraph>
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
