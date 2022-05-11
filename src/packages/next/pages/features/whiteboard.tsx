import { Layout } from "antd";
import Footer from "components/landing/footer";
import A from "components/misc/A";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import Head from "components/landing/head";
import { Icon } from "@cocalc/frontend/components/icon";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";

import WhiteboardImage from "/public/features/whiteboard-sage.png";

export default function Whiteboard({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Mathematical Whiteboard" />
      <Layout>
        <Header page="features" subPage="whiteboard" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              logo={<Icon name="layout" style={{ fontSize: "100px" }} />}
              title={
                <h1>
                  Online Collaborative Whiteboards for Mathematics and
                  Computation
                </h1>
              }
              subtitle={
                <>
                  <hr />
                  Sketch out ideas and run Jupyter code cells with CoCalc's
                  whiteboard
                </>
              }
              image={WhiteboardImage}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h2>A full featured online collaborative whiteboard</h2>
                <p>
                  CoCalc{"'"}s collaborative mathematical whiteboard supports an
                  infinite canvas with
                </p>
                <ul>
                  <li>
                    <strong>text</strong> with mathematical LaTeX expressions,
                  </li>
                  <li>
                    sticky <strong>notes</strong>,
                  </li>
                  <li>
                    sketching with <strong>pens</strong>,
                  </li>
                  <li>
                    <A href="/features/jupyter-notebook">Jupyter</A>{" "}
                    <strong>code cells</strong> with support for tab completion
                    and interactive widgets,
                  </li>
                  <li>
                    <strong>chat</strong> conversations with collaborators,
                  </li>
                  <li>
                    hundreds of <strong>icons</strong>,
                  </li>
                  <li>
                    <strong>frames</strong> to group objects, and
                  </li>
                  <li>
                    <strong>stopwatches</strong> and{" "}
                    <strong>countdown timers</strong> to organize and track
                    work.
                  </li>
                </ul>
              </div>
            }
            col2={
              <div>
                <h2>The Whiteboard with Jupyter cells and more!</h2>
                You can use Jupyter notebook code cells with over a dozen
                supported kernels, a massive library of pre-installed software,
                and interactive widgets, with execution ordered determined by a
                directed graph. You
                <ul>
                  <li>
                    create <strong>edges</strong> between all objects,
                  </li>
                  <li>
                    use <strong>frames</strong> to organize the whiteboard into
                    sections,
                  </li>
                  <li>
                    infinitely <strong>split your editor</strong> windows to
                    view multiple parts of the whiteboard simultaneously,
                  </li>
                  <li>
                    easily navigate with an <strong>overview map</strong> with
                    two preview modes,
                  </li>
                  <li>
                    every change you make is recorded via browsable{" "}
                    <strong>TimeTravel</strong> and you can copy/paste from any
                    point in the history,
                  </li>
                  <li>
                    and you can <strong>publish</strong> your whiteboards to{" "}
                    <A href="/share">the share server</A>.
                  </li>
                </ul>
              </div>
            }
          />
        </Layout.Content>
        <div
          style={{
            color: "#555",
            fontSize: "16px",
            textAlign: "center",
            margin: "20px",
          }}
        >
          <h1>Now Available!</h1>
          Try a whiteboard out in any CoCalc project by clicking +New, then
          clicking "Whiteboard".
          <SignIn startup={"Whiteboard"} />
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
