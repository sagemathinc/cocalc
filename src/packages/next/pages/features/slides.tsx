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
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import SlidesImage from "/public/features/slides-sage.png";

export default function Slides({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Computational Slides" />
      <Layout>
        <Header page="features" subPage="slides" />
        <Layout.Content>
          <Content
            landing
            body={<Icon name="slides" style={{ fontSize: "100px" }} />}
            startup={"Slides"}
            title={
              "Online Collaborative Slides with Jupyter Code Cells and LaTeX Mathematics"
            }
            subtitleBelow={true}
            subtitle={
              <>
                Give presentations with code and mathematics using CoCalc Slides
              </>
            }
            image={SlidesImage}
            alt={"Collaborative Computational Slides"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>
                  Full featured online collaborative computational slides
                </Title>
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
                  Computational Slides with Jupyter cells and more!
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
                      Use <strong>slides</strong> to organize your presentation
                      into sections,
                    </li>
                    <li>
                      <strong>Split your editor</strong> windows to view
                      multiple sections of your slides simultaneously,
                    </li>
                    <li>
                      Easily navigate with an{" "}
                      <strong>overview map and pages</strong>,
                    </li>
                    <li>
                      Every change that you and your collaborators make is
                      recorded via browsable <strong>TimeTravel</strong> and you
                      can copy/paste from any point in the history, and
                    </li>
                    <li>
                      <strong>Publish</strong> your slides to{" "}
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
          <Paragraph>
            Try it in any CoCalc project by clicking +New, then clicking
            "Slides".
            <br />
            <br />
            We also offer an{" "}
            <A href="/features/whiteboard">infinite canvas whiteboard</A> with
            similar functionality.
            <br />
            <SignIn startup={"Slides"} />
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
