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
              title={<h1>Online Whiteboard</h1>}
              subtitle={
                <>
                  <hr />
                  Collaborativley sketch out your ideas and run Jupyter code
                  cells with CoCalc's mathematical whiteboard
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
                    <strong>text</strong> with mathematical formulas,
                  </li>
                  <li>sticky notes,</li>
                  <li>sketching with pens,</li>
                  <li>Jupyter code cells,</li>
                  <li>multiple chat conversations,</li>
                  <li>stopwatches and countdown timers.</li>
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
                  <li>create edges between all objects,</li>
                  <li>use frames to organize the whiteboard into sections,</li>
                  <li>
                    split your editor to view multiple parts of the whiteboard
                    simultaneously,
                  </li>
                  <li>easily navigate with an overview map,</li>
                  <li>
                    every{" "}
                    <strong>
                      change is recorded via browseable TimeTravel
                    </strong>{" "}
                    while you type,
                  </li>
                  <li>
                    and you can publish your whiteboards to{" "}
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
            fontSize: "40px",
            textAlign: "center",
            margin: "20px",
          }}
        >
          <A href="https://github.com/sagemathinc/cocalc/pull/5674">
            Coming in March 2022!
          </A>
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
