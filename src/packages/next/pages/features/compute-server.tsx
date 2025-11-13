/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
import runningComputeServer from "public/features/running-compute-server.png";
import ComputeServerCreate from "public/features/create-compute-server.png";
import ComputeServerSelector from "public/features/compute-server-select.png";
import A from "components/misc/A";
import ComputeServerTemplates from "components/landing/compute-server-templates";
import Videos from "components/videos";

const VIDEOS = [
  {
    id: "7fzLd6HD-Qs",
    title: "Using Anaconda and Python with a GPU on a compute server on CoCalc",
  },
  { id: "OMN1af0LUcA", title: "Using OpenWebUI and Ollama On CoCalc" },
  { id: "JG6jm6yv_KE", title: "PyTorch with a GPU on CoCalc" },
  { id: "NkNx6tx3nu0", title: "Running On-Prem Compute Servers on CoCalc" },
  {
    id: "Uwn3ngzXD0Y",
    title: "JAX Quickstart on CoCalc using a GPU (or on CPU)",
  },
];

export const component = "Compute Servers";
export const title = `Enhance your Projects with ${component}`;
export const logo = "servers";

export default function ComputeServer({ customize }) {
  const { computeServersEnabled, siteName } = customize;
  if (!computeServersEnabled) {
    return <div>Compute Servers are not enabled on this server.</div>;
  }
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="compute-server" />
        <Layout.Content>
          <div style={{ textAlign: "center", margin: "15px 0" }}>
            <ComputeServerTemplates />
          </div>
          <Content
            landing
            startup={component}
            body={<Icon name={logo} style={{ fontSize: "128px" }} />}
            title={
              <>
                Enhance your Projects with{" "}
                <A href="https://doc.cocalc.com/compute_server.html">
                  {component}
                </A>
              </>
            }
            subtitleBelow={true}
            subtitle={
              <div>
                Extend your project's compute capabilities far beyond the bounds
                of its underlying compute environment. Read{" "}
                <A href="https://doc.cocalc.com/compute_server.html">
                  the documentation
                </A>
                .
              </div>
            }
            image={runningComputeServer}
            alt={"A Running Compute Server with an H100 GPU"}
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
                      <Text strong>GPU's</Text>: select one or more powerful
                      GPUs for your selected machine, including H100's for about
                      $2/hour.
                    </li>
                    <li>
                      <Text strong>CPU</Text>: you can not only select the
                      number of CPU cores, but also the type of processor, with
                      support for both x86_64 and ARM.
                    </li>
                    <li>
                      <Text strong>Memory</Text>: depending on the type of
                      machine, select from a huge range of possible memory
                      configurations, exceeding 1000 GB.
                    </li>
                    <li>
                      <Text strong>Disk</Text>: configure the size and speed of
                      the provisioned disk
                    </li>
                    <li>
                      <Text strong>Shared Cloud Disk</Text>: mount a single
                      shared cloud filesystem across your compute servers
                    </li>
                    <li>
                      <Text strong>Hosting</Text>: choose a subdomain, in order
                      to host web applications, VS Code, JupyterLab, R IDE,
                      Pluto, and more.
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
                        Google Colab Software Environment with a GPU
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
                    <li>
                      <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/README.md">
                        Many more applications...
                      </A>
                    </li>
                  </ul>
                  <Videos videos={VIDEOS} />
                </Paragraph>
              </>
            }
          />

          <Info.Heading description={"More details about compute servers"}>
            Compute Server Functionality
          </Info.Heading>

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
              stored files around. You can also store data longterm in our{" "}
              <A href="https://doc.cocalc.com/cloud_file_system.html">
                Cloud Filesystem
              </A>
              .
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
              You can create servers with over 10TB of RAM, over 400 cores, and
              up to 65TB of disk space.
            </Paragraph>
            <Paragraph>
              You can choose from a wide range of GPU's: T4, L4, L40, A100,
              H100, RTX 4000, 5000, and 6000!
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
