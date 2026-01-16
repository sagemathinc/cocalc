/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Code from "components/landing/code";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import LaTeX from "components/landing/latex";
import Pitch from "components/landing/pitch";
import Publishing from "components/landing/publishing";
import SignIn from "components/landing/sign-in";
import Snapshots from "components/landing/snapshots";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import CommandLineTerminal from "public/features/cocalc-frame-editor-python.png";
import FormatGIF from "public/features/cocalc-jupyter-format-python.gif";
import SideChatImage from "public/features/cocalc-jupyter-python-sidechat.png";
import CoCalcLaTeXPythonTex from "public/features/cocalc-latex-pythontex.png";
import CocalcPythonJupyter from "public/features/cocalc-python-jupyter.png";
import CollabRTC from "public/features/cocalc-real-time-jupyter.png";
import FrameEditorPython from "public/features/frame-editor-python.png";
import PythonLogo from "public/features/python-logo.svg";

const component = "Python";
const title = `Run ${component} Online`;

export default function Python({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="python" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            body={PythonLogo}
            title={title}
            subtitle={
              <>
                <div>
                  Run {component} scripts,{" "}
                  <A href="/features/jupyter-notebook">Jupyter notebooks</A>, or
                  even a <A href="/features/x11">graphical application</A> in a
                  full, remote {component} environment.
                </div>
              </>
            }
            subtitleBelow={true}
            image={FrameEditorPython}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>
                  <Icon name="global" /> CoCalc covers all the bases
                </Title>
                <Paragraph>
                  <ul>
                    <li>
                      <strong>Data Science and Machine Learning</strong>:{" "}
                      <A href="https://doc.cocalc.com/howto/upload.html">
                        Upload
                      </A>{" "}
                      your datafiles and analyze them using{" "}
                      <A href="https://www.tensorflow.org/">Tensorflow</A>,{" "}
                      <A href="https://scikit-learn.org/stable/">
                        scikit-learn
                      </A>
                      , <A href="https://keras.io/">Keras</A>, ... including an{" "}
                      <A href="https://www.anaconda.com/distribution/">
                        Anaconda
                      </A>{" "}
                      environment.
                    </li>
                    <li>
                      <strong>Mathematics</strong>:{" "}
                      <A href="https://www.sympy.org">SymPy</A>,{" "}
                      <A href="https://www.sagemath.org">SageMath</A>, ...
                    </li>
                    <li>
                      <strong>Statistics</strong>:{" "}
                      <A href="https://pandas.pydata.org/">pandas</A>,{" "}
                      <A href="https://www.statsmodels.org/">statsmodels</A>,{" "}
                      <A href="https://rpy2.github.io/">rpy2 (R bridge)</A>, ...
                    </li>
                    <li>
                      <strong>Visualization</strong>:{" "}
                      <A href="https://matplotlib.org/">matplotlib</A>,{" "}
                      <A href="https://plot.ly/python/plotly-fundamentals/">
                        plotly
                      </A>
                      , <A href="https://seaborn.pydata.org/">seaborn</A>, ...
                    </li>
                    <li>
                      <strong>Teaching</strong>: learn Python online or teach a
                      course.
                    </li>
                  </ul>
                </Paragraph>
                <Paragraph>
                  Find more details in the{" "}
                  <A href="/software/python">
                    list of installed Python libraries
                  </A>
                  .
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>
                  <Icon name="lightbulb" /> Zero setup
                </Title>
                <Paragraph>
                  <ul>
                    <li>
                      Immediately start working by creating or{" "}
                      <A href="https://doc.cocalc.com/howto/upload.html">
                        uploading
                      </A>
                      ,{" "}
                      <A href="/features/jupyter-notebook">Jupyter Notebooks</A>{" "}
                      or Python scripts.
                    </li>
                    <li>
                      No need to download and install{" "}
                      <A href="https://www.python.org">Python</A>,{" "}
                      <A href="https://www.anaconda.com/distribution/">
                        Anaconda
                      </A>
                      , or other Python environments.
                    </li>
                    <li>
                      CoCalc already{" "}
                      <A href="/software/python">provides many packages</A> for
                      you.
                    </li>
                    <li>
                      The <A href="/features/latex-editor">LaTeX editor</A> is
                      already integrated with{" "}
                      <A href="https://ctan.org/pkg/pythontex">PythonTeX</A> and{" "}
                      <A href="https://ctan.org/pkg/sagetex">SageTeX</A>.
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
            title="Collaborative workspaces"
            icon="users"
            image={CollabRTC}
            anchor="a-collaboration"
            alt="Editing a Jupyter notebook in two windows at the same time"
          >
            <Paragraph>
              As the name suggests, CoCalc's strength is{" "}
              <strong>online code collaboration</strong>. Collaboration applies
              to editing plain Python files,{" "}
              <A href="https://doc.cocalc.com/sagews.html">Sage Worksheets</A>,{" "}
              <A href="/features/jupyter-notebook">Jupyter Notebooks</A>, and
              much more.
            </Paragraph>
            <Paragraph>
              This enables you to work more effectively as a team to solve the
              challenges of data science, machine learning and statistics. Every
              collaborator is always looking at the most recent state of files,
              and they experience and inspect the same Python state.
            </Paragraph>
            <Paragraph>
              You can{" "}
              <A href="https://doc.cocalc.com/chat.html">create chatrooms</A>{" "}
              and get help via{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> by
              @mentioning collaborators.
            </Paragraph>
          </Info>

          <Info
            title="Python in Jupyter Notebooks"
            icon="ipynb"
            image={CocalcPythonJupyter}
            anchor="a-jupyternotebook"
            wide
            alt="Plotting using Matplotlib and Numpy in a Jupyter notebook"
          >
            <Paragraph>
              CoCalc offers a{" "}
              <strong>
                <A href="/features/jupyter-notebook">complete rewrite</A>
              </strong>{" "}
              of the classical{" "}
              <A href="http://jupyter.org/">Jupyter notebook</A> interface. It
              is tightly integrated into CoCalc and adds realtime collaboration,{" "}
              <A href="http://doc.cocalc.com/jupyter.html">
                TimeTravel history and much more
              </A>
              .
            </Paragraph>
            <Paragraph>
              The user interface is very similar to Jupyter classic. It uses the
              same underlying Jupyter notebook file format, so you can download
              your <Code>*.ipynb</Code> file at any time and continue working
              locally.
            </Paragraph>
            <Paragraph>
              There are several{" "}
              <A href="/software/python">Python environments available</A>.
            </Paragraph>
            <Paragraph>
              You can also easily run{" "}
              <A href="https://doc.cocalc.com/jupyter.html#classical-versus-cocalc">
                Jupyter Classical
              </A>{" "}
              and JupyterLab in any CoCalc project.
            </Paragraph>
          </Info>

          <SignIn startup={component} />

          <Info
            title={
              <>
                <LaTeX /> support for PythonTeX/SageTeX
              </>
            }
            icon="tex-file"
            image={CoCalcLaTeXPythonTex}
            anchor="a-latex"
            alt="Using PythonTex with LaTeX"
            wide
            below={
              <>
                <Paragraph>
                  Combined, this means you can do{" "}
                  <strong>your entire workflow online on CoCalc</strong>:
                </Paragraph>
                <Paragraph>
                  <ol>
                    <li>
                      <A href="https://doc.cocalc.com/howto/upload.html">
                        Upload
                      </A>{" "}
                      or fetch your datasets,
                    </li>
                    <li>
                      Use <A href="#a-jupyternotebook">Jupyter Notebooks</A> to
                      explore the data, process it, and calculate your results,
                    </li>
                    <li>
                      <A href="#a-chat">Discuss</A> and{" "}
                      <A href="#a-collaboration">collaborate</A> with your
                      research team,
                    </li>
                    <li>Write your research paper in a LaTeX document,</li>
                    <li>
                      <A href="#a-publishing">Publish</A> the datasets, your
                      research code, and the PDF of your paper online, all
                      hosted on CoCalc.{" "}
                    </li>
                  </ol>
                </Paragraph>
              </>
            }
          >
            <Paragraph>
              The fully integrated{" "}
              <A href="/features/latex-editor">CoCalc latex editor</A> covers
              all your basic needs for working with <Code>.tex</Code> files
              containing{" "}
              <A href="https://github.com/gpoore/pythontex">PythonTeX</A> or{" "}
              <A href="http://doc.sagemath.org/html/en/tutorial/sagetex.html">
                SageTeX
              </A>{" "}
              code. The document is synchronized with your collaborators in
              real-time and everyone sees the very same compiled PDF.
            </Paragraph>
            <Paragraph>In particular, this LaTeX editor</Paragraph>
            <Paragraph>
              <ul>
                <li>
                  <strong>
                    Manages the entire compilation pipeline for you
                  </strong>
                  : it automatically calls <Code>pythontex3</Code> or{" "}
                  <Code>sage</Code> to pre-process the code,
                </li>
                <li>
                  Supports <strong>forward and inverse search</strong> to help
                  you navigating in your document,
                </li>
                <li>
                  Captures and shows you{" "}
                  <strong>where LaTeX or Python errors happen</strong>,
                </li>
                <li>
                  and via{" "}
                  <A href="https://doc.cocalc.com/time-travel.html">
                    TimeTravel
                  </A>{" "}
                  you can go back in time to see your latest edits in order to{" "}
                  <strong>easily recover from a recent mistake</strong>.
                </li>
              </ul>
            </Paragraph>
          </Info>

          <Info
            title={"Code formatting"}
            icon="network-wired"
            image={FormatGIF}
            anchor="a-codeformatting"
            alt="Video of formatting Python code in a Jupyter notebook with 1 click"
          >
            <Paragraph>
              <strong>
                CoCalc has one-click code formatting for Jupyter notebooks and
                code files!
              </strong>
            </Paragraph>
            <Paragraph>
              Your python code is formatted in a clean and consistent way using{" "}
              <A href="https://github.com/google/yapf#yapf">yapf</A>.
            </Paragraph>
            <Paragraph>
              This reduces cognitive load reading source code, and ensures all
              code written by your team has a consistent and beautiful style.
            </Paragraph>
            <Paragraph>
              Python code formatting works with{" "}
              <strong>
                pure <code>.py</code> files
              </strong>{" "}
              and <strong>Jupyter Notebooks running a Python kernel</strong>.
            </Paragraph>
          </Info>

          <Info
            title={"Command line support"}
            icon="terminal"
            image={CommandLineTerminal}
            anchor="a-commandline"
            alt="Using scikit learn from the command line to run Python code"
          >
            <Paragraph>
              Your existing Python scripts run on CoCalc. Either open a{" "}
              <A href="https://doc.cocalc.com/terminal.html">Terminal</A> in the
              code editor, or click the "Shell" button to open a Python command
              line.
            </Paragraph>
            <Paragraph>
              Terminals also give you access to{" "}
              <A href="https://www.git-scm.com">git</A> and{" "}
              <A href="/software/executables">many more utilities</A>.
            </Paragraph>
            <Paragraph>
              Regarding collaboration, terminals can be used{" "}
              <strong>by multiple users at once</strong>. This means you can
              work with your coworkers in the same session at the same time.
              Everyone sees the same output, and coordinate via{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> next to
              the terminal.
            </Paragraph>
            <Paragraph>
              You can also simultaneously work with many terminal sessions.
            </Paragraph>
            <Paragraph>
              For long-running programs, you can even close your browser and
              check on the result later.
            </Paragraph>
          </Info>

          <Info
            title={"Chatroom about your Python code"}
            icon="comment"
            image={SideChatImage}
            anchor="a-chat"
            alt="A Jupyter notebook with a chat window on the side"
          >
            <Paragraph>
              Collaboration is a first class citizen on CoCalc. Use{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> for each
              file to discuss content with your colleagues or students.
            </Paragraph>
            <Paragraph>
              Additionally, avatars give you{" "}
              <strong>presence information</strong> about who is currently also
              working on a file.
            </Paragraph>
            <Paragraph>
              Collaborators who are not online will be notified about new
              messages the next time they sign in.
            </Paragraph>
            <Paragraph>
              <A href="https://doc.cocalc.com/chat.html">Chat</A> also supports
              markdown formatting and <LaTeX /> formulas.
            </Paragraph>
          </Info>

          <Publishing />

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
