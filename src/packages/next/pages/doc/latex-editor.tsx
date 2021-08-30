import { join } from "path";
import Link from "next/link";
import { Layout, Row, Col, Typography } from "antd";
import Head from "next/head";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import SquareLogo from "components/logo-square";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import basePath from "lib/base-path";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";

const { Text } = Typography;
const FAVICON = "/webapp/favicon-32x32.png";

export default function LatexEditor({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head>
        <title>{siteName} -- Online LaTeX Editor</title>
        <meta name="description" content="CoCalc" />
        <link rel="icon" href={join(basePath ?? "", FAVICON)} />
      </Head>
      <Layout>
        <Header />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={"LaTeX"}
              logo={"latex-logo.svg"}
              title={"Online LaTeX Editor"}
              subtitle={
                "Focus on writing LaTeX and CoCalc takes care of everything else."
              }
              image={"cocalc-latex-editor-2019.png"}
            />
          </div>

          <div
            style={{
              padding: "60px 10%",
              backgroundColor: "white",
              fontSize: "11pt",
            }}
          >
            <Row>
              <Col lg={12}>
                <NoInstall />
              </Col>
              <Col lg={12}>
                <MadeEasy />
              </Col>
            </Row>
            <Ready />
          </div>
          <SignIn startup={"LaTeX"} />
          <Info
            anchor="a-environments"
            icon="tex"
            title="Managed LaTeX environments"
            image="latex-custom-command-02.png"
          >
            <p>
              CoCalc makes sure that your desired LaTeX engine is available and
              ready to use. You can choose between{" "}
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
          <Info
            anchor="a-realtimesync"
            icon="users"
            title="Collaborative editing without limits"
            image="cocalc-latex-concurrent-editing.png"
          >
            <p>
              Privately share your project with{" "}
              <strong>any number of collaborators</strong>. Concurrent
              modifications of the LaTeX document are{" "}
              <strong>synchronized in real time</strong>. You see the cursors of
              others while they edit the document and also see the presence of
              watching collaborators.
            </p>
            <p>
              Additionally, the compilation status and output is synchronized
              between everyone, because everything runs online and is fully
              managed by CoCalc.
            </p>
            <p>
              This ensures that everyone involved experiences editing the
              document in exactly the same way.{" "}
            </p>
          </Info>
          <Info
            anchor="a-computational"
            icon="laptop"
            title="Full computational environment"
            image="cocalc-latex-editor-2019.png"
          >
            <p>
              One thing that sets CoCalc apart from other online LaTeX editors
              is <strong>full access to computational software</strong>. This
              means you can seamlessly transition from <em>computing</em> your
              results to <em>publishing</em> them.
            </p>
            <p>
              CoCalc supports running{" "}
              <A href="https://www.python.org">Python</A>,{" "}
              <A href="http://www.sagemath.org/">SageMath</A>,{" "}
              <A href="http://www.r-project.org/">R Statistical Software</A>,{" "}
              <A href="http://julialang.org">Julia</A>, and more in the same
              project as your LaTeX document.
            </p>
            <p>
              Consult the{" "}
              <A href="../doc/software.html">Available Software page</A> or look
              at our{" "}
              <A href="../doc/jupyter-notebook.html">Jupyter Notebook page</A>{" "}
              for more information.{" "}
            </p>
          </Info>
          <Info
            anchor="a-calculations"
            title="Run calculations inside your LaTeX documents!"
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
            image="cocalc-sagetex.png"
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
              <Text code>
                \sage{"{"}2 + 2{"}"}
              </Text>{" "}
              in LaTeX and the document will contain "4",{" "}
              <Text code>
                \sage{"{"}f.taylor(x, 0, 10){"}"}
              </Text>{" "}
              for the Taylor expansion of a function <em>f</em>, and drawing
              graphs becomes as simple as{" "}
              <Text code>
                \sageplot{"{"}sin(x^2){"}"}
              </Text>
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
            image="cocalc-pythontex.png"
          >
            <p>
              <strong>
                <A href="https://ctan.org/pkg/pythontex">PythonTeX</A> allows
                you to run Python from within a document and typeset the
                results.
              </strong>
            </p>
            <p>
              For example, <Text code>\py{2 + 4 ** 2}</Text> produces "18". You
              can use all{" "}
              <Link href="/doc/software-python">
                <a>available python libraries</a>
              </Link>{" "}
              for Python 3, and in particular, check out PythonTeX's support for
              SymPy and drawing plots via <Text code>pylab</Text>.
            </p>
            <p>
              Again, CoCalc automatically detects that you want to run PythonTeX
              and handles all the details for you.{" "}
            </p>
          </Info>
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

function NoInstall() {
  return (
    <div>
      <h2>No software install required: 100% online</h2>
      <p>
        CoCalc's <A href="https://doc.cocalc.com/latex.html">LaTeX editor</A>{" "}
        supports
      </p>
      <ul>
        <li>
          <strong>side-by-side preview</strong> with{" "}
          <strong>forward and inverse search</strong>,
        </li>
        <li>compiles upon saving and marks errors in the source file,</li>
        <li>
          periodically <a href="#a-backups">backups</a> all your files,
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
  );
}

function MadeEasy() {
  return (
    <div>
      <h2>Working with LaTeX made easy</h2>
      <dl>
        <dt>Tired of sending changes back and forth with your colleagues?</dt>
        <dd>
          <strong>
            <a href="#a-realtimesync">Collaborate online</a>
          </strong>{" "}
          without any limits!
        </dd>
        <dt>Scared of breaking a document?</dt>
        <dd>
          Revert recent changes via <a href="#a-timetravel">time-travel</a> edit
          history.
        </dd>
        <dt>Worried about maintaining your LaTeX environment?</dt>
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
  );
}

function Ready() {
  return (
    <div style={{ textAlign: "center", padding: "30px 0" }}>
      <strong>Ready out of the box</strong>:{" "}
      <A href="https://doc.cocalc.com/getting-started.html">
        Sign up, create a project
      </A>
      , create or <A href="https://doc.cocalc.com/howto/upload.html">upload</A>{" "}
      a <code>*.tex</code> file, and you're ready to tex!{" "}
    </div>
  );
}
