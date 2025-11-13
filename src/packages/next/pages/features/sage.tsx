/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import LaTeX from "components/landing/latex";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import Snapshots from "components/landing/snapshots";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import SiteName from "components/share/site-name";
import sagetexScreenshot from "public/features/cocalc-sagemath-sagetex.png";
import sageLogo from "public/features/sage-circular-v2.svg";
import sageNbgrader from "public/features/sage-nbgrader.png";
import sageScreenshot from "public/features/sage-worksheet.png";
import juypterScreenshot from "public/features/sagemath-jupyter.png";

const component = "SageMath";
const title = `Use SageMath Online`;

export default function Sage({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="sage" runnableTag="sage" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            body={sageLogo}
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
            image={juypterScreenshot}
            alt={"Using Sage in a Worksheet"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>
                  <Icon name="sagemath" /> Start using{" "}
                  <A href="https://sagemath.org/">SageMath</A> on <SiteName />
                </Title>
                <Paragraph>
                  <ol>
                    <li>
                      Start by <A href="/auth/sign-up">signing up</A> for a free{" "}
                      <SiteName /> account.
                    </li>
                    <li>
                      Read the{" "}
                      <A href="https://doc.cocalc.com/getting-started.html">
                        getting started guide
                      </A>{" "}
                      to orient yourself and create your first project.
                    </li>
                  </ol>
                  After creating your first project, go ahead and create
                  <ul>
                    <li>
                      a{" "}
                      <A href="/features/jupyter-notebook">Jupyter Notebooks</A>{" "}
                      file,
                    </li>
                    <li>a Sage Worksheet,</li>
                    <li>
                      a <LaTeX /> document, or
                    </li>
                    <li>
                      a plaintext <Text code>*.sage</Text> file and run sage in
                      a <A href="/features/terminal">Linux Terminal</A>.
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>
                  <Icon name="smile" /> Benefits of SageMath on <SiteName />
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
                      You can easily{" "}
                      <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/build-sage.md">
                        build Sage from source and run it on extremely powerful
                        computers
                      </A>{" "}
                      for only a few cents.
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
                  <iframe
                    width="560"
                    height="315"
                    src="https://www.youtube.com/embed/b8e8qq-KWbA?si=620SEO8C1JBYXpJL"
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  ></iframe>
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
            icon="sagemath"
            wide
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
            wide
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
            title={"SageMath in Jupyter Notebooks"}
            image={juypterScreenshot}
            alt={"Using SageMath in a Jupyter Notebook"}
            anchor="jupyter"
            icon="jupyter"
            wide
          >
            <Paragraph>
              You can also use SageMath in{" "}
              <A href="/features/jupyter-notebook">Jupyter Notebooks</A>.
            </Paragraph>
            <Paragraph>
              This is a great way to teach SageMath, since you can easily
              include text, code, and output in a single document.
            </Paragraph>
            <Paragraph>
              Learn more about{" "}
              <A href="https://doc.cocalc.com/jupyter.html">
                how to use SageMath in Jupyter Notebooks
              </A>
              .
            </Paragraph>
          </Info>

          <Info
            title={"Teach using SageMath and nbgrader"}
            image={sageNbgrader}
            alt={"A screenshot using nbgrader with SageMath."}
            anchor="nbgrader"
            icon="graduation-cap"
            wide
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
