import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import Snapshots from "components/landing/snapshots";
import { Icon } from "@cocalc/frontend/components/icon";
import Image from "components/landing/image";

import logo from "public/features/julia-logo.svg";
import splash from "public/features/julia-jupyter.png";
import plutoLogo from "public/features/pluto-logo.svg";
import plutoScreenshot from "public/features/pluto-plot.png";
import nbgraderScreenshot from "public/features/julia-nbgrader.png";
import juliaCode from "public/features/julia-code.png";

const component = "Julia";
const title = `Run ${component} Online`;

export default function Julia({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="julia" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={component}
              logo={logo}
              title={title}
              subtitle={
                <>
                  <div>
                    Run {component} scripts, <A href="">Pluto notebooks</A>,{" "}
                    <A href="/features/jupyter-notebook">Jupyter notebooks</A>{" "}
                    in a full, online environment.
                  </div>
                </>
              }
              image={splash}
              alt={
                "Using Julia in a Jupyter notebook to plot and do symbolic computation"
              }
            />
          </div>
          <Pitch
            col1={
              <>
                <h3>
                  <Icon name="julia" /> Run{" "}
                  <A href="https://julialang.org/">Julia</A> on CoCalc
                </h3>
                <ul>
                  <li>
                    Use CoCalc's own realtime collaborative{" "}
                    <strong>
                      <A href="/features/jupyter-notebook">Jupyter Notebooks</A>
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
                <br />
                <h3>Packages</h3>
                <div>
                  CoCalc includes over 500{" "}
                  <A href="/software/julia">pre-installed Julia packages,</A>{" "}
                  and if something is missing you can{" "}
                  <A href="https://doc.cocalc.com/howto/install-julia-package.html">
                    easily install more packages.
                  </A>
                </div>
              </>
            }
            col2={
              <>
                <h3>Benefits of working with Julia online</h3>
                <ul>
                  <li>
                    You no longer have to <strong>install and maintain</strong>{" "}
                    Julia. In particular when you're{" "}
                    <A href="/features/teaching">teaching a class</A>, students
                    just have to sign in to CoCalc to get started!
                  </li>
                  <li>
                    All your files are private, stored persistently, snapshotted
                    and backed up.
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
          >
            <p>
              You can use the{" "}
              <A href="https://doc.cocalc.com/howto/pluto.html">
                Pluto.jl notebook server
              </A>{" "}
              in any CoCalc project. Pluto is an open source lightweight and
              reactive notebook written in Julia.
            </p>
          </Info>

          <Info
            title={"Teach using Julia and Nbgrader"}
            image={nbgraderScreenshot}
            alt={"A screenshot using nbgrader with Julia."}
            anchor="nbgrader"
          >
            <p>
              CoCalc's{" "}
              <A href="/features/teaching">
                integrated course management system
              </A>{" "}
              fully supports{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                using nbgrader together with Julia
              </A>{" "}
              Jupyter Notebooks.
            </p>
            <p>
              We provide custom Julia templates for all the nbgrader cell types.
            </p>
            <p>
              Tests run in the student's project, so malicious code won't impact
              anybody except the student.
            </p>
          </Info>

          <Info
            title={"Collaboratively Edit and Run Julia Code"}
            image={juliaCode}
            alt={"A screenshot involving Julia code, a terminal, and chat."}
            anchor="code"
          >
            <p>
              CoCalc includes a realtime collaborative Julia code editor with
              syntax highlighting and code folding.
            </p>
            <p>
              You can also run Julia code in a terminal side-by-side the .jl
              file you are editing.
            </p>
            <p>
              In addition, you can chat with other CoCalc users about your code.
            </p>
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
