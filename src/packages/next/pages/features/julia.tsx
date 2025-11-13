/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import Snapshots from "components/landing/snapshots";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import juliaCode from "public/features/julia-code.png";
import splash from "public/features/julia-jupyter.png";
import logo from "public/features/julia-logo.svg";
import nbgraderScreenshot from "public/features/julia-nbgrader.png";
import plutoLogo from "public/features/pluto-logo.svg";
import plutoScreenshot from "public/features/pluto-plot.png";

const component = "Julia";
const title = `Run ${component} Online`;

export default function Julia({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="julia" runnableTag="jl" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            body={logo}
            title={title}
            subtitleBelow={true}
            subtitle={
              <>
                <div>
                  Run {component} scripts, <A href="">Pluto notebooks</A>,{" "}
                  <A href="/features/jupyter-notebook">Jupyter notebooks</A> in
                  a full, online environment.
                </div>
              </>
            }
            image={splash}
            alt={
              "Using Julia in a Jupyter notebook to plot and do symbolic computation"
            }
          />
          <Pitch
            col1={
              <>
                <Title level={2}>
                  <Icon name="julia" /> Run{" "}
                  <A href="https://julialang.org/">Julia</A> on CoCalc
                </Title>
                <Paragraph>
                  <ul>
                    <li>
                      Use CoCalc's own realtime collaborative{" "}
                      <strong>
                        <A href="/features/jupyter-notebook">
                          Jupyter Notebooks
                        </A>
                      </strong>
                      .
                    </li>
                    <li>
                      Use Julia from the collaborative,{" "}
                      <strong>
                        <A href="/features/terminal">Linux Terminal</A>
                      </strong>{" "}
                      or{" "}
                      <A href="/features/x11">
                        virtual X11 graphical Linux desktop
                      </A>
                      .
                    </li>
                    <li>
                      Easily launch a{" "}
                      <A href="https://doc.cocalc.com/howto/pluto.html">
                        Pluto.jl notebook server
                      </A>{" "}
                      in your CoCalc project.
                    </li>
                  </ul>
                </Paragraph>

                <Title level={2}>Packages</Title>
                <Paragraph>
                  CoCalc includes over 500{" "}
                  <A href="/software/julia">pre-installed Julia packages,</A>{" "}
                  and if something is missing you can{" "}
                  <A href="https://doc.cocalc.com/howto/install-julia-package.html">
                    easily install more packages.
                  </A>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>Benefits of working with Julia online</Title>
                <Paragraph>
                  <ul>
                    <li>
                      You no longer have to{" "}
                      <strong>install and maintain</strong> Julia. In particular
                      when you're{" "}
                      <A href="/features/teaching">teaching a class</A>,
                      students just have to sign in to CoCalc to get started!
                    </li>
                    <li>
                      All your files are private, stored persistently,
                      snapshotted and backed up.
                    </li>
                    <li>
                      You can invite <strong>collaborators</strong> to your
                      project to simultaneously edit the same notebooks or code
                      files.
                    </li>
                    <li>
                      Everything runs remotely, which means you do not have to
                      worry about messing up your own computer.{" "}
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
          />

          <SignIn startup={component} />

          <Info.Heading
            description={
              <>There are many ways to use {component} online via CoCalc.</>
            }
          >
            Feature Overview
          </Info.Heading>

          <Info
            title={
              <>
                <A href="https://github.com/fonsp/Pluto.jl#readme">
                  <Image
                    src={plutoLogo}
                    height={70}
                    width={250}
                    alt="the Pluto.jl Logo"
                  />
                  <br />
                  Use Reactive Notebooks Built for Julia
                </A>
              </>
            }
            image={plutoScreenshot}
            alt={"A screenshot of the Pluto notebook."}
            anchor="pluto"
            wide
          >
            <Paragraph>
              You can use the{" "}
              <A href="https://doc.cocalc.com/howto/pluto.html">
                Pluto.jl notebook server
              </A>{" "}
              in any CoCalc project. Pluto is an open source lightweight and
              reactive notebook written in Julia.
            </Paragraph>
          </Info>

          <Info
            title={"Teach using Julia and nbgrader"}
            image={nbgraderScreenshot}
            alt={"A screenshot using nbgrader with Julia."}
            anchor="nbgrader"
          >
            <Paragraph>
              CoCalc's{" "}
              <A href="/features/teaching">
                integrated course management system
              </A>{" "}
              fully supports{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                using nbgrader together with Julia
              </A>{" "}
              Jupyter Notebooks.
            </Paragraph>
            <Paragraph>
              We provide custom Julia templates for all the nbgrader cell types.
            </Paragraph>
            <Paragraph>
              Tests run in the student's project, so malicious code won't impact
              anybody except the student.
            </Paragraph>
          </Info>

          <Info
            title={"Collaboratively Edit and Run Julia Code"}
            image={juliaCode}
            alt={"A screenshot involving Julia code, a terminal, and chat."}
            anchor="code"
          >
            <Paragraph>
              CoCalc includes a realtime collaborative Julia code editor with
              syntax highlighting and code folding.
            </Paragraph>
            <Paragraph>
              You can also run Julia code in a terminal side-by-side the .jl
              file you are editing.
            </Paragraph>
            <Paragraph>
              In addition, you can chat with other CoCalc users about your code.
            </Paragraph>
          </Info>

          <Snapshots />

          <SignIn startup={component} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
