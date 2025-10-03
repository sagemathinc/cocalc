/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Descriptions, Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { DARK_MODE_ICON } from "@cocalc/util/consts/ui";

import Backups from "components/landing/backups";
import Code from "components/landing/code";
import Collaboration from "components/landing/collaboration";
import Comparison from "components/landing/compare";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import LaTeX from "components/landing/latex";
import Pitch from "components/landing/pitch";
import Publishing from "components/landing/publishing";
import SignIn from "components/landing/sign-in";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";

import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import LatexCollab from "public/features/latex-editor-realtime-sync-20251003.png";
import Sidechat from "public/features/cocalc-latex-side-chat-v2.png";
import Pythontex from "public/features/cocalc-pythontex.png";
import Sagetex from "public/features/cocalc-sagetex.png";
import AIFormula from "public/features/latex-ai-formula.png";
import CustomCommand from "public/features/latex-custom-command-02.png";
import LatexDarkMode from "public/features/latex-editor-darkmode-20251003.png";
import LatexEditorImage from "public/features/latex-editor-main-20251003.png";
import Knitr from "public/features/latex-editor-rnw-01.png";
import LatexTimetravel from "public/features/latex-editor-timetravel-01.png";
import Logo from "public/features/latex-logo.svg";
import LatexPythontex from "public/features/latex-editor-pythontex-20251003.png";

