import { join } from "path";
import { Layout, Row, Col } from "antd";
import Head from "next/head";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import SquareLogo from "components/logo-square";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { basePath } from "lib/base-path";
import SignIn from "components/landing/sign-in";

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
            <SignIn startup={"LaTeX"} />
          </div>
          <Footer />
        </Layout.Content>
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
