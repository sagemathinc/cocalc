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
import Publishing from "components/landing/publishing";
import Head from "components/landing/head";
import LaTeX from "components/landing/latex";
import Backups from "components/landing/backups";
import Collaboration from "components/landing/collaboration";
import Code from "components/landing/code";

import Logo from "public/doc/latex-logo.svg";
import LatexEditorImage from "public/doc/cocalc-latex-editor-2019.png";
import CustomCommand from "public/doc/latex-custom-command-02.png";
import Sagetex from "public/doc/cocalc-sagetex.png";
import Pythontex from "public/doc/cocalc-pythontex.png";
import Knitr from "public/doc/latex-editor-rnw-01.png";
import LatexTimetravel from "public/doc/latex-editor-timetravel-01.png";
import Sidechat from "public/doc/cocalc-latex-side-chat-v2.png";

export default function LatexEditor({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Online LaTeX Editor" />
      <Layout>
        <Header landing="latex-editor" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={<LaTeX />}
              logo={Logo}
              title={"Online LaTeX Editor"}
              subtitle={
                "Focus on writing LaTeX.  CoCalc takes care of everything else."
              }
              image={LatexEditorImage}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h2>
                  No software install required: <small>100% online</small>
                </h2>
                <p>
                  CoCalc's{" "}
                  <A href="https://doc.cocalc.com/latex.html">
                    <LaTeX /> editor
                  </A>{" "}
                  supports
                </p>
                <ul>
                  <li>
                    <strong>side-by-side preview</strong> with{" "}
                    <strong>forward and inverse search</strong>,
                  </li>
                  <li>
                    compiles upon saving and marks errors in the source file,
                  </li>
                  <li>
                    periodically <a href="#a-backups">backups</a> all your
                    files,
                  </li>
                  <li>
                    <strong>
                      <a href="#a-calculations">runs embedded calculations</a>
                    </strong>{" "}
                    right inside your document,
                  </li>
                  <li>
                    <strong>
                      <A href="https://doc.cocalc.com/latex-features.html#latex-multi-file-support">
                        multi-file support
                      </A>
                    </strong>{" "}
                    that discovers included files automatically, and
                  </li>
                  <li>
                    every{" "}
                    <strong>
                      <a href="#a-timetravel">change is recorded</a>
                    </strong>{" "}
                    while you type.
                  </li>
                </ul>
              </div>
            }
            col2={
              <div>
                <h2>
                  Working with <LaTeX /> made easy
                </h2>
                <dl>
                  <dt>
                    Tired of sending changes back and forth with your
                    colleagues?
                  </dt>
                  <dd>
                    <strong>
                      <a href="#a-realtimesync">Collaborate online</a>
                    </strong>{" "}
                    without any limits!
                  </dd>
                  <dt>Scared of breaking a document?</dt>
                  <dd>
                    Revert recent changes via{" "}
                    <a href="#a-timetravel">time-travel</a> edit history.
                  </dd>
                  <dt>
                    Worried about maintaining your <LaTeX /> environment?
                  </dt>
                  <dd>CoCalc takes care of everything.</dd>
                  <dt>Want to work from anywhere?</dt>
                  <dd>
                    You only need a web-browser and Internet access, or you can{" "}
                    <A href="https://github.com/sagemathinc/cocalc-docker#readme">
                      run your own server.
                    </A>
                  </dd>
                </dl>
              </div>
            }
            ext="tex"
          />

          <SignIn startup={<LaTeX />} />

          <Info
            anchor="a-environments"
            icon="tex-file"
            title={
              <>
                Managed <LaTeX /> environments
              </>
            }
            image={CustomCommand}
            alt="Menu showing the different LaTeX engines in CoCalc"
          >
            <p>
              CoCalc makes sure that your desired <LaTeX /> engine is available
              and ready to use. You can choose between{" "}
              <strong>
                <A href="http://www.tug.org/applications/pdftex/">PDF Latex</A>
              </strong>
              ,{" "}
              <strong>
                <A href="http://xetex.sourceforge.net/">XeLaTeX</A>
              </strong>{" "}
              or{" "}
              <strong>
                <A href="http://www.luatex.org/">LuaTeX</A>
              </strong>
              .
            </p>
            <p>
              Many packages and utilities like{" "}
              <A href="https://sourceforge.net/projects/pgf/">PGF and TikZ</A>{" "}
              are pre-installed.
            </p>
            <p>
              Behind the scenes,{" "}
              <A href="http://mg.readthedocs.io/latexmk.html">LatexMK</A> is
              configured to manage the compilation process, which means that you
              do not have to bother too much about any additional configuration.
            </p>
            <p>
              Besides that, it is possible to{" "}
              <strong>fully customize the compilation command</strong>. This
              means you can bring your own shell script or Makefile!{" "}
            </p>
          </Info>

          <Collaboration image="cocalc-latex-concurrent-editing.png" />

          <Info
            anchor="a-computational"
            icon="laptop"
            title="Full computational environment"
            image={LatexEditorImage}
            alt="Two browser windows editing the same LaTeX file"
            rows
          >
            <p>
              One thing that sets CoCalc apart from other online <LaTeX />{" "}
              editors is <strong>full access to computational software</strong>.
              This means you can seamlessly transition from <em>computing</em>{" "}
              your results to <em>publishing</em> them.
            </p>
            <p>
              CoCalc supports running{" "}
              <A href="https://www.python.org">Python</A>,{" "}
              <A href="http://www.sagemath.org/">SageMath</A>,{" "}
              <A href="http://www.r-project.org/">R Statistical Software</A>,{" "}
              <A href="http://julialang.org">Julia</A>, and more in the same
              project as your <LaTeX /> document.
            </p>
            <p>
              Consult the <A href="/doc/software">Available Software page</A> or
              look at our{" "}
              <A href="/doc/jupyter-notebook">Jupyter Notebook page</A> for more
              information.{" "}
            </p>
          </Info>

          <Info.Heading description={"Easy to use together in CoCalc!"}>
            SageMath + Python + R + <LaTeX />
          </Info.Heading>

          <Info
            anchor="a-calculations"
            title={
              <>
                Run calculations inside your <LaTeX /> documents!
              </>
            }
            alt="A LaTeX document with embedded SageMath code"
          >
            Embed Sage, R, or Python code in your document to automatically
            generate text, plots, formulas or tables. The code is evaluated as
            part of the compilation process and the output will be included in
            the generated document.
          </Info>

          <Info
            anchor="a-sagetex"
            title="SageTex"
            icon="sagemath"
            image={Sagetex}
            alt="Editing LaTeX with SageTex code"
          >
            <p>
              <strong>
                <A href="http://doc.sagemath.org/html/en/tutorial/sagetex.html">
                  SageTeX
                </A>{" "}
                lets you embed <A href="https://www.sagemath.org/">SageMath</A>{" "}
                in your document!
              </strong>
            </p>
            <p>
              Write Sage commands like{" "}
              <Code>
                \sage{"{"}2 + 3{"}"}
              </Code>{" "}
              in <LaTeX /> and the document will contain "5",{" "}
              <Code>
                \sage{"{"}f.taylor(x, 0, 10){"}"}
              </Code>{" "}
              for the Taylor expansion of a function <em>f</em>, and drawing
              graphs becomes as simple as{" "}
              <Code>
                \sageplot{"{"}sin(x^2){"}"}
              </Code>
              .
            </p>
            <p>
              <strong>
                CoCalc deals with all the underlying details for you:
              </strong>
            </p>
            <ul>
              <li>It runs the initial compilation pass,</li>
              <li>
                uses <A href="https://www.sagemath.org/">SageMath</A> to compute
                the text output, graphs and images,
              </li>
              <li>
                and then runs a second compilation pass to produce the final PDF
                output.
              </li>
            </ul>
          </Info>

          <Info
            anchor="a-pythontex"
            title="PythonTex"
            icon="python"
            image={Pythontex}
            alt="Editing LaTeX with PythonTex code"
          >
            <p>
              <strong>
                <A href="https://ctan.org/pkg/pythontex">PythonTeX</A> allows
                you to run Python from within a document and typeset the
                results.
              </strong>
            </p>
            <p>
              For example,{" "}
              <Code>
                \py{"{"}2 + 4**2{"}"}
              </Code>{" "}
              produces "18". You can use all{" "}
              <A href="/doc/software-python">available python libraries</A> for
              Python 3, drawing plots via <code>pylab</code>, and use
              PythonTeX's SymPy support.
            </p>
            <p>
              Again, CoCalc automatically detects that you want to run PythonTeX
              and handles all the details for you.{" "}
            </p>
          </Info>

          <Info
            anchor="a-knitr"
            title="R/Knitr"
            icon="r"
            image={Knitr}
            alt="Editing LaTeX with R/Knitr code"
          >
            <p>
              CoCalc's Latex editor also supports{" "}
              <strong>
                <A href="https://yihui.name/knitr/">Knitr</A>
              </strong>{" "}
              documents (with filename extension <code>.Rnw</code>). This gives
              you the ability to embed arbitrary{" "}
              <A href="https://www.r-project.org/">R Software</A> commands and
              plots in your <LaTeX /> file.
            </p>
            <p>
              Behind the scenes, CoCalc deals with all underlying details for
              you:
            </p>
            <ul>
              <li>
                installation and management of{" "}
                <A href="/doc/software-r">all R packages</A>,
              </li>
              <li>
                orchestrates the full compilation pipeline for <LaTeX /> and
                running R, and
              </li>
              <li>
                reconciles the line-numbers of the .Rnw file with the
                corresponding .tex document for correct{" "}
                <A href="#a-forwardinverse">
                  <strong>forward and inverse search</strong>
                </A>
                .{" "}
              </li>
            </ul>
          </Info>

          <Info.Heading
            description={
              <>
                The following are some specific features of editing <LaTeX /> in
                CoCalc.
                <br />
                There is also more{" "}
                <A href="https://doc.cocalc.com/latex.html">
                  comprehensive documentation
                </A>
                .
              </>
            }
          >
            <LaTeX /> Editing Features
          </Info.Heading>

          <Info
            anchor="a-forwardinverse"
            title="Forward and Inverse search"
            icon="sync"
            video={[
              "latex-forward-inverse-02.webm",
              "latex-forward-inverse-02.mp4",
            ]}
            rows
            alt="Video showing forward and inverse search in a LaTeX document"
          >
            <p>Let CoCalc help you find your way around in large documents!</p>
            <p>
              <strong>Forward Search</strong> lets you jump from the <LaTeX />{" "}
              source to the corresponding part in the rendered preview. This
              saves you time looking for the output.
            </p>
            <p>
              <strong>Inverse search</strong> does the opposite: double click on
              the output and your cursor jumps to the line in the source file
              for that output.
            </p>
            <p>
              Under the hood, CoCalc uses{" "}
              <A href="https://github.com/jlaurens/synctex">SyncTeX</A>{" "}
              seamlessly.
            </p>
          </Info>

          <Info
            anchor="a-timetravel"
            title="TimeTravel"
            icon="history"
            image={LatexTimetravel}
            alt={
              "Using the TimeTravel slider to see what changed in a LaTeX document"
            }
          >
            <p>
              The{" "}
              <strong>
                <A href="/doc/time-travel">TimeTravel feature</A>
              </strong>{" "}
              is specific to the CoCalc platform. It records all changes in the{" "}
              <LaTeX /> notebook in fine detail. You can go back and forth in
              time using a slider across thousands of changes to recover your
              previous edits.
            </p>
            <p>
              This is especially helpful for pinpointing which of the recent
              changes caused a <strong>compilation error</strong>. You can see
              the recent changes and exactly where the modifications happened,
              and who made them.
            </p>
          </Info>

          <Info
            anchor="a-chat"
            title="Side Chat"
            icon="comment"
            image={Sidechat}
            alt="Chatting about a LaTeX document right next to that document"
          >
            <p>
              A{" "}
              <strong>
                <A href="https://doc.cocalc.com/chat.html">side-by-side chat</A>
              </strong>{" "}
              for each <LaTeX /> file lets you discuss your content with
              collaborators or give feedback to your students while they are
              working on their assignments.
            </p>
            <p>
              Collaborators who are offline will be notified about new messages
              the next time they sign in. If you @mention them, they receive an
              email notification.
            </p>
            <p>
              Chat messages also support{" "}
              <A href="https://en.wikipedia.org/wiki/Markdown">Markdown</A>{" "}
              formatting with <LaTeX /> formulas.{" "}
            </p>
          </Info>

          <Backups />
          <Publishing />
          <SignIn startup={<LaTeX />} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}
