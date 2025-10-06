/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Descriptions, Layout, List } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { DARK_MODE_ICON } from "@cocalc/util/consts/ui";
import { COLORS } from "@cocalc/util/theme";

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

import Pythontex from "public/features/cocalc-pythontex.png";
import Sagetex from "public/features/cocalc-sagetex.png";
import AIFormula from "public/features/latex-ai-formula.png";
import CustomCommand from "public/features/latex-custom-command-02.png";
import LatexDarkMode from "public/features/latex-editor-darkmode-20251003.png";
import LatexEditorImage from "public/features/latex-editor-main-20251003.png";
import LatexPythontex from "public/features/latex-editor-pythontex-20251003.png";
import LatexCollab from "public/features/latex-editor-realtime-sync-20251003.png";
import LaTeXMultiFile from "public/features/latex-editor-multifile-20251006.png";
import Knitr from "public/features/latex-editor-rnw-01.png";
import Sidechat from "public/features/latex-editor-side-chat-20251004.png";
import LatexTimetravel from "public/features/latex-editor-timetravel-01.png";
import Logo from "public/features/latex-logo.svg";

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
                <Title
                  level={2}
                  style={{
                    minHeight: "60px",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    Working with <LaTeX /> made easy
                  </span>
                </Title>
                <Paragraph>
                  <List bordered size="small">
                    <List.Item>
                      <strong>Side-by-side preview</strong> with{" "}
                      <strong>
                        <a href="#a-forwardinverse">
                          forward and inverse search
                        </a>
                      </strong>{" "}
                      (TEX ↔ PDF)
                    </List.Item>
                    <List.Item>
                      <strong>Automatically compiles upon saving</strong> and
                      marks problems in the source file
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-timetravel">Records every change</a>
                      </strong>{" "}
                      while you type with{" "}
                      <strong>
                        <a href="#a-backups">periodic backups</a>
                      </strong>{" "}
                      of all files
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-ai-formula">AI-powered formula assistant</a>
                      </strong>{" "}
                      typesets formulas for you
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-calculations">Runs embedded calculations</a>
                      </strong>{" "}
                      with support for <a href="#a-sagetex">SageTeX</a>,{" "}
                      <a href="#a-pythontex">PythonTeX</a> and{" "}
                      <a href="#a-knitr">Knitr</a>
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-multifile">Multi-file support</a>
                      </strong>{" "}
                      that discovers included files automatically
                    </List.Item>
                  </List>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title
                  level={2}
                  style={{
                    minHeight: "60px",
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span>Fully-featured online editor</span>
                </Title>
                <Paragraph>
                  <List bordered size="small">
                    <List.Item>
                      <strong>
                        <a href="#a-realtimesync">Real-time collaboration</a>
                      </strong>{" "}
                      with unlimited collaborators
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-chat">Side-by-side chat</a>
                      </strong>{" "}
                      to discuss documents with collaborators and AI
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-darkmode">Dark Mode with PDF support</a>
                      </strong>{" "}
                      for comfortable night-time editing
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-timetravel">Complete revision history</a>
                      </strong>{" "}
                      to revert any changes
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-environments">
                          Fully managed <LaTeX /> environment
                        </a>
                      </strong>{" "}
                      with PDF LaTeX, XeLaTeX, and LuaTeX
                    </List.Item>
                    <List.Item>
                      <strong>
                        <a href="#a-computational">
                          Full computational environment
                        </a>
                      </strong>{" "}
                      accessible from any browser
                    </List.Item>
                  </List>
                </Paragraph>
              </>
            }
            ext="tex"
          />

          <SignIn startup={<LaTeX />} />

          <Collaboration
            image={LatexCollab}
            alt="Two users editing the same LaTeX file simultaneously with visible cursors showing real-time collaboration"
          >
            <Paragraph>
              Multiple users can <strong>edit the same file online</strong> at
              the same time. Changes are{" "}
              <strong>synchronized in real-time</strong> – you see the cursors
              and edits of other collaborators as they type.
            </Paragraph>

            <Paragraph>
              Share your project privately with{" "}
              <A href="https://doc.cocalc.com/project-settings.html#about-collaborators">
                <strong>an unlimited number of collaborators</strong>
              </A>
              . Compilation status and PDF output are also synchronized between
              everyone, ensuring that all collaborators experience the document
              in exactly the same way.
            </Paragraph>
          </Collaboration>

          <Info
            anchor="a-ai-formula"
            icon="robot"
            title="AI-powered formula assistant"
            image={AIFormula}
            alt="AI formula assistant dialog generating LaTeX formulas from natural language descriptions"
          >
            <Paragraph>
              CoCalc's extensive integration with various AI language models
              helps you typeset formulas.
            </Paragraph>
            <Paragraph>
              You enter a description of your desired formula and{" "}
              <strong>
                a language model of your choice transforms it into proper LaTeX
                code
              </strong>
              . The descriptions can come in various forms:
            </Paragraph>
            <Paragraph>
              <Descriptions
                layout="vertical"
                bordered
                column={1}
                size={"small"}
              >
                <Descriptions.Item label="Natural language description">
                  <Text code>drake equation</Text>
                </Descriptions.Item>

                <Descriptions.Item label="Simple algebraic notation">
                  <Text code>(a+b)^2 = a^2 + 2 a b + b^2</Text>
                </Descriptions.Item>

                <Descriptions.Item label="Combination of both">
                  <Text code>
                    integral from 0 to infinity of (1+sin(x))/x^2 dx
                  </Text>
                </Descriptions.Item>
              </Descriptions>
            </Paragraph>
            <Paragraph>
              Once you have a result you like, click "Insert" to add the formula
              to your document.
            </Paragraph>
          </Info>

          <Info
            anchor="a-darkmode"
            icon={
              <Icon
                style={{ fontSize: "40px", color: "white" }}
                unicode={DARK_MODE_ICON}
              />
            }
            title={
              <span style={{ color: "white" }}>Dark Mode with PDF Support</span>
            }
            image={LatexDarkMode}
            style={{ background: "rgb(50, 50, 50)", color: "white" }}
          >
            <Paragraph style={{ color: "white" }}>
              Love{" "}
              <span
                style={{
                  background: "black",
                  color: "white",
                  padding: "2px 5px",
                }}
              >
                dark mode
              </span>
              ? CoCalc has you covered!
            </Paragraph>
            <Paragraph style={{ color: "white" }}>
              The <LaTeX /> editor features dark UI elements as you'd expect,
              but goes further by inverting the PDF viewer colors. This means
              that even though your final PDF will have a white background, you
              can view and edit it with a dark background and bright text for
              comfortable night-time work.
            </Paragraph>
            <Paragraph style={{ color: COLORS.GRAY_L }}>
              Note: You can quickly disable this PDF dark mode, to double check
              the actual output.
            </Paragraph>
          </Info>

          <Info
            anchor="a-multifile"
            icon="folder-open"
            title="Multi-file support"
            image={LaTeXMultiFile}
            alt="LaTeX editor showing multiple files with automatic discovery of included files"
          >
            <Paragraph>
              Working with large LaTeX documents often means splitting your
              content across multiple files using <Code>\include{"{...}"}</Code>{" "}
              or <Code>\input{"{...}"}</Code> commands.{" "}
            </Paragraph>
            <Paragraph strong>
              CoCalc automatically discovers all included files and makes
              navigation easy.
            </Paragraph>
            <Paragraph>
              Each entry shows a brief snippet of its beginning, making it easy
              to identify the right file.
            </Paragraph>
            <Paragraph>
              <strong>
                <a href="#a-forwardinverse">Inverse search</a>
              </strong>{" "}
              works seamlessly with multi-file documents: double-click
              anywhere in the PDF and CoCalc automatically opens the correct
              subfile for you.
            </Paragraph>
            <Paragraph>
              Learn more in the{" "}
              <A href="https://doc.cocalc.com/latex#multi-file-support">
                multi-file support documentation
              </A>
              .
            </Paragraph>
          </Info>

          <Info.Heading
            anchor="a-calculations"
            icon="calculator"
            description={
              <>
                <Paragraph>
                  <strong>
                    Execute Python, Sage, or R code directly within your LaTeX
                    source
                  </strong>{" "}
                  to automatically generate figures, tables, formulas, and
                  results. Your computational code lives alongside your prose,
                  making your paper fully reproducible.
                </Paragraph>
                <Paragraph>
                  CoCalc supports{" "}
                  <A href="http://doc.sagemath.org/html/en/tutorial/sagetex.html">
                    SageTeX
                  </A>
                  , <A href="https://ctan.org/pkg/pythontex">PythonTeX</A>, and{" "}
                  <A href="https://yihui.name/knitr/">Knitr</A>. The code runs
                  during compilation, and the output is automatically included
                  in your PDF – change your code, recompile, and your document
                  updates.
                </Paragraph>
              </>
            }
          >
            Embed Python, Sage or R code in <LaTeX /> documents
          </Info.Heading>

          <Info
            anchor="a-computational"
            icon="laptop"
            title="Full computational environment"
            image={LatexPythontex}
            alt="LaTeX editor with PythonTeX showing source code and PDF output with a damped oscillation plot"
            wide
          >
            <Paragraph>
              <strong>
                Stop copying and pasting computational results into your papers.
              </strong>{" "}
              CoCalc gives you{" "}
              <strong>full access to computational software</strong> directly
              within your <LaTeX /> editor – seamlessly compute your results and
              publish them in the same environment.
            </Paragraph>
            <Paragraph>
              Run <A href="/features/python">Python</A>,{" "}
              <A href="http://www.sagemath.org/">SageMath</A>,{" "}
              <A href="/features/r-statistical-software">R</A>,{" "}
              <A href="/features/julia">Julia</A>, and more right alongside your
              document. All software is pre-installed and maintained – no setup
              required.
            </Paragraph>
            <Paragraph>
              Learn more on our <A href="/software">Available Software page</A>{" "}
              or <A href="/features/jupyter-notebook">Jupyter Notebook page</A>.
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
                brings the power of{" "}
                <A href="https://www.sagemath.org/">SageMath</A> symbolic
                computation directly into your LaTeX documents.
              </strong>
            </Paragraph>
            <Paragraph>
              Write{" "}
              <Code>
                \sage{"{"}2 + 3{"}"}
              </Code>{" "}
              to get "5", use{" "}
              <Code>
                \sage{"{"}f.taylor(x, 0, 10){"}"}
              </Code>{" "}
              for Taylor expansions, and create plots with{" "}
              <Code>
                \sageplot{"{"}sin(x^2){"}"}
              </Code>
              . CoCalc automatically handles the full compilation pipeline:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>
                  Runs the initial <LaTeX /> compilation pass
                </li>
                <li>
                  Executes <A href="https://www.sagemath.org/">SageMath</A> to
                  compute results, graphs, and images
                </li>
                <li>Completes the final compilation to produce your PDF</li>
              </ul>
            </Paragraph>
            <Paragraph>
              No manual intervention required – just write your code and
              compile.
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
                <A href="https://ctan.org/pkg/pythontex">PythonTeX</A> executes
                Python code within your LaTeX documents and typesets the
                results.
              </strong>
            </Paragraph>
            <Paragraph>
              Use{" "}
              <Code>
                \py{"{"}2 + 4**2{"}"}
              </Code>{" "}
              to compute "18" inline, leverage the entire Python ecosystem
              including NumPy, SciPy, and Matplotlib for plots, or perform
              symbolic math with SymPy. Access to{" "}
              <A href="/software/python">hundreds of Python libraries</A> means
              you can analyze data, generate visualizations, and format results
              without leaving your document.
            </Paragraph>
            <Paragraph>
              CoCalc automatically detects PythonTeX usage and orchestrates the
              compilation – you focus on your analysis, not the toolchain.
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
              <strong>
                <A href="https://yihui.name/knitr/">Knitr</A> brings R
                statistical computing into your LaTeX workflow.
              </strong>{" "}
              Create <code>.Rnw</code> files that weave together statistical
              analysis, data visualization, and professional typesetting.
            </Paragraph>
            <Paragraph>
              Perfect for statistical reports, academic papers, and data-driven
              research. CoCalc handles everything automatically:
            </Paragraph>
            <Paragraph>
              <ul>
                <li>
                  <A href="/software/r">Thousands of R packages</A>{" "}
                  pre-installed and maintained
                </li>
                <li>Full compilation pipeline from R code to final PDF</li>
                <li>
                  <A href="#a-forwardinverse">
                    <strong>Forward and inverse search</strong>
                  </A>{" "}
                  between <code>.Rnw</code> source and PDF output
                </li>
              </ul>
            </Paragraph>
            <Paragraph>
              Run your statistical analysis and generate publication-ready
              documents in one integrated environment.
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
              "features/latex-forward-inverse-20251006.webm",
              "features/latex-forward-inverse-20251006.mp4",
            ]}
            wide
            alt="Video showing forward and inverse search in a LaTeX document"
          >
            <Paragraph>
              <strong>Navigate effortlessly between source and PDF.</strong>
            </Paragraph>
            <Paragraph>
              This speeds up your editing workflow, especially in large
              documents.
            </Paragraph>
            <Paragraph>
              <strong>Forward Search:</strong> Click in your LaTeX source to
              jump to the corresponding location in the PDF preview.
            </Paragraph>
            <Paragraph>
              <strong>Inverse Search:</strong> Double-click anywhere in the PDF
              to jump back to the corresponding location in your source code.
              You can also enable automatic sync mode to keep your source editor
              aligned with the PDF as you scroll.
            </Paragraph>
            <Paragraph>
              Powered by{" "}
              <A href="https://github.com/jlaurens/synctex">SyncTeX</A>, working
              seamlessly in the background.
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
              <strong>Query AI language models</strong> directly in the chat to
              get help with your document. Ask questions about LaTeX syntax,
              request suggestions for improving your writing, or discuss the
              content of your document with AI assistants.
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
