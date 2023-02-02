/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Code from "components/landing/code";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import LaTeX from "components/landing/latex";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import Snapshots from "components/landing/snapshots";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import sageNbgrader from "public/features/sage-nbgrader.png";
import sageLogo from "public/features/sage-circular-v2.svg";
import sageScreenshot from "public/features/sage-worksheet.png";
import sagetexScreenshot from "public/features/cocalc-sagemath-sagetex.png";

const component = "SageMath";
const title = `Use SageMath Online`;

export default function Sage({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="sage" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            logo={sageLogo}
            title={
              <>
                Use <A href="https://www.sagemath.org/">SageMath</A> Online
              </>
            }
            subtitle={
              <>
                The goal of <A href="https://www.sagemath.org/">SageMath</A> is
                to create a viable free open source alternative to Magma, Maple,
                Mathematica and Matlab by building on top of many existing
                open-source packages, including NumPy, SciPy, matplotlib, SymPy,
                Maxima, GAP, FLINT, and{" "}
                <A href="/features/r-statistical-software">R</A>.
              </>
            }
            subtitleBelow={true}
            image={sageScreenshot}
            alt={"Using Sage in a Worksheet"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>
                  <Icon name="sagemath" /> Run{" "}
                  <A href="https://sagemath.org/">SageMath</A> on CoCalc
                </Title>
                <Paragraph>
                  <ul>
                    <li>
                      Use CoCalc's own realtime collaborative{" "}
                      <strong>
                        <A href="/features/jupyter-notebook">
                          Jupyter Notebooks
                        </A>
                      </strong>
                      .
                    </li>
                    <li>
                      Use SageMath from the collaborative,{" "}
                      <strong>
                        <A href="/features/terminal">Linux Terminal</A>
                      </strong>{" "}
                      or{" "}
                      <A href="/features/x11">
                        virtual X11 graphical Linux desktop
                      </A>
                      .
                    </li>
                    <li>
                      Use Sage optimized{" "}
                      <A href="https://doc.cocalc.com/sagews.html">
                        Worksheets
                      </A>
                      , which provide a single document experience that can be
                      more friendly than the Jupyter notebook "multiple cells"
                      approach.
                    </li>
                    <li>
                      Easily embed Sage code in your{" "}
                      <A href="/features/latex-editor">
                        <LaTeX /> documents
                      </A>
                      .
                    </li>
                    <li>
                      Install almost any{" "}
                      <A href="https://pypi.org/">Python package</A> for use
                      with Sage:
                      <br />
                      <Code>sage --pip install package_name</Code>
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>
                  Benefits of working with SageMath online
                </Title>
                <Paragraph>
                  <ul>
                    <li>
                      You no longer have to{" "}
                      <strong>
                        <A href="https://www.sagemath.org/download.html">
                          install and maintain
                        </A>
                      </strong>{" "}
                      SageMath, which can be challenging since Sage is large.
                      When you're{" "}
                      <A href="/features/teaching">teaching a class</A>,
                      students just have to sign in to CoCalc to get started!
                    </li>
                    <li>
                      You can still easily run <b>older versions of Sage</b>{" "}
                      since many are all preinstalled in every CoCalc project.
                    </li>
                    <li>
                      All your files are private, stored persistently,
                      snapshotted and backed up; moreover, you can <b>rsync</b>{" "}
                      them to your computer or push them to <b>GitHub</b>.
                    </li>
                    <li>
                      You can invite <strong>collaborators</strong> to your
                      project to simultaneously edit the same notebooks or code
                      files.
                    </li>
                    <li>
                      Everything runs remotely, which means you do not have to
                      worry about messing up your own computer.{" "}
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
          />

          <SignIn startup={component} />

          <Info.Heading
            description={
              <>There are many ways to use {component} online via CoCalc.</>
            }
          >
            Feature Overview
          </Info.Heading>

          <Info
            title={"SageMath Worksheets"}
            image={sageScreenshot}
            alt={"Using SageMath in a Worksheet"}
            anchor="sagews"
          >
            <Paragraph>
              CoCalc's{" "}
              <A href="https://doc.cocalc.com/sagews.html">
                SageMath Worksheets
              </A>{" "}
              are a single document experience that can be more friendly than
              the Jupyter notebook "multiple cells" approach.
            </Paragraph>
            <Paragraph>
              They are a great way to teach SageMath, since you can easily
              include text, code, and output in a single document.
            </Paragraph>
          </Info>

          <Info
            title={
              <>
                SageMath in <LaTeX /> documents
              </>
            }
            image={sagetexScreenshot}
            alt={"Using SageMath in a LaTeX document"}
            anchor="latex"
          >
            <Paragraph>
              You can also embed SageMath code in your{" "}
              <A href="/features/latex-editor">
                <LaTeX /> documents
              </A>
              .
            </Paragraph>
            <Paragraph>
              This means you no longer have to manually copy and paste output
              from SageMath worksheets into your LaTeX documents.
            </Paragraph>
            <Paragraph>
              Learn more about{" "}
              <A href={"https://ctan.org/pkg/sagetex?lang=en"}>SageTeX</A> and{" "}
              <A href={"https://doc.cocalc.com/latex.html#sage"}>
                how to use it in CoCalc
              </A>
              .
            </Paragraph>
          </Info>

          <Info
            title={"Teach using SageMath and Nbgrader"}
            image={sageNbgrader}
            alt={"A screenshot using nbgrader with SageMath."}
            anchor="nbgrader"
          >
            <Paragraph>
              CoCalc's{" "}
              <A href="/features/teaching">
                integrated course management system
              </A>{" "}
              fully supports{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                using nbgrader together with SageMath
              </A>{" "}
              Jupyter Notebooks.
            </Paragraph>
            <Paragraph>
              We provide custom Python templates for all the nbgrader cell
              types.
            </Paragraph>
            <Paragraph>
              Tests run in the student's project by default, so malicious code
              won't impact anybody except the student.
            </Paragraph>
          </Info>

          <Snapshots />

          <SignIn startup={component} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
