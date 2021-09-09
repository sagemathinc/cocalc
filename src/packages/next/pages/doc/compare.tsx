import { Alert, Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Contact from "components/landing/contact";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Head from "components/landing/head";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import Code from "components/landing/code";
import Tables from "components/landing/compare";

const component = "CoCalc";
const title = `Run ${component} Now`;

export default function Octave({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header landing="compare" />
        <Layout.Content>
          <div
            style={{
              backgroundColor: "#c7d9f5",
              textAlign: "center",
              padding: "60px 0",
            }}
          >
            <Icon
              style={{ fontSize: "100pt", marginBottom: "50px" }}
              name="table"
            />
            <h1 style={{ fontSize: "26pt" }}>
              Comparing CoCalc to MyBinder, Colab, Datalore, Deepnote, Overleaf,
              Authorea, Papeeria, and more...
            </h1>
            <SignIn startup={"CoCalc"} />
          </div>

          <Alert
            style={{ margin: "30px 10%" }}
            description={
              <>
                <p style={{ fontSize: "11pt" }}>
                  These comparisons were made in good faith; however, they may
                  contain errors, since we know CoCalc much better and the
                  products are constantly improving.
                </p>
                <Contact /> if anything looks wrong or incomplete!
              </>
            }
            type="warning"
            showIcon
          />

          <Tables />

          <div
            style={{
              width: "100%",
              background: "white",
            }}
          >
            <div
              style={{
                padding: "30px 10%",
                margin: "auto",
                fontSize: "12pt",
                maxWidth: "900px",
              }}
            >
              <h1>Footnotes</h1>
              <ol>
                <li>
                  <strong>Collaboration:</strong> Files are private, but can be
                  shared with one or more other registered users on that
                  platform
                </li>
                <li>
                  <strong>Realtime sync:</strong> Multiple users can edit the
                  same file. While anyone types, each other collaborator sees
                  the changes at the same time.
                </li>
                <li>
                  <strong>External tools:</strong> access to a full software
                  environment, e.g. able to run arbitrary python scripts or
                  notebooks – also as part of the compilation (
                  <Code>-shell-escape</Code> mode)
                </li>
                <li>
                  <strong>Maximum number of collaborators:</strong> Depending on
                  the plan, Overleaf supports only 1, 10 or unlimited
                  collaborators.{" "}
                  <A href="https://www.overleaf.com/user/subscription/plans">
                    Plans &amp; Pricing, 2020-03-12
                  </A>
                </li>
                <li>
                  <strong>Publishing:</strong> The content of the file can be
                  made publicly available on the internet.
                </li>
                <li>
                  <strong>Forward/Inverse search:</strong> Jump from the cursor
                  position to the page/position in the PDF preview and vice
                  versa, jump from the page/position in the PDF to the cursor
                  position in the <Code>.tex</Code> source.
                </li>
                <li>
                  <strong>Overleaf R/Knitr support:</strong> Only about 300
                  packages (CoCalc hosts{" "}
                  <A href="/doc/software-r">more than 10x as many!</A>), not
                  possible to install additional R packages, only one syntax
                  style, no{" "}
                  <A href="/doc/r-statistical-software">Jupyter Notebooks</A>,
                  no caching of Knitr results between runs (i.e. much slower),
                  ...
                </li>
                <li>
                  <strong>Linux packages</strong>: collected by running e.g.{" "}
                  <Code>apt list --installed | wc -l</Code> or{" "}
                  <Code>rpm -qa | wc -l</Code>
                </li>
                <li>
                  <strong>GPU for CoCalc</strong>: You could run{" "}
                  <A href="https://github.com/sagemathinc/cocalc-docker">
                    cocalc-docker
                  </A>{" "}
                  on your own hardware with a GPU!
                </li>
              </ol>
            </div>
          </div>
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
