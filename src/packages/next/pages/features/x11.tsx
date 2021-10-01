import { Layout } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import A from "components/misc/A";
import Code from "components/landing/code";
import Image from "components/landing/image";

import x11Logo from "/public/features/x11-logo.svg";
import x11Screenshot from "/public/features/x11-01.png";
import applications from "/public/features/x11-applications.png";
import swirl from "/public/features/swirl_new_large_final.png";
import swirlCourse from "/public/features/swirl-course.png";
import x11Firefox from "/public/features/x11-firefox.png";

const component = "X11 Desktop";
const title = `Run ${component} Graphical Linux Applications`;

export default function X11({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="x11" />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={component}
              logo={x11Logo}
              title={title}
              subtitle={
                <>
                  <div>
                    Run {component} scripts,{" "}
                    <A href="/features/jupyter-notebook">Jupyter notebooks</A>,
                    or even full graphical applications in a remote {component}{" "}
                    environment.
                  </div>
                </>
              }
              image={x11Screenshot}
              alt={"Screenshot of wxMaxima in X11"}
              caption={"Using wxMaxima in X11"}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h1>Run graphical software in your browser</h1>
                <p>
                  CoCalc is able to{" "}
                  <strong>
                    run{" "}
                    <A href="https://en.wikipedia.org/wiki/X_Window_System">
                      graphical software using X11
                    </A>{" "}
                    via your browser
                  </strong>
                  .
                </p>
                <p>
                  The application with a graphical user interface runs remotely
                  on CoCalc using a virtual display provided by{" "}
                  <A href="https://xpra.org/">XPRA</A>.{" "}
                </p>
              </div>
            }
            col2={
              <div>
                <h1>Features</h1>
                <ul>
                  <li>
                    You no longer have to <strong>install and maintain</strong>{" "}
                    the applications. In particular when you're teaching a
                    class, students just have to sign in to CoCalc to get
                    started!
                  </li>
                  <li>
                    These virtual desktops are <strong>persistent</strong> as
                    long as your project is running; you can close your browser
                    and come back later.
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
              </div>
            }
          />

          <Pitch
            col1={
              <div>
                <h1>Popular Applications</h1>
                <p>
                  <strong>Popular applications that are preinstalled</strong>{" "}
                  include <A href="http://maxima.sourceforge.net/">Maxima</A>,{" "}
                  <A href="https://www.libreoffice.org/">LibreOffice</A>,{" "}
                  <A href="https://www.openmodelica.org/">OpenModelica</A>,{" "}
                  <A href="https://www.rstudio.com/">RStudio</A>,{" "}
                  <A href="https://swirlstats.com/">
                    {"{"}swirl{"}"}
                  </A>
                  , <A href="http://www.xm1math.net/texmaker/">TexMaker</A>, and
                  much more …
                </p>
                <p>
                  Please check out our comprehensive table of{" "}
                  <strong>
                    <A href="https://doc.cocalc.com/x11.html#installed-applications">
                      installed applications
                    </A>
                  </strong>{" "}
                  for additional details.{" "}
                </p>
              </div>
            }
            col2={
              <div>
                <h1>Documentation/Technical Background</h1>
                <p>
                  The{" "}
                  <strong>
                    <A href="https://doc.cocalc.com/x11.html">
                      X11 Documentation
                    </A>
                  </strong>{" "}
                  explains how to use a virtual desktop on CoCalc.
                </p>
                <p>
                  Read our{" "}
                  <A href="http://blog.sagemath.com/cocalc/2018/11/05/x11.html">
                    blog post
                  </A>{" "}
                  to learn more about this features!{" "}
                </p>
              </div>
            }
          />

          <div
            style={{
              textAlign: "center",
              paddingBottom: "30px",
              background: "white",
            }}
          >
            <Image
              style={{ width: "80%" }}
              src={applications}
              alt="Image showing buttons for many X11 Applications in CoCalc"
            />
          </div>

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
            <p>
              CoCalc provides a way to use the{" "}
              <A href="https://swirlstats.com/">
                interactive R tutorial package Swirl
              </A>{" "}
              in your web browser, even though Swirl doesn't work with Jupyter
              notebooks due to its complicated IO model.
            </p>
            <p>
              Create an X11 desktop, then in the terminal, type "R", then{" "}
              <Code>
                options(swirl_courses_dir="~/R/courses",swirl_data_dir="~/R/data")
              </Code>{" "}
              then
              <Code>library("swirl"); swirl()</Code>
            </p>
            <p>
              You can use swirl in{" "}
              <A href="/features/teaching">teaching a course.</A>
            </p>
          </Info>

          <Info
            title="Use Firefox to test a web server"
            icon="firefox"
            image={x11Firefox}
            anchor="a-firefox"
            alt="Using Firefox to connect to a local web server"
          >
            <p>
              You can use Firefox running from within your CoCalc project to
              connect to a server running there only listening on localhost.
              This avoids any{" "}
              <A href="https://doc.cocalc.com/howto/webserver.html">
                proxying or url rewriting.
              </A>
            </p>
            <p>
              Firefox works very well in the X11 graphical desktop on CoCalc.
            </p>
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
