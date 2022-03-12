import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import Snapshots from "components/landing/snapshots";
import Publishing from "components/landing/publishing";
import A from "components/misc/A";
import LaTeX from "components/landing/latex";
import { Icon } from "@cocalc/frontend/components/icon";
import Code from "components/landing/code";
import Contact from "components/landing/contact";
import Collaboration from "components/landing/collaboration";

import logo from "public/features/r-logo.svg";
import rJupyter from "public/features/cocalc-r-jupyter.png";
import rLatex from "public/features/cocalc-r-latex.png";
import rmdDemo from "public/features/cocalc-rmd-demo-R-python3-plotting.png";
import rcode from "public/features/cocalc-rcode.png";
import sidechat from "public/features/cocalc-r-side-chat.png";
import rEnvironment from "public/features/cocalc-r-environment.png";
import jupyterCollab from "public/features/cocalc-r-jupyter-collaborate.png";

const component = "R";
const title = `Run ${component} Online`;

export default function R({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={"R Statistical Software"} />
      <Layout>
        <Header page="features" subPage="r-statistical-software" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={component}
              logo={logo}
              title={title}
              subtitle={
                <>
                  Run <A href="https://www.r-project.org/">R code</A>,{" "}
                  <A href="#a-jupyternotebook">R in Jupyter notebooks</A>,
                  RMarkdown, or even{" "}
                  <A href="#a-latex">
                    Knitr/Rnw <LaTeX />
                  </A>{" "}
                  in a full, remote online R environment.
                </>
              }
              image={rJupyter}
              alt={"Use of R in Jupyter"}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h3>
                  <Icon name="cocalc-ring" style={{ marginRight: "10px" }} />
                  CoCalc makes working with R easy
                </h3>
                <p>
                  CoCalc handles all the tedious details for you, regardless of
                  whether you want to work on the{" "}
                  <A href="/features/terminal">command line</A>, run{" "}
                  <A href="#a-jupyternotebook">Jupyter Notebooks</A>, create
                  RMarkdown files, or use{" "}
                  <A href="#a-latex">
                    Knitr in <LaTeX /> documents
                  </A>
                  .
                </p>
                <p>
                  This page is about ways to use R in the{" "}
                  <A href="../">CoCalc platform</A>.
                </p>
              </div>
            }
            col2={
              <div>
                <h3>
                  <Icon name="lightbulb" style={{ marginRight: "10px" }} /> Zero
                  setup
                </h3>
                <ul>
                  <li>
                    No need for you to download and install{" "}
                    <A href="https://www.r-project.org/">R</A>.
                  </li>
                  <li>
                    CoCalc already{" "}
                    <A href="/software/r">provides many packages</A> for you.
                  </li>
                  <li>
                    The <A href="/features/latex-editor">LaTeX editor</A> is
                    already integrated with R.
                  </li>
                  <li>
                    You no longer have to maintain everything on your own.
                  </li>
                </ul>
                <div>
                  Start working by creating or{" "}
                  <A href="https://doc.cocalc.com/howto/upload.html">
                    uploading R files
                  </A>
                  , RMarkdown documents, or{" "}
                  <A href="/features/jupyter-notebook">Jupyter notebooks</A>.
                </div>
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
            title="R in Jupyter Notebooks"
            icon="ipynb"
            image={rJupyter}
            anchor="a-jupyternotebook"
            alt={"Using R via the Jupyter notebook"}
          >
            <p>
              CoCalc offers a{" "}
              <strong>
                <A href="/features/jupyter-notebook">complete rewrite</A>
              </strong>{" "}
              of the classical{" "}
              <A href="http://jupyter.org/">Jupyter notebook</A> interface. It
              is{" "}
              <A href="http://doc.cocalc.com/jupyter.html">
                tightly integrated into CoCalc
              </A>{" "}
              and adds real-time collaboration, TimeTravel history and more.
            </p>
            <p>
              There is also support in CoCalc for easily using R with the{" "}
              <A href="https://doc.cocalc.com/jupyter.html#classical-versus-cocalc">
                classical Jupyter notebook and JupyterLab.
              </A>
            </p>
          </Info>

          <Collaboration image={jupyterCollab} />

          <Info
            title={
              <>
                Extensive <LaTeX /> support for R
              </>
            }
            icon="tex"
            image={rLatex}
            anchor="a-latex"
            alt="Using Knitr in CoCalc to create an R-enhanced LaTeX document."
          >
            <p>
              The fully integrated{" "}
              <A href="/features/latex-editor">
                CoCalc <LaTeX /> editor
              </A>{" "}
              covers all your basic needs for working with <Code>.tex</Code>,{" "}
              <Code>.Rnw</Code> and <Code>.Rtex</Code> files. The document is
              synchronized with your collaborators in realtime and everyone sees
              the same compiled PDF. In particular, this <LaTeX /> editor
            </p>
            <ul>
              <li>Manages the entire compilation pipeline for you,</li>
              <li>
                Automatically processes{" "}
                <strong>
                  <Code>.Rnw</Code> and <Code>.Rtex</Code> files
                </strong>{" "}
                using{" "}
                <strong>
                  <A href="https://yihui.name/knitr/">Knitr</A>
                </strong>
                ,
              </li>
              <li>
                Supports{" "}
                <strong>
                  <A href="https://doc.cocalc.com/latex-features.html#forward-inverse-search">
                    forward and inverse search
                  </A>
                </strong>{" "}
                to help you navigating in your document,
              </li>
              <li>
                Captures and shows you{" "}
                <strong>
                  where each <LaTeX /> or R error happened
                </strong>
                ,
              </li>
              <li>
                and you can use
                <A href="https://doc.cocalc.com/time-travel.html">TimeTravel</A>
                to go back in time to see your latest edits and{" "}
                <strong>easily recover from a recent mistake</strong>.
              </li>
            </ul>
            <p>
              This means you can move{" "}
              <strong>your entire workflow online to CoCalc</strong>:
            </p>
            <ol>
              <li>
                <A href="https://doc.cocalc.com/howto/upload.html">Upload</A> or
                fetch your datasets,
              </li>
              <li>
                Use <A href="#a-jupyternotebook">Jupyter Notebooks</A> to
                explore the data and test your hypothesis,
              </li>
              <li>
                <A href="#a-chat">Discuss</A> and{" "}
                <A href="#a-collaboration">collaborate</A> with your research
                team,
              </li>
              <li>
                Write your research paper in an <Code>.Rtex</Code> or{" "}
                <Code>.Rnw</Code> document,
              </li>
              <li>
                <A href="#a-publishing">Publish</A> your datasets, your research
                code, and the PDF of your paper online, all hosted on CoCalc.{" "}
              </li>
            </ol>
          </Info>

          <Info
            title="RMarkdown support"
            icon="markdown"
            image={rmdDemo}
            anchor="a-rmarkdown"
            alt="An Rmarkdown document with a plot"
          >
            <p>
              <strong>
                You can edit{" "}
                <A href="https://rmarkdown.rstudio.com/">RMarkdown files</A> in
                CoCalc's code editor.
              </strong>
            </p>
            <p>
              The source file is processed according to the YAML-frontmatter
              configuration and the view of the generated file is automatically
              updated in an HTML or PDF panel.
            </p>
            <p>
              <strong>Syntax highlighting</strong> for markdown and embedded
              programming code—according to their language—makes it easy to
              visually understand the source file.
            </p>
            <p>
              <A href="https://doc.cocalc.com/project-library.html">
                CoCalc's library
              </A>{" "}
              features selected example files to get started quickly: e.g. HTML
              reports, article templates and a beamer presentation.
            </p>
          </Info>

          <Info
            title="Code formatting"
            icon="network-wired"
            video={[
              "features/cocalc-jupyter-r-format-cell.webm",
              "features/cocalc-jupyter-r-format-cell.mp4",
            ]}
            anchor="a-codeformatting"
            alt="Video showing formatting of R in a Jupyter notebook"
          >
            <p>
              <strong>CoCalc is able to format your R code.</strong>
            </p>
            <p>
              By simply clicking one button,{" "}
              <strong>
                your R source code is formatted in a clean and consistent way
              </strong>{" "}
              using the{" "}
              <A href="https://github.com/yihui/formatR#readme">
                formatR package
              </A>
              .
            </p>
            <p>
              This reduces cognitive load reading source code, brings everyone
              in the team on the same page, and reduces misunderstandings.
            </p>
            <p>
              R code formatting works with{" "}
              <strong>
                pure <code>.r</code> files
              </strong>{" "}
              and{" "}
              <strong>
                <A href="#a-jupyternotebook">Jupyter Notebooks</A> running an R
                kernel
              </strong>
              .{" "}
            </p>
          </Info>

          <Info
            title={"Command line support"}
            icon="terminal"
            image={rcode}
            anchor="a-commandline"
            alt="Using R from a command line terminal"
          >
            <p>
              All your existing R scripts run on the command line right in
              CoCalc.{" "}
              <A href="https://doc.cocalc.com/terminal.html">Open a Terminal</A>{" "}
              and you find yourself in a familiar Linux shell with a local
              filesystem for your data files, access to{" "}
              <A href="https://www.git-scm.com">Git</A> and{" "}
              <A href="/software/executables">a large number of commands...</A>{" "}
              <strong>Feel at home and run your analysis as usual!</strong>
            </p>
            <p>
              Terminals can be used <em>by multiple users at once</em>. This
              means you can work with your collaborators in the same session at
              the same time. Everyone sees the same output, and via{" "}
              <A href="https://doc.cocalc.com/chat.html">side chat</A> next to
              the terminal, the whole team can coordinate.
            </p>
            <p>
              Beyond that, you can simultaneously work with several terminal
              sessions. This gives you the ability to run your code
              concurrently.
            </p>
            <p>
              For long-running programs, you can even close your browser and
              check on the result later.
            </p>
          </Info>

          <Info
            title="Chatrooms and side chat"
            icon="comment"
            image={sidechat}
            anchor="a-chat"
            alt="Chatting about an R Jupyter notebook"
          >
            <p>
              Collaboration is a first class citizen on CoCalc. A{" "}
              <A href="https://doc.cocalc.com/chat.html">side-by-side chat</A>{" "}
              next to your R code, <LaTeX /> files and notebooks makes it easy
              to discuss content with your colleagues or students. You can also
              create dedicated chatrooms.
            </p>
            <p>Avatars show who is currently working on a file.</p>
            <p>
              Collaborators who are not online will be notified about new
              messages the next time they sign in.
            </p>
            <p>
              <A href="https://doc.cocalc.com/chat.html">Chat</A> also supports
              markdown formatting and <LaTeX /> formulas.
            </p>
          </Info>

          <Info
            title="Managed R Environment"
            icon="server"
            image={rEnvironment}
            anchor="a-environment"
            alt="Exploring the stack of installed R packages in a Jupyter notebook"
          >
            <p>
              CoCalc makes sure that the computational environment for R is
              regularly updated and ready to work with. Our goal is enabling you
              to get started with your analysis without any overhead.
            </p>
            <p>
              Look at our <A href="/software/r">list of available packages</A>{" "}
              in more detail. If something is missing, please tell us about it (
              <Contact lower />) so we can install that package globally.
            </p>
          </Info>

          <Publishing />

          <Snapshots />

          <Info
            title="TimeTravel"
            icon="history"
            video={[
              "features/cocalc-timetravel-r-jupyter-3x.webm",
              "features/cocalc-timetravel-r-jupyter-3x.mp4",
            ]}
            anchor="a-timetravel"
            alt="Video showing the time travel slider in an R Jupyter notebook"
          >
            <p>
              The{" "}
              <strong>
                <A href="https://doc.cocalc.com/time-travel.html">
                  TimeTravel feature
                </A>
              </strong>{" "}
              is specific to the CoCalc platform. It records all your changes in
              editable files like R source code, Jupyter notebook and <LaTeX />
              documents in fine detail. You can go back and forth in time across
              thousands of changes to recover your previous edits.
            </p>
            <p>
              This allows you to easily recover any part of any version of your
              file by copying and pasting. You can also see exactly what changed
              from one version to the next.
            </p>
            <p>
              You can visualize the entire process of creating a Jupyter
              notebook from the start. This lets you discover how you arrived at
              a particular solution and see what you (or your student) attempted
              before the final solution.
            </p>
          </Info>
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
