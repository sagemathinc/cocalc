/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import WhiteboardPostIt from "/public/features/whiteboard-post-it.png";
import WhiteboardImage from "/public/features/whiteboard-sage.png";

export default function Whiteboard({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Computational Whiteboard" />
      <Layout>
        <Header page="features" subPage="whiteboard" />
        <Layout.Content>
          <Content
            landing
            body={<Icon name="layout" style={{ fontSize: "100px" }} />}
            startup={"Whiteboard"}
            title={
              "Online Collaborative Whiteboard with Jupyter Code Cells and LaTeX Mathematics"
            }
            subtitleBelow={true}
            subtitle={
              <>
                Sketch out ideas and run Jupyter code cells with CoCalc
                Whiteboard
              </>
            }
            image={WhiteboardImage}
            alt={"Collaborative Computational Whiteboard"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>
                  Full featured online collaborative computational whiteboard
                </Title>
                <Paragraph>
                  As explained in{" "}
                  <A href="https://about.cocalc.com/2022/09/08/all-about-computational-whiteboard/">
                    our blog
                  </A>{" "}
                  and{" "}
                  <A href="https://doc.cocalc.com/whiteboard.html">
                    documentation
                  </A>
                  , CoCalc{"'"}s collaborative computational whiteboards support
                  an infinite canvas with
                </Paragraph>
                <Paragraph>
                  <ul>
                    <li>
                      <A href="https://doc.cocalc.com/markdown.html">
                        Rich text collaborative markdown editor
                      </A>{" "}
                      with mathematical LaTeX expressions,
                    </li>
                    <li>
                      Sticky <strong>notes</strong>,
                    </li>
                    <li>
                      Sketching with <strong>pens</strong>,
                    </li>
                    <li>
                      <A href="/features/jupyter-notebook">
                        <strong>Jupyter code cells</strong>
                      </A>{" "}
                      with support for tab completion and interactive widgets,
                    </li>
                    <li>
                      <strong>Chat</strong> conversations with collaborators,
                    </li>
                    <li>
                      Hundreds of <strong>icons</strong>,
                    </li>
                    <li>
                      <strong>Frames</strong> to group objects, and
                    </li>
                    <li>
                      <strong>Stopwatches</strong> and{" "}
                      <strong>Countdown timers</strong> to organize and track
                      work.
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>
                  A Computational Whiteboard with Jupyter cells and more!
                </Title>
                <Paragraph>
                  You can{" "}
                  <A href="https://doc.cocalc.com/whiteboard.html#jupyter-cells">
                    use <strong>Jupyter notebook code cells</strong>
                  </A>{" "}
                  with over a dozen supported kernels, a massive library of
                  pre-installed software and interactive widgets. You
                  <ul>
                    <li>
                      Create <strong>edges</strong> between all objects,
                    </li>
                    <li>
                      Use <strong>frames</strong> to organize the whiteboard
                      into sections,
                    </li>
                    <li>
                      <strong>Split your editor</strong> windows to view
                      multiple parts of the whiteboard simultaneously,
                    </li>
                    <li>
                      Easily navigate with an <strong>overview map</strong> with
                      two preview modes,
                    </li>
                    <li>
                      Every change you and your collaborators make is recorded
                      via browsable <strong>TimeTravel</strong> and you can
                      copy/paste from any point in the history, and
                    </li>
                    <li>
                      <strong>Publish</strong> your whiteboards to{" "}
                      <A href="/share">the share server</A>.
                    </li>
                  </ul>
                </Paragraph>
              </>
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
          <Title level={1}>Now Available!</Title>
          <Paragraph style={{ fontSize: "14pt", margin: "15px" }}>
            Read much more about the computational whiteboard in{" "}
            <A href="https://about.cocalc.com/2022/09/08/all-about-computational-whiteboard/">
              our blog
            </A>{" "}
            and{" "}
            <A href="https://doc.cocalc.com/whiteboard.html">
              the documentation.
            </A>
          </Paragraph>
          <Paragraph>
            Try it in any CoCalc project by clicking +New, then clicking
            "Whiteboard".
            <br />
            <br />
            We also offer <A href="/features/slides">
              slide presentations
            </A>{" "}
            with similar functionality.
            <br />
            <SignIn startup={"Whiteboard"} />
            <Image
              alt="Screenshot showing whiteboard with post-it notes."
              src={WhiteboardPostIt}
              style={{ margin: "15px auto", maxWidth: "1512px" }}
            />
          </Paragraph>
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