export default function LatexEditor({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Online LaTeX Editor" />
      <Layout>
        <Header page="features" subPage="latex-editor" />
        <Layout.Content>
          <Content
            landing
            startup={<LaTeX />}
            body={Logo}
            title={"Online LaTeX Editor"}
            subtitle={
              <>
                Focus on writing LaTeX. CoCalc takes care of everything else.
                {/*<hr />
                <A href="https://about.cocalc.com/2023/01/13/cocalcs-online-latex-editor/">
                  Learn much more about LaTeX in CoCalc from this new blog
                  post...
                </A> */}
              </>
            }
            image={LatexEditorImage}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>
                  No software install required: <small>100% online</small>
                </Title>
                <Paragraph>
                  CoCalc{"'"}s{" "}
                  <A href="https://doc.cocalc.com/latex.html">
                    <LaTeX /> editor
                  </A>{" "}
                  supports
                </Paragraph>
                <Paragraph>
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
                      an{" "}
                      <strong>
                        <a href="#a-ai-formula">AI-powered formula assistant</a>
                      </strong>{" "}
                      typsets formulas for you
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
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>
                  Working with <LaTeX /> made easy
                </Title>
                <Paragraph>
                  <Descriptions
                    layout="vertical"
                    bordered
                    column={1}
                    size={"small"}
                  >
                    <Descriptions.Item
                      label="Tired of sending changes back and forth with your
                      colleagues?"
                    >
                      <strong>
                        <a href="#a-realtimesync">Collaborate online</a>
                      </strong>{" "}
                      without any limits!
                    </Descriptions.Item>

                    <Descriptions.Item label="Scared of breaking a document?">
                      Revert recent changes using{" "}
                      <a href="#a-timetravel">TimeTravel</a>.
                    </Descriptions.Item>

                    <Descriptions.Item
                      label={
                        <>
                          Worried about maintaining your <LaTeX /> environment?
                        </>
                      }
                    >
                      CoCalc takes care of everything.
                    </Descriptions.Item>

                    <Descriptions.Item label="Want to work from anywhere?">
                      You only need a web browser and Internet access, or you
                      can <A href="/pricing/onprem">run your own server.</A>
                    </Descriptions.Item>
                  </Descriptions>
                </Paragraph>
              </>
            }
            ext="tex"
          />

          <SignIn startup={<LaTeX />} />

          <Collaboration image={LatexCollab} />

          <Info
            anchor="a-ai-formula"
            icon="robot"
            title="AI-powered formula assistant"
            image={AIFormula}
            alt="Generate LaTeX formulas based on a human readable descriptions via AI"
          >
            <Paragraph>
              CoCalc's extensive integation with various AI language models
              helps you typesetting formulas.
            </Paragraph>
            <Paragraph>
              You enter a description of your desired formula and{" "}
              <strong>
                a language model of your choice transforms it into a proper
                LaTeX formula
              </strong>
              . The descriptions can come in various ways:
              <Descriptions
                layout="vertical"
                bordered
                column={1}
                size={"small"}
              >
                <Descriptions.Item label="Natural language description">
                  <Text code>drake equation</Text>
                </Descriptions.Item>

                <Descriptions.Item label="simple algebraic notation">
                  <Text code>(a+b)^2 = a^2 + 2 a b + b^2</Text>
                </Descriptions.Item>

                <Descriptions.Item label="Or a combination of both">
                  <Text code>
                    integral from 0 to infinity of (1+sin(x))/x^2 dx
                  </Text>
                </Descriptions.Item>
              </Descriptions>
            </Paragraph>
            <Paragraph>
              Once you got a result you like, click on "Insert" the formula is
              in your document.
            </Paragraph>
          </Info>

          <Info
            anchor="a-computational"
            icon="laptop"
            title="Full computational environment"
            image={LatexPythontex}
            alt="Two browser windows editing the same LaTeX file"
            wide
          >
            <Paragraph>
              One thing that sets CoCalc apart from other online <LaTeX />{" "}
              editors is <strong>full access to computational software</strong>.
              This means you can seamlessly transition from <em>computing</em>{" "}
              your results to <em>publishing</em> them.
            </Paragraph>
            <Paragraph>
              CoCalc supports running <A href="/features/python">Python</A>,{" "}
              <A href="http://www.sagemath.org/">SageMath</A>,{" "}
              <A href="/features/r-statistical-software">
                R Statistical Software
              </A>
              , <A href="/features/julia">Julia</A>, and more in the same
              project as your <LaTeX /> document.
            </Paragraph>
            <Paragraph>
              Consult the <A href="/software">Available Software page</A> or
              look at our{" "}
              <A href="/features/jupyter-notebook">Jupyter Notebook page</A> for
              more information.{" "}
            </Paragraph>
          </Info>

          <Info
            anchor="a-calculations"
            textStyleExtra={{ background: "inherit" }}
            title={
              <>
                Run SageMath, Python, or R in <LaTeX />
              </>
            }
            alt="A LaTeX document with embedded SageMath code"
          >
            <Paragraph>
              You can run calculations inside your <LaTeX /> documents! It's
              possible to embed Sage, R, or Python code in your document to
              automatically generate text, plots, formulas or tables. The code
              is evaluated as part of the compilation process and the output
              will be included in the generated document.
            </Paragraph>
          </Info>

          <Info
            anchor="a-sagetex"
            title="SageTex"
            icon="sagemath"
            image={Sagetex}
            alt="Editing LaTeX with SageTex code"
          >
            <Paragraph>
              <strong>
                <A href="http://doc.sagemath.org/html/en/tutorial/sagetex.html">
                  SageTeX
                </A>{" "}
                lets you embed <A href="https://www.sagemath.org/">SageMath</A>{" "}
                in your document!
              </strong>
            </Paragraph>
            <Paragraph>
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
            </Paragraph>
            <Paragraph>
              <strong>
                CoCalc deals with all the underlying details for you:
              </strong>
            </Paragraph>
            <Paragraph>
              <ul>
                <li>It runs the initial compilation pass,</li>
                <li>
                  uses <A href="https://www.sagemath.org/">SageMath</A> to
                  compute the text output, graphs and images,
                </li>
                <li>
                  and then runs a second compilation pass to produce the final
                  PDF output.
                </li>
              </ul>
            </Paragraph>
          </Info>

          <Info
            anchor="a-pythontex"
            title="PythonTex"
            icon="python"
            image={Pythontex}
            alt="Editing LaTeX with PythonTex code"
          >
            <Paragraph>
              <strong>
                <A href="https://ctan.org/pkg/pythontex">PythonTeX</A> allows
                you to run Python from within a document and typeset the
                results.
              </strong>
            </Paragraph>
            <Paragraph>
              For example,{" "}
              <Code>
                \py{"{"}2 + 4**2{"}"}
              </Code>{" "}
              produces "18". You can use all{" "}
              <A href="/software/python">available python libraries</A> for
              Python 3, drawing plots via <code>pylab</code>, and use
              PythonTeX's SymPy support.
            </Paragraph>
            <Paragraph>
              Again, CoCalc automatically detects that you want to run PythonTeX
              and handles all the details for you.{" "}
            </Paragraph>
          </Info>

          <Info
            anchor="a-knitr"
            title="R/Knitr"
            icon="r"
            image={Knitr}
            alt="Editing LaTeX with R/Knitr code"
          >
            <Paragraph>
              CoCalc's <LaTeX /> editor also supports{" "}
              <strong>
                <A href="https://yihui.name/knitr/">Knitr</A>
              </strong>{" "}
              documents (with filename extension <code>.Rnw</code>). This gives
              you the ability to embed arbitrary{" "}
              <A href="https://www.r-project.org/">R Software</A> commands and
              plots in your <LaTeX /> file.
            </Paragraph>
            <Paragraph>
              Behind the scenes, CoCalc deals with all underlying details for
              you:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>
                  installation and management of{" "}
                  <A href="/software/r">all R packages</A>,
                </li>
                <li>
                  orchestrates the full compilation pipeline for <LaTeX /> and
                  running R, and
                </li>
                <li>
                  reconciles the line numbers of the .Rnw file with the
                  corresponding .tex document for correct{" "}
                  <A href="#a-forwardinverse">
                    <strong>forward and inverse search</strong>
                  </A>
                  .{" "}
                </li>
              </ul>
            </Paragraph>
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
              "features/latex-forward-inverse-02.webm",
              "features/latex-forward-inverse-02.mp4",
            ]}
            wide
            alt="Video showing forward and inverse search in a LaTeX document"
          >
            <Paragraph>
              Let CoCalc help you find your way around in large documents!
            </Paragraph>
            <Paragraph>
              <strong>Forward Search</strong> lets you jump from the <LaTeX />{" "}
              source to the corresponding part in the rendered preview. This
              saves you time looking for the output.
            </Paragraph>
            <Paragraph>
              <strong>Inverse search</strong> does the opposite: double click on
              the output and your cursor jumps to the line in the source file
              for that output.
            </Paragraph>
            <Paragraph>
              Under the hood, CoCalc uses{" "}
              <A href="https://github.com/jlaurens/synctex">SyncTeX</A>{" "}
              seamlessly.
            </Paragraph>
          </Info>

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
            <Paragraph>
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
            </Paragraph>
            <Paragraph>
              Many packages and utilities like{" "}
              <A href="https://sourceforge.net/projects/pgf/">PGF and TikZ</A>{" "}
              are pre-installed.
            </Paragraph>
            <Paragraph>
              Behind the scenes,{" "}
              <A href="http://mg.readthedocs.io/latexmk.html">LatexMK</A> is
              configured to manage the compilation process.
            </Paragraph>
            <Paragraph>
              It is also possible to{" "}
              <strong>fully customize the compilation command</strong>, so you
              can bring your own shell script or even use a Makefile!
            </Paragraph>
          </Info>

          <Info
            anchor="a-darkmode"
            icon={
              <Icon style={{ fontSize: "40px" }} unicode={DARK_MODE_ICON} />
            }
            title={"Dark Mode with PDF Support"}
            image={LatexDarkMode}
          >
            <Paragraph>
              If you like working in{" "}
              <span
                style={{
                  background: "black",
                  color: "white",
                  padding: "2px 5px",
                }}
              >
                Dark Mode
              </span>
              , feel welcome to CoCalc as well!
            </Paragraph>
            <Paragraph>
              {" "}
              The <LaTeX /> editor not only supports the usual dark mode
              funcionality, but also styling the PDF. This means despite that
              your resulting PDF will be on a white page, you see it with a dark
              page and bright font characters.{" "}
            </Paragraph>
            <Paragraph>
              There is also a button to quickly disable the PDF dark mode, to
              double check the actual output.
            </Paragraph>
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
            <Paragraph>
              The <strong>TimeTravel feature</strong> is specific to the CoCalc
              platform. It records all changes in the document in fine detail.
              You can go back and forth in time using a slider across thousands
              of changes to recover your previous edits.
            </Paragraph>
            <Paragraph>
              This is especially helpful for pinpointing which of the recent
              changes caused a <strong>compilation error</strong>. You can see
              the recent changes and exactly where the modifications happened,
              and who made them.
            </Paragraph>
          </Info>

          <Info
            anchor="a-chat"
            title="Side Chat"
            icon="comment"
            image={Sidechat}
            alt="Chatting about a LaTeX document right next to that document"
          >
            <Paragraph>
              A{" "}
              <strong>
                <A href="https://doc.cocalc.com/chat.html">side-by-side chat</A>
              </strong>{" "}
              for each <LaTeX /> file lets you discuss your content with
              collaborators or give feedback to your students while they are
              working on their assignments.
            </Paragraph>
            <Paragraph>
              Collaborators who are offline will be notified about new messages
              the next time they sign in. If you @mention them, they receive an
              email notification.
            </Paragraph>
            <Paragraph>
              Chat messages also support{" "}
              <A href="https://en.wikipedia.org/wiki/Markdown">Markdown</A>{" "}
              formatting with <LaTeX /> formulas.{" "}
            </Paragraph>
          </Info>

          <Backups />
          <Publishing />

          <Comparison
            name="latex"
            disclaimer
            title={
              <h2 style={{ textAlign: "center" }}>
                <Icon name="bolt" /> <LaTeX /> in CoCalc versus the competition
              </h2>
            }
          />

          <SignIn startup={<LaTeX />} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
