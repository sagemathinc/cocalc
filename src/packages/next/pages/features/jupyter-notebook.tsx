/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import Backups from "components/landing/backups";
import Comparison from "components/landing/compare";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import LaTeX from "components/landing/latex";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { ChatGPTFixError } from "./ai";

import JupyterChat from "/public/features/cocalc-chat-jupyter-20171120-2.png";
import JupyterKernels from "/public/features/cocalc-jupyter-kernels.png";
import Nbgrader from "/public/features/cocalc-jupyter-nbgrader-overview.png";
import JupyterNasa from "/public/features/cocalc-jupyter-share-nasa.png";
import JupyterTF from "/public/features/cocalc-jupyter2-20170508.png";
import JupyterMem from "/public/features/cocalc-jupyter2-memory-cpu.png";
import RTC from "/public/features/cocalc-real-time-jupyter.png";
import JupyterLab from "/public/features/jupyter-lab.png";
import JupyterLogo from "/public/features/jupyter-logo.svg";

export default function JupyterNotebook({ customize }) {
  function pitchNoSetup() {
    return (
      <>
        <Title level={2}>
          No software setup: <small>100% online</small>
        </Title>
        <Paragraph>
          CoCalc is an online web service where you can{" "}
          <strong>
            run <A href="http://jupyter.org/">Jupyter notebooks</A> right inside
            your browser
          </strong>
          . You can privately share your notebook with your{" "}
          <A href="https://doc.cocalc.com/project-settings.html#about-collaborators">
            project collaborators
          </A>{" "}
          – all changes are{" "}
          <A href="#a-realtimesync">
            <strong>synchronized in real-time</strong>
          </A>
          .
        </Paragraph>
        <Paragraph>
          You no longer have to worry about setting up your Python environment,
          installing/updating/maintaining your libraries, or backing up files.
          CoCalc manages everything for you!{" "}
        </Paragraph>
      </>
    );
  }

  function pitchTeaching() {
    return (
      <>
        <Title level={2}>Jupyter Notebooks made for teaching!</Title>
        <Paragraph>
          <ul>
            <li>
              A sophisticated{" "}
              <strong>
                <A href="/features/teaching">course management system</A>
              </strong>{" "}
              keeps track of all notebooks of all students. It manages
              distributing and collecting files as well as grading.
            </li>
            <li>
              The{" "}
              <A href="/features/whiteboard">
                Jupyter collaborative whiteboard
              </A>{" "}
              supports presentations that mix Jupyter cells, mathematical
              notation, and sketching with a pen and other tools.
            </li>
            <li>
              CoCalc{"'"}s Jupyter Notebooks fully support{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                <strong>very flexible automatic grading via nbgrader</strong>
              </A>
              ! The teacher{"'"}s notebook contains exercise cells for students
              and test cells, some of which students can also run to get
              immediate feedback. Once collected, you tell CoCalc to
              automatically run the full test suite across all student notebooks
              and tabulate the results.
            </li>
          </ul>
        </Paragraph>
        <Paragraph>
          CoCalc supports many kernels right out of the box: several Python
          environments, <A href="http://www.sagemath.org/">SageMath</A>,{" "}
          <A href="http://www.r-project.org/">R Statistical Software</A>
          Octave, <A href="/features/julia">Julia</A> and many more.{" "}
        </Paragraph>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Online Jupyter Notebooks" />
      <Layout>
        <Header page="features" subPage="jupyter-notebook" runnableTag="py" />
        <Layout.Content>
          <Content
            landing
            startup={"Jupyter"}
            body={JupyterLogo}
            title={"Online Jupyter Notebooks"}
            subtitle={
              "CoCalc's own collaborative, fully compatible and supercharged notebooks."
            }
            subtitleBelow={true}
            image={JupyterTF}
            alt={"Using Pandas and Tensorflow in a Jupyter notebook"}
          />

          <Pitch col1={pitchTeaching()} col2={pitchNoSetup()} ext="ipynb" />

          <Info
            title="Collaborative editing"
            icon="users"
            image={RTC}
            anchor="a-realtimesync"
            alt={"Two browser windows editing the same Jupyter notebook"}
            style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
          >
            <Paragraph>
              You can share your Jupyter notebooks privately with project
              collaborators. All modifications are{" "}
              <strong>synchronized in real time</strong>, where you can see the
              cursors of others while they edit the document. You are also
              notified about the presence of collaborators.
            </Paragraph>
            <Paragraph>
              Edit text between code cells using{" "}
              <A href="https://doc.cocalc.com/markdown.html">
                markdown or our collaborative rich text editor
              </A>
              .
            </Paragraph>
            <Paragraph>
              We have extended ipywidgets so that sliders, menus and knobs of{" "}
              <A href="https://ipywidgets.readthedocs.io/en/stable/examples/Widget%20Basics.html">
                interactive widgets
              </A>{" "}
              are also fully synchronized among all collaborators.
            </Paragraph>
            <Paragraph>
              Additionally, the status and results of all computations in the
              currently running kernel session are also synchronized, because
              the session runs remotely in CoCalc's cluster.
            </Paragraph>
            <Paragraph>
              Together, everyone involved experiences the notebook in the same
              way.
            </Paragraph>
          </Info>

          <Info.Heading
            description={
              <>
                The following are some more specific features of Jupyter
                notebooks in CoCalc.
                <br />
                There is also more{" "}
                <A href="https://doc.cocalc.com/jupyter.html">
                  comprehensive documentation
                </A>
                .
              </>
            }
          >
            Feature Overview
          </Info.Heading>

          <Info
            anchor="a-timetravel"
            title="TimeTravel"
            icon="history"
            video={[
              "features/cocalc-jupyter2-timetravel-20170515-3x.webm",
              "features/cocalc-jupyter2-timetravel-20170515-3x.mp4",
            ]}
            alt="Video showing the TimeTravel slider in a SageMath Jupyter notebook"
          >
            <Paragraph>
              <strong>
                <A href="https://doc.cocalc.com/time-travel.html">TimeTravel</A>
              </strong>{" "}
              is a powerful feature of the CoCalc platform. It records all your
              changes in your Jupyter notebook in fine detail. You can go back
              and forth in time across thousands of changes to see all previous
              edits.
            </Paragraph>
            <Paragraph>
              This allows you to easily recover anything from previous versions
              of your notebook by copy and pasting.
            </Paragraph>
            <Paragraph>
              You can also browse the entire process of creating the notebook
              from the start. This lets you discover how you arrived at a
              particular solution and see what you (or your students) tried to
              get there.
            </Paragraph>
          </Info>

          <Info
            anchor="a-nbgrader"
            title="nbgrader: automatically grading assignments"
            icon="graduation-cap"
            image={Nbgrader}
            alt="Creating an nbgrader-enhanced Jupyter notebook"
          >
            <Paragraph>
              CoCalc's Jupyter Notebooks fully support both{" "}
              <strong>automatic</strong> and <strong>manual grading</strong>!
            </Paragraph>
            <Paragraph>
              When using nbgrader, the teacher's notebook contains exercise
              cells for students and test cells, some of which students run to
              get immediate feedback. Once collected, you tell CoCalc to
              automatically run the full test suite across all student notebooks
              and tabulate the results.
            </Paragraph>
            <Paragraph>
              Learn more about{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                nbgrader in CoCalc
              </A>
              .{" "}
            </Paragraph>
          </Info>

          <ChatGPTFixError embedded={true} />

          <Info
            anchor="a-kernels"
            title="Managed Jupyter kernels"
            icon="python"
            image={JupyterKernels}
            alt="Dropdown menu showing a large number of preinstalled Jupyter kernels"
          >
            <Paragraph>
              CoCalc makes sure that your desired computational environment is
              available and ready to work with. Select from many pre-installed
              and <strong>fully managed kernels</strong>. You can also create
              your own{" "}
              <A href="https://doc.cocalc.com/howto/custom-jupyter-kernel.html">
                custom kernel
              </A>
              .
            </Paragraph>
            <Paragraph>
              Look at our <A href="/software">list of available software</A> for
              more about what is available.
            </Paragraph>
          </Info>

          <Info
            anchor="a-chat"
            title="Chat about your Jupyter notebook"
            icon="comment"
            image={JupyterChat}
            alt="Chatting about a Jupyter notebook"
          >
            <Paragraph>
              A{" "}
              <strong>
                <A href="https://doc.cocalc.com/chat.html">chat to the side</A>
              </strong>{" "}
              of each Jupyter notebook lets you discuss the content of your
              notebook with colleagues or students. You can drag and drop or
              paste images and files into chat, use <LaTeX /> math formulas, and
              fix typos in messages.
            </Paragraph>
            <Paragraph>
              Collaborators who are not online will be notified about new
              messages the next time they sign in or you can @mention them so
              they get emailed.
            </Paragraph>
            <Paragraph>
              Chat fully supports markdown formatting and <LaTeX /> formulas.{" "}
            </Paragraph>
          </Info>

          <Info
            anchor="a-kernels"
            title="JupyterLab and Jupyter Classic"
            icon="server"
            image={JupyterLab}
            alt="Running JupyterLab inside a CoCalc Project"
          >
            <Paragraph>
              CoCalc's Jupyter is a <strong>complete rewrite</strong> of the
              classical <A href="http://jupyter.org/">Jupyter notebook</A>{" "}
              interface and backend server. It is tightly integrated into CoCalc
              and adds realtime collaboration, TimeTravel history and{" "}
              <A href="http://blog.sagemath.com/jupyter/2017/05/05/jupyter-rewrite-for-smc.html">
                more
              </A>
              . This rewrite does not change the underlying Jupyter notebook
              file format; you can download your <code>*.ipynb</code> file at
              any time and continue working in another environment.
            </Paragraph>
            <Paragraph>
              In addition, CoCalc also{" "}
              <A href="https://doc.cocalc.com/jupyter.html#alternatives-plain-jupyter-server-and-jupyterlab-server">
                fully supports running
              </A>{" "}
              standard JupyterLab (with realtime collaboration enabled) and
              Jupyter Classic notebook servers from any CoCalc project! You can
              still use all libraries and extension that might rely on specifics
              of one of those implementations. Moreover,{" "}
              <strong>
                you can fully use your CoCalc project via the powerful
                JupyterLab interface!
              </strong>
            </Paragraph>
            <Paragraph>
              CoCalc also supports{" "}
              <A href="https://doc.cocalc.com/jupyter.html#collaboration-with-classical-jupyter">
                using Jupyter Classic with collaborative editing and chat
              </A>
              .
            </Paragraph>
          </Info>

          <Info
            anchor="a-monitoring"
            title="CPU and memory monitoring for each notebook"
            icon="line-chart"
            image={JupyterMem}
            alt="Jupyter notebook showing CPU and memory indicators"
          >
            <Paragraph>
              Long running notebook sessions or intense computations might
              deplete available CPU or memory resources. This slows down all
              calculations or even causes an unexpected termination of the
              current session.
            </Paragraph>
            <Paragraph>
              CoCalc's per-notebook CPU and memory indicators helps you to{" "}
              <strong>
                keep an eye on the notebook's memory and CPU consumption
              </strong>
              .
            </Paragraph>
            <Paragraph>
              You can even close your browser during long running computations,
              and check on the results later.{" "}
              <strong>Output will not be lost</strong> while your browser is
              closed.
            </Paragraph>
          </Info>

          <Backups />

          <Info
            anchor="a-publishing"
            title="Publishing your notebooks"
            icon="bullhorn"
            image={JupyterNasa}
            alt="Jupyter notebook hosted on the CoCalc share server"
          >
            <Paragraph>
              CoCalc helps you{" "}
              <A href="/share">
                <strong>share your work with the world</strong>
              </A>
              . It offers its own hosting of shared documents, which includes
              Jupyter notebooks and any other associated data files.
            </Paragraph>
            <Paragraph>
              Under the hood, CoCalc uses a novel renderer which generates a
              static HTML representation of your notebook (sanitized to prevent
              XSS attacks) on the server, which includes pre-rendered <LaTeX />{" "}
              formulas. This approach is very efficient and lightweight compared
              to solutions based on{" "}
              <A href="https://nbconvert.readthedocs.io">nbconvert</A>.{" "}
            </Paragraph>
          </Info>

          <Comparison
            name="jupyter"
            disclaimer
            title={
              <h2 style={{ textAlign: "center" }}>
                <Icon name="bolt" /> Jupyter notebooks in CoCalc versus the
                competition
              </h2>
            }
          />

          <SignIn startup="Jupyter" />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
