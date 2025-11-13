/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Layout, Row } from "antd";

import { R_IDE } from "@cocalc/util/consts/ui";
import Code from "components/landing/code";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import Info from "components/landing/info";
import Pitch, { STYLE_PITCH } from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import swirlCourse from "/public/features/swirl-course.png";
import swirl from "/public/features/swirl_new_large_final.png";
import x11Screenshot from "/public/features/x11-01.png";
import applications from "/public/features/x11-applications.png";
import x11Firefox from "/public/features/x11-firefox.png";
import x11Logo from "/public/features/x11-logo.svg";

const component = "X11 Desktop";
const title = `Run ${component} Graphical Linux Applications`;

export default function X11({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="x11" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            body={x11Logo}
            title={title}
            subtitleBelow={true}
            subtitle={
              <>
                <div>
                  Run {component} scripts,{" "}
                  <A href="/features/jupyter-notebook">Jupyter notebooks</A>, or
                  even full graphical applications in a remote {component}{" "}
                  environment.
                </div>
              </>
            }
            image={x11Screenshot}
            alt={"Screenshot of wxMaxima in X11"}
            caption={"Using wxMaxima in X11"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>Run graphical software in your browser</Title>
                <Paragraph>
                  CoCalc is able to{" "}
                  <strong>
                    run{" "}
                    <A href="https://en.wikipedia.org/wiki/X_Window_System">
                      graphical software using X11
                    </A>{" "}
                    via your browser
                  </strong>
                  .
                </Paragraph>
                <Paragraph>
                  The application with a graphical user interface runs remotely
                  on CoCalc using a virtual display provided by{" "}
                  <A href="https://xpra.org/">XPRA</A>.{" "}
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>Features</Title>
                <Paragraph>
                  <ul>
                    <li>
                      You no longer have to{" "}
                      <strong>install and maintain</strong> the applications. In
                      particular when you're teaching a class, students just
                      have to sign in to CoCalc to get started!
                    </li>
                    <li>
                      These virtual desktops are <strong>persistent</strong> as
                      long as your project is running; you can close your
                      browser and come back later.
                    </li>
                    <li>
                      More than one person can <strong>collaboratively</strong>{" "}
                      interact with the same X11 application at the same time.
                    </li>
                    <li>
                      You can <strong>copy and paste</strong> between your local
                      desktop environment and the virtual graphical X11 session.
                    </li>
                  </ul>
                </Paragraph>
              </>
            }
          />

          <Pitch
            col1={
              <>
                <Title level={2}>Popular Applications</Title>
                <Paragraph>
                  <strong>Popular applications that are preinstalled</strong>{" "}
                  include <A href="http://maxima.sourceforge.net/">Maxima</A>,{" "}
                  <A href="https://www.libreoffice.org/">LibreOffice</A>,{" "}
                  <A href="https://www.openmodelica.org/">OpenModelica</A>,{" "}
                  <A href="https://www.rstudio.com/">{R_IDE}</A>,{" "}
                  <A href="https://swirlstats.com/">
                    {"{"}swirl{"}"}
                  </A>
                  , <A href="http://www.xm1math.net/texmaker/">TexMaker</A>, and
                  much more …
                </Paragraph>
                <Paragraph>
                  Please check out our comprehensive table of{" "}
                  <strong>
                    <A href="https://doc.cocalc.com/x11.html#installed-applications">
                      installed applications
                    </A>
                  </strong>{" "}
                  for additional details.{" "}
                </Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>Documentation/Technical Background</Title>
                <Paragraph>
                  The{" "}
                  <strong>
                    <A href="https://doc.cocalc.com/x11.html">
                      X11 Documentation
                    </A>
                  </strong>{" "}
                  explains how to use a virtual desktop on CoCalc.
                </Paragraph>
                <Paragraph>
                  Read our{" "}
                  <A href="http://blog.sagemath.com/cocalc/2018/11/05/x11.html">
                    blog post
                  </A>{" "}
                  to learn more about this features!{" "}
                </Paragraph>
              </>
            }
          />

          <Row style={STYLE_PITCH}>
            <Col
              lg={24}
              style={{
                paddingBottom: "30px",
                background: "white",
              }}
            >
              <Image
                style={{ width: "100%" }}
                src={applications}
                alt="Image showing buttons for many X11 Applications in CoCalc"
              />
            </Col>
          </Row>

          <Info.Heading
            description={
              "There are many ways to use X11 in CoCalc to complement Jupyter notebooks and other functionality."
            }
          >
            Some ways to use X11 in CoCalc
          </Info.Heading>

          <Info
            title="Use R's {swirl} in your web browser"
            icon="r"
            image={swirlCourse}
            anchor="a-swirl"
            alt="Using Swirl via X11 to do the basic programming course"
            wide
          >
            <Image
              src={swirl}
              style={{ width: "100%", marginBottom: "15px" }}
              alt="Using Swirl and X11 in CoCalc"
            />
            <Paragraph>
              CoCalc provides a way to use the{" "}
              <A href="https://swirlstats.com/">
                interactive R tutorial package Swirl
              </A>{" "}
              in your web browser, even though Swirl doesn't work with Jupyter
              notebooks due to its complicated IO model.
            </Paragraph>
            <Paragraph>
              Create an X11 desktop, then in the terminal, type "R", then{" "}
              <Code>
                options(swirl_courses_dir="~/R/courses",swirl_data_dir="~/R/data")
              </Code>{" "}
              then
              <Code>library("swirl"); swirl()</Code>
            </Paragraph>
            <Paragraph>
              You can use swirl in{" "}
              <A href="/features/teaching">teaching a course.</A>
            </Paragraph>
          </Info>

          <Info
            title="Use Firefox to test a web server"
            icon="firefox"
            image={x11Firefox}
            anchor="a-firefox"
            alt="Using Firefox to connect to a local web server"
          >
            <Paragraph>
              You can use Firefox running from within your CoCalc project to
              connect to a server running there only listening on localhost.
              This avoids any{" "}
              <A href="https://doc.cocalc.com/howto/webserver.html">
                proxying or url rewriting.
              </A>
            </Paragraph>
            <Paragraph>
              Firefox works very well in the X11 graphical desktop on CoCalc.
            </Paragraph>
          </Info>

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
