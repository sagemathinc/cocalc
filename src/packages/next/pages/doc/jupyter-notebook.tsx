import { Layout } from "antd";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import LaTeX from "components/landing/latex";
import Backups from "components/landing/backups";

import JupyterLogo from "/public/doc/jupyter-logo.svg";
import JupyterTF from "/public/doc/cocalc-jupyter2-20170508.png";
import RTC from "/public/doc/cocalc-real-time-jupyter.png";
import Nbgrader from "/public/doc/cocalc-jupyter-nbgrader-overview.png";
import JupyterChat from "/public/doc/cocalc-chat-jupyter-20171120-2.png";
import JupyterKernels from "/public/doc/cocalc-jupyter-kernels.png";
import JupyterLab from "/public/doc/jupyter-lab.png";
import JupyterMem from "/public/doc/cocalc-jupyter2-memory-cpu.png";
import JupyterNasa from "/public/doc/cocalc-jupyter-share-nasa.png";

export default function JupyterNotebook({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Online Jupyter Notebooks" />
      <Layout>
        <Header landing="jupyter-notebook" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={"Jupyter"}
              logo={JupyterLogo}
              title={"Online Jupyter Notebooks"}
              subtitle={
                "CoCalc's own collaborative, fully compatible and supercharged notebooks."
              }
              image={JupyterTF}
              alt={"Using Pandas and Tensorflow in a Jupyter notebook"}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h2>
                  No software setup: <small>100% online</small>
                </h2>
                <p>
                  CoCalc is an online web service where you can{" "}
                  <strong>
                    run <A href="http://jupyter.org/">Jupyter notebooks</A>{" "}
                    right inside your browser
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
                </p>
                <p>
                  You no longer have to worry about setting up your Python
                  environment, installing/updating/maintaining your libraries,
                  or backing up files. CoCalc manages everything for you!{" "}
                </p>
              </div>
            }
            col2={
              <div>
                <h2>Jupyter Notebooks made for teaching!</h2>
                <ul>
                  <li>
                    A sophisticated{" "}
                    <strong>
                      <A href="/doc/teaching">course management system</A>
                    </strong>{" "}
                    keeps track of all notebooks of all students. It manages
                    distributing and collecting files as well as grading.
                  </li>
                  <li>
                    CoCalc's Jupyter Notebooks fully support{" "}
                    <strong>automatic grading</strong>! The teacher's notebook
                    contains exercise cells for students and test cells, some of
                    which students can also run to get immediate feedback. Once
                    collected, you tell CoCalc to automatically run the full
                    test suite across all student notebooks and tabulate the
                    results. Learn more about{" "}
                    <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                      NBGrader
                    </A>
                    .
                  </li>
                </ul>

                <p>
                  CoCalc supports many kernels right out of the box: several
                  Python environments,{" "}
                  <A href="http://www.sagemath.org/">SageMath</A>,{" "}
                  <A href="http://www.r-project.org/">R Statistical Software</A>
                  , <A href="http://julialang.org">Julia</A> and many more.{" "}
                </p>
              </div>
            }
            ext="ipynb"
          />

          <SignIn startup="Jupyter" />

          <Info
            title="Collaborative editing"
            icon="users"
            image={RTC}
            anchor="a-realtimesync"
            alt={"Two browser windows editing the same Jupyter notebook"}
          >
            <p>
              You can share your Jupyter notebooks privately with project
              collaborators. All modifications are{" "}
              <strong>synchronized in real time</strong>, where you can see the
              cursors of others while they edit the document. You are also
              notified about the presence of collaborators.
            </p>
            <p>
              Even sliders, menus and knobs of{" "}
              <A href="https://ipywidgets.readthedocs.io/en/stable/examples/Widget%20Basics.html">
                interactive widgets
              </A>{" "}
              are synchronized among all collaborators.
            </p>
            <p>
              Additionally, the status and results of all computations in the
              currently running kernel session are also synchronized, because
              the session runs remotely in CoCalc's cluster.
            </p>
            <p>
              Together, everyone involved experiences the document in exactly
              the same way.
            </p>
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
              "cocalc-jupyter2-timetravel-20170515-3x.webm",
              "cocalc-jupyter2-timetravel-20170515-3x.mp4",
            ]}
            alt="Video showing the TimeTravel slider in a SageMath Jupyter notebook"
          >
            <p>
              The{" "}
              <strong>
                <A href="https://doc.cocalc.com/time-travel.html">
                  TimeTravel feature
                </A>
              </strong>{" "}
              is a powerful feature of the CoCalc platform. It records all your
              changes in your Jupyter notebook in fine detail. You can go back
              and forth in time across thousands of changes to see all previous
              edits.
            </p>
            <p>
              This allows you to easily recover anything from previous versions
              of your notebook by copy and pasting.
            </p>
            <p>
              You can also browse the entire process of creating the notebook
              from the start. This lets you discover how you arrived at a
              particular solution and see what you (or your student) tried
              before.
            </p>
          </Info>

          <Info
            anchor="a-nbgrader"
            title="NBGrader: automatically grading assignments in Jupyter notebooks"
            icon="graduation-cap"
            image={Nbgrader}
            alt="Creating an NBGrader-enhanced Jupyter notebook"
          >
            <p>
              CoCalc's Jupyter Notebooks fully support both{" "}
              <strong>automatic</strong> and <strong>manual grading</strong>!
            </p>
            <p>
              When using NBGrader, the teacher's notebook contains exercise
              cells for students and test cells, some of which students run to
              get immediate feedback. Once collected, you tell CoCalc to
              automatically run the full test suite across all student notebooks
              and tabulate the results.
            </p>
            <p>
              Learn more about{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                NBGrader in CoCalc
              </A>
              .{" "}
            </p>
          </Info>

          <Info
            anchor="a-chat"
            title="Chat about your Jupyter notebook"
            icon="comment"
            image={JupyterChat}
            alt="Chatting about a Jupyter notebook"
          >
            <p>
              A{" "}
              <strong>
                <A href="https://doc.cocalc.com/chat.html">chat to the side</A>
              </strong>{" "}
              of each Jupyter notebook lets you discuss the content of your
              notebook with colleagues or students. You can drag and drop or
              past images and files into chat, use <LaTeX /> math formulas, and
              fix typos in messages.
            </p>
            <p>
              Collaborators who are not online will be notified about new
              messages the next time they sign in or you can @mention them so
              they get emailed.
            </p>
            <p>
              Chat fully supports markdown formatting and <LaTeX /> formulas.{" "}
            </p>
          </Info>

          <Info
            anchor="a-kernels"
            title="Managed Jupyter kernels"
            icon="python"
            image={JupyterKernels}
            alt="Dropdown menu showing a large number of preinstalled Jupyter kernels"
          >
            <p>
              CoCalc makes sure that your desired computational environment is
              available and ready to work with. You just have to select from
              many pre-installed and <strong>fully managed kernels</strong> to
              start with your work. You can also create your own{" "}
              <A href="https://doc.cocalc.com/howto/custom-jupyter-kernel.html">
                custom kernel
              </A>
              .
            </p>
            <p>
              Look at our <A href="/doc/software">list of available software</A>{" "}
              for more about what is available.
            </p>
          </Info>

          <Info
            anchor="a-kernels"
            title="JupyterLab and Jupyter Classic"
            icon="server"
            image={JupyterLab}
            alt="Running JupyterLab inside a CoCalc Project"
            rows
          >
            <p>
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
            </p>
            <p>
              In addition, CoCalc also{" "}
              <A href="https://doc.cocalc.com/jupyter.html#alternatives-plain-jupyter-server-and-jupyterlab-server">
                fully supports running
              </A>{" "}
              standard JupyterLab and Jupyter Classic notebook servers from any
              CoCalc project! You can still use all libraries and extension that
              might rely on specifics of one of those implementations. Moreover,{" "}
              <strong>
                you can fully use your CoCalc project via the powerful
                JupyterLab interface!
              </strong>
            </p>
            <p>
              CoCalc also supports{" "}
              <A href="https://doc.cocalc.com/jupyter.html#collaboration-with-classical-jupyter">
                using Jupyter Classic with collaborative editing and chat
              </A>
              .
            </p>
          </Info>

          <Info
            anchor="a-monitoring"
            title="CPU and memory monitoring for each notebook"
            icon="line-chart"
            image={JupyterMem}
            alt="Jupyter notebook showing CPU and memory indicators"
          >
            <p>
              Long running notebook sessions or intense computations might
              deplete available CPU or memory resources. This slows down all
              calculations or even causes an unexpected termination of the
              current session.
            </p>
            <p>
              CoCalc's per-notebook CPU and memory indicators helps you to{" "}
              <strong>
                keep an eye on the notebook's memory and CPU consumption
              </strong>
              .{" "}
            </p>
            <p>
              You can even close your browser during long running computations,
              and check on the results later.{" "}
              <strong>Output will not be lost</strong> while your browser is
              closed.
            </p>
          </Info>

          <Backups />

          <Info
            anchor="a-publishing"
            title="Publishing your notebooks"
            icon="bullhorn"
            image={JupyterNasa}
            alt="Jupyter notebook hosted on the CoCalc share server"
          >
            <p>
              CoCalc helps you{" "}
              <A href="/share">
                <strong>share your work with the world</strong>
              </A>
              . It offers its own hosting of shared documents, which includes
              Jupyter notebooks and any other associated data files.
            </p>
            <p>
              Under the hood, CoCalc uses a novel renderer which generates a
              static HTML representation of your notebook (sanitized to prevent
              XSS attacks) on the server, which includes pre-rendered <LaTeX />{" "}
              formulas. This approach is very efficient and lightweight compared
              to solutions based on{" "}
              <A href="https://nbconvert.readthedocs.io">nbconvert</A>.{" "}
            </p>
          </Info>

          <SignIn startup="Jupyter" />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
