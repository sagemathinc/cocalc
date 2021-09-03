import Link from "next/link";
import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import A from "components/misc/A";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import Snapshots from "components/landing/snapshots";
import { Icon } from "@cocalc/frontend/components/icon";
import LaTeX from "components/landing/latex";
import Publishing from "components/landing/publishing";
import Code from "components/landing/code";

const component = "Python";
const title = `Run ${component} Online`;

export default function Octave({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={component}
              logo={`${component.toLowerCase()}-logo.svg`}
              title={title}
              subtitle={
                <>
                  <div>
                    Run {component} scripts,{" "}
                    <Link href="/doc/jupyter-notebook">
                      <a>Jupyter notebooks</a>
                    </Link>
                    , or even a{" "}
                    <Link href="/doc/x11">
                      <a>graphical application</a>
                    </Link>{" "}
                    in a full, remote {component} environment.
                  </div>
                </>
              }
              image={"frame-editor-python.png"}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h3>
                  <Icon name="global" /> CoCalc covers all the bases
                </h3>
                <ul>
                  <li>
                    <strong>Data Science and Machine Learning</strong>:{" "}
                    <A href="https://doc.cocalc.com/howto/upload.html">
                      Upload
                    </A>{" "}
                    your datafiles and analyze them using{" "}
                    <A href="https://www.tensorflow.org/">Tensorflow</A>,{" "}
                    <A href="https://scikit-learn.org/stable/">scikit-learn</A>,{" "}
                    <A href="https://keras.io/">Keras</A>, ... including an{" "}
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
                <p>
                  Find more details in the{" "}
                  <Link href="/doc/software-python">
                    <a>list of installed Python libraries</a>
                  </Link>
                  .
                </p>
              </div>
            }
            col2={
              <div>
                <h3>
                  <Icon name="lightbulb" /> Zero setup
                </h3>
                <ul>
                  <li>
                    Immediately start working by creating or{" "}
                    <A href="https://doc.cocalc.com/howto/upload.html">
                      uploading
                    </A>
                    ,{" "}
                    <Link href="/doc/jupyter-notebook">
                      <a>Jupyter Notebooks</a>
                    </Link>{" "}
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
                    <Link href="/doc/software-python">
                      <a>provides many packages</a>
                    </Link>
                    for you.
                  </li>
                  <li>
                    The{" "}
                    <Link href="/doc/latex-editor">
                      <a>LaTeX editor</a>
                    </Link>{" "}
                    is already integrated with{" "}
                    <A href="https://ctan.org/pkg/pythontex">PythonTeX</A> and{" "}
                    <A href="https://ctan.org/pkg/sagetex">SageTeX</A>.
                  </li>
                </ul>
              </div>
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
            image="cocalc-real-time-jupyter.png"
            anchor="a-collaboration"
          >
            <p>
              As the name suggests, CoCalc's strength is{" "}
              <strong>online code collaboration</strong>. Collaboration applies
              to editing plain Python files,{" "}
              <A href="https://doc.cocalc.com/sagews.html">Sage Worksheets</A>,{" "}
              <Link href="/doc/jupyter-notebook">
                <a>Jupyter Notebooks</a>
              </Link>
              , and much more.
            </p>
            <p>
              This enables you to work more effectively as a team to solve the
              challenges of data science, machine learning and statistics. Every
              collaborator is always looking at the most recent state of file,
              and they experience and inspect the same Python state.
            </p>
            <p>
              You can{" "}
              <A href="https://doc.cocalc.com/chat.html">create chatrooms</A>{" "}
              and get help via{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> by
              @mentioning collaborators.
            </p>
          </Info>

          <Info
            title="Python in Jupyter Notebooks"
            icon="ipynb"
            image="cocalc-python-jupyter.png"
            anchor="a-jupyternotebook"
          >
            <p>
              CoCalc offers a{" "}
              <strong>
                <Link href="/doc/jupyter-notebook">
                  <a>complete rewrite</a>
                </Link>
              </strong>{" "}
              of the classical{" "}
              <A href="http://jupyter.org/">Jupyter notebook</A> interface. It
              is tightly integrated into CoCalc and adds realtime collaboration,
              TimeTravel history and{" "}
              <A href="http://doc.cocalc.com/jupyter.html">more</A>.
            </p>
            <p>
              The user interface is very similar to Jupyter classic. It uses the
              same underlying Jupyter notebook file format, so you can download
              your <Code>*.ipynb</Code> file at any time and continue working
              locally.
            </p>
            <p>
              There are several{" "}
              <Link href="/doc/software-python">
                <a>Python environments available</a>
              </Link>
              .
            </p>
            <p>
              You can also easily run{" "}
              <A href="https://doc.cocalc.com/jupyter.html#classical-versus-cocalc">
                Jupyter Classical
              </A>{" "}
              and JupyterLab in any CoCalc project.
            </p>
          </Info>

          <SignIn startup={component} />

          <Info
            title={
              <>
                <LaTeX /> support for PythonTeX/SageTeX
              </>
            }
            icon="tex-file"
            image="cocalc-latex-pythontex.png"
            anchor="a-latex"
          >
            <div>
              The fully integrated{" "}
              <a href="./latex-editor.html">CoCalc latex editor</a> covers all
              your basic needs for working with <code>.tex</code> files
              containing{" "}
              <a href="https://github.com/gpoore/pythontex">PythonTeX</a> or{" "}
              <a href="http://doc.sagemath.org/html/en/tutorial/sagetex.html">
                SageTeX
              </a>{" "}
              code. The document is synchronized with your collaborators in
              real-time and everyone sees the very same compiled PDF.
            </div>
            <div>In particular, this LaTeX editor</div>
            <ul>
              <li>
                <strong>Manages the entire compilation pipeline for you</strong>
                : it automatically calls <code>pyhontex3</code> or{" "}
                <code>sage</code> to pre-process the code,
              </li>
              <li>
                Supports <strong>forward and inverse search</strong> to help you
                navigating in your document,
              </li>
              <li>
                Captures and shows you{" "}
                <strong>where LaTeX or Python errors happen</strong>,
              </li>
              <li>
                and via{" "}
                <a href="https://doc.cocalc.com/time-travel.html">TimeTravel</a>{" "}
                you can go back in time to see your latest edits in order to{" "}
                <strong>easily recover from a recent mistake</strong>.
              </li>
            </ul>
            <div>
              Combined, this means you can do{" "}
              <strong>your entire workflow online on CoCalc</strong>:
            </div>
            <ol>
              <li>
                <a href="https://doc.cocalc.com/howto/upload.html">Upload</a> or
                fetch your datasets,
              </li>
              <li>
                Use <a href="#a-jupyternotebook">Jupyter Notebooks</a> to
                explore the data, process it, and calculate your results,
              </li>
              <li>
                <a href="#a-chat">Discuss</a> and{" "}
                <a href="#a-collaboration">collaborate</a> with your research
                team,
              </li>
              <li>Write your research paper in a LaTeX document,</li>
              <li>
                <a href="#a-publishing">Publish</a> the datasets, your research
                code, and the PDF of your paper online, all hosted on CoCalc.{" "}
              </li>
            </ol>
          </Info>

          <Info
            title={"Code formatting"}
            icon="network-wired"
            image="cocalc-jupyter-format-python.gif"
            anchor="a-codeformatting"
          >
            <p>
              <strong>
                CoCalc has one-click code formatting for Jupyter notebooks and
                code files!
              </strong>
            </p>
            <p>
              Your python code is formatted in a clean and consistent way using{" "}
              <A href="https://github.com/google/yapf#yapf">yapf</A>.
            </p>
            <p>
              This reduces cognitive load reading source code, and ensures all
              code written by your team has a consistent and beautiful style.
            </p>
            <p>
              Python code formatting works with{" "}
              <strong>
                pure <code>.py</code> files
              </strong>{" "}
              and <strong>Jupyter Notebooks running a Python kernel</strong>.
            </p>
          </Info>

          <Info
            title={"Command line support"}
            icon="terminal"
            image="cocalc-frame-editor-python.png"
            anchor="a-commandline"
          >
            <p>
              Your existing Python scripts run on CoCalc. Either open a{" "}
              <A href="https://doc.cocalc.com/terminal.html">Terminal</A> in the
              code editor, or click the "Shell" button to open a Python command
              line.
            </p>
            <p>
              Terminals also gives you access to{" "}
              <A href="https://www.git-scm.com">git</A> and{" "}
              <Link href="/doc/software-executables">
                <a>many more utilities</a>
              </Link>
              .
            </p>
            <p>
              Regarding collaboration, terminals can be used{" "}
              <strong>by multiple users at once</strong>. This means you can
              work with your coworkers in the same session at the same time.
              Everyone sees the same output, and coordinate via{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> next to
              the terminal.
            </p>
            <p>You can also simultaneously work with many terminal sessions.</p>
            <p>
              For long-running programs, you can even close your browser and
              check on the result later.
            </p>
          </Info>

          <Info
            title={"Chatroom about your Python code"}
            icon="comment"
            image="cocalc-jupyter-python-sidechat.png"
            anchor="a-chat"
          >
            <p>
              Collaboration is a first class citizen on CoCalc. Use{" "}
              <A href="https://doc.cocalc.com/chat.html">side-chat</A> for each
              file to discuss content with your colleagues or students.
            </p>
            <p>
              Additionally, avatars give you{" "}
              <strong>presence information</strong> about who is currently also
              working on a file.
            </p>
            <p>
              Collaborators who are not online will be notified about new
              messages the next time they sign in.
            </p>
            <p>
              <A href="https://doc.cocalc.com/chat.html">Chat</A> also supports
              markdown formatting and <LaTeX /> formulas.
            </p>
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

export async function getServerSideProps() {
  return await withCustomize();
}
