import { ReactNode } from "react";
import { Layout, Row, Col } from "antd";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Content from "components/landing/content";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import SignIn from "components/landing/sign-in";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import Head from "components/landing/head";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import Contact from "components/landing/contact";
import LaTeX from "components/landing/latex";

export default function Teaching({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={"Teaching scientific software"} />
      <Layout>
        <Header />
        <Layout.Content>
          <div style={{ backgroundColor: "#c7d9f5" }}>
            <Content
              startup={"CoCalc"}
              logo={"fa-graduation-cap.svg"}
              title={"Teaching scientific software online"}
              subtitle={
                <>
                  CoCalc is a virtual online computer lab: it takes away the
                  pain of teaching scientific software!
                </>
              }
              image={"cocalc-course-assignments-2019.png"}
              alt={"Screenshot of Cocalc's course management interface"}
            />
          </div>

          <Pitch
            col1={
              <div>
                <h2>
                  <Icon
                    name="server"
                    style={{ fontSize: "32px", marginRight: "10px" }}
                  />{" "}
                  An entire computer lab in the cloud
                </h2>
                <ul>
                  <li>
                    Every student works 100% online – inside their own dedicated
                    workspace.
                  </li>
                  <li>Follow the progress of each student in real time.</li>
                  <li>
                    At any time you and your teaching assistants can{" "}
                    <strong>jump into a student's file</strong>, right where
                    they are working, and answer their questions.
                  </li>
                  <li>
                    Use{" "}
                    <strong>
                      <A href="https://doc.cocalc.com/time-travel.html">
                        TimeTravel
                      </A>
                    </strong>{" "}
                    to see every step a student took to get to their solution,
                    and to get context when helping them.
                  </li>
                  <li>
                    <strong>
                      <A href="https://doc.cocalc.com/chat.html">
                        Integrated chat rooms
                      </A>
                    </strong>{" "}
                    allow you to guide students directly where they are working
                    or discuss collected files with your teaching assistants.
                  </li>
                  <li>
                    The project's{" "}
                    <strong>
                      <A href="https://doc.cocalc.com/project-log.html">
                        Activity Log
                      </A>
                    </strong>{" "}
                    records exactly when and by whom a file was accessed.{" "}
                  </li>
                </ul>
              </div>
            }
            col2={
              <div>
                <h2>
                  <Icon
                    name="laptop"
                    style={{ fontSize: "32px", marginRight: "10px" }}
                  />{" "}
                  No software setup <small>100% online</small>
                </h2>
                <p>
                  <strong>Common underlying software environment</strong>:
                </p>
                <ul>
                  <li>
                    Forget any complicated software setup – everyone is able to
                    start working in seconds!
                  </li>
                  <li>
                    Since everyone works with exactly the same software stack,
                    all inconsistencies between environments are eliminated.
                  </li>
                </ul>
                <p>
                  CoCalc's massive default{" "}
                  <A href="/doc/software">Software Environment</A> provides
                  nearly everything anybody{" "}
                  <strong>has ever asked us to install since 2013!</strong>
                </p>
              </div>
            }
          />

          <Pitch
            col1={
              <div>
                <h2>
                  <Icon
                    name="files"
                    style={{ fontSize: "32px", marginRight: "10px" }}
                  />{" "}
                  Manage all files
                </h2>
                <p>
                  The{" "}
                  <strong>
                    <A href="https://doc.cocalc.com/teaching-instructors.html">
                      course management interface
                    </A>
                  </strong>{" "}
                  gives you full control over distributing, collecting, grading
                  and returning everyone's assignments.
                </p>
                <div>
                  <img
                    src="cocalc-teaching.png"
                    style={{ width: "100%" }}
                    alt="Diagram showing how to use CoCalc for teaching."
                  />
                </div>
              </div>
            }
            col2={
              <div>
                <h2>
                  {" "}
                  <Icon
                    name="book"
                    style={{ fontSize: "32px", marginRight: "10px" }}
                  />{" "}
                  Learn more
                </h2>
                <ul>
                  <li>
                    The{" "}
                    <strong>
                      <A href="https://doc.cocalc.com/teaching-instructors.html">
                        Instructor Guide
                      </A>
                    </strong>{" "}
                    explains how to use CoCalc to teach a course.
                  </li>
                  <li>
                    The <A href="https://doc.cocalc.com/">CoCalc Manual</A>{" "}
                    explains much of what CoCalc can do.
                  </li>
                  <li>
                    There are a{" "}
                    <strong>large number of courses all over the world</strong>{" "}
                    running on CoCalc. We used to{" "}
                    <A href="https://github.com/sagemathinc/cocalc/wiki/Teaching">
                      list them here...
                    </A>
                  </li>
                </ul>
                <p style={{ fontSize: "20pt" }}>
                  <Contact /> or{" "}
                  <A href="https://docs.google.com/forms/d/e/1FAIpQLSesDZkGD2XVu8BHKd_sPwn5g7MrLAA8EYRTpB6daedGVMTpkA/viewform">
                    request a live demo
                  </A>
                  !
                </p>
              </div>
            }
          />

          <SignIn />

          <div style={{ height: "60px", backgroundColor: "white" }}></div>

          <Info.Heading>Feature Overview</Info.Heading>

          <Info
            title="NBGrader support"
            icon="graduation-cap"
            image="cocalc-jupyter-nbgrader-overview.png"
            alt="Editing an NBgrader Jupyter notebook"
            anchor="a-nbgrader"
          >
            <p>
              CoCalc's Jupyter Notebooks fully support{" "}
              <strong>automatic</strong> and <strong>manual grading</strong>{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                using our version of NBGrader
              </A>{" "}
              with no configuration!
            </p>
            <p>
              The teacher's notebook contains exercise cells for students and
              test cells, some of which students can also run to get immediate
              feedback. Once collected, you tell CoCalc to automatically run the
              full test suite across all student notebooks and tabulate the
              results.
            </p>
            <p>
              By default, tests run in the student's project, so malicious code
              won't impact anybody except the student.
            </p>
          </Info>

          <div style={{ padding: "30px 10%", backgroundColor: "#c7d9f5" }}>
            <h1
              style={{ textAlign: "center", color: "#333", fontSize: "32pt" }}
            >
              <Icon name="wrench" style={{ marginRight: "10px" }} />
              Available tools
            </h1>
            <Row>
              <Col lg={6}>
                <Tool
                  image="jupyter-logo.svg"
                  href="/doc/jupyter-notebook"
                  title="Jupyter Notebooks"
                  alt="Jupyter logo"
                >
                  CoCalc's own{" "}
                  <A href="/doc/jupyter-notebook">Jupyter Notebook</A>{" "}
                  implementation offers realtime synchronization, TimeTravel,
                  automatic grading, side chat, and more.
                </Tool>
              </Col>
              <Col lg={6}>
                <Tool
                  image="sage-sticker-1x1_inch-small.png"
                  href="https://doc.cocalc.com/sagews.html"
                  title="Sage Worksheets"
                  alt="SageMath sticker logo"
                >
                  <A href="https://doc.cocalc.com/sagews.html">
                    Sage Worksheets
                  </A>{" "}
                  are similar to Jupyter Notebooks, but made to work well with{" "}
                  <A href="https://www.sagemath.org">SageMath</A>. They offer a
                  single-document model that scales to large documents and
                  integrated 3d graphics.
                </Tool>
              </Col>
              <Col lg={6}>
                <Tool
                  image="latex-logo.svg"
                  href="/doc/latex-editor"
                  alt="LaTeX Logo"
                  title={
                    <>
                      <LaTeX /> Editor
                    </>
                  }
                >
                  A full{" "}
                  <A href="/doc/latex-editor">
                    <LaTeX />
                    editor
                  </A>{" "}
                  supporting preview rendering, forward/inverse search, error
                  reporting, and{" "}
                  <A href="https://doc.cocalc.com/latex.html">much more</A>.
                </Tool>
              </Col>
              <Col lg={6}>
                <Tool
                  image="linux-logo.svg"
                  href="/doc/terminal"
                  title="Linux Terminal"
                  alt="Tux Linux Penguin"
                >
                  Use the collaborative CoCalc terminal to access all powerful
                  command line tools in a{" "}
                  <A href="/doc/linux">full Ubuntu Linux environment</A>.
                </Tool>
              </Col>
            </Row>
          </div>

          <div style={{ padding: "30px 10%", backgroundColor: "#fff" }}>
            <h1
              style={{ textAlign: "center", color: "#333", fontSize: "32pt" }}
            >
              <Icon name="comment" style={{ marginRight: "10px" }} />{" "}
              Testimonials
            </h1>

            <Row>
              <Col lg={12}>
                <Testimonial
                  image="kiran.jpeg"
                  name="Kiran Kedlaya"
                  coords="UC San Diego, March 2017"
                  title="© Autor: Mathematisches Forschungsinstitut Oberwolfach gGmbH (MFO) -- Lizenz: CC BY-SA 2.0 (de)"
                >
                  I just found out that my CoCalc class got by far the best
                  course evaluations for any course I've taught at UCSD to date
                  (over 85% on the favorable/unfavorable scale), which makes it
                  a sure thing that I'll be teaching this course again (in some
                  form) next year! Many thanks for the backend work on CoCalc,
                  for the course materials, for the guest lecture...
                </Testimonial>
              </Col>
              <Col lg={12}>
                <Testimonial
                  image="will_conley.jpg"
                  name="Will Conley"
                  coords="University of California at Los Angeles, Fall 2016"
                >
                  CoCalc provides a user-friendly interface. Students don't need
                  to install any software at all. They just open up a web
                  browser and go to{" "}
                  <A href="https://cocalc.com">https://cocalc.com</A> and that's
                  it. They just type code directly in, hit shift+enter and it
                  runs, and they can see if it works. It provides immediate
                  feedback. The{" "}
                  <A href="https://doc.cocalc.com/teaching-instructors.html">
                    course management features
                  </A>{" "}
                  work really well.
                </Testimonial>
              </Col>
            </Row>
          </div>

          <SignIn />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps() {
  return await withCustomize();
}

interface ToolProps {
  image: string;
  alt: string;
  href: string;
  title: ReactNode;
  children: ReactNode;
}

function Tool({ image, alt, href, title, children }: ToolProps) {
  return (
    <div style={{ padding: "15px" }}>
      <div style={{ textAlign: "center", marginBottom: "30px" }}>
        <A href={href}>
          <img style={{ height: "70px" }} src={image} alt={alt} />
        </A>
      </div>
      <h2 style={{ textAlign: "center" }}>
        <A href={href}>{title}</A>
      </h2>
      {children}
    </div>
  );
}

interface TestimonialProps {
  image: string;
  name: string;
  coords: string;
  children: ReactNode;
  title?: string;
}

function Testimonial({
  image,
  name,
  coords,
  children,
  title,
}: TestimonialProps) {
  return (
    <blockquote
      style={{
        padding: "10px 20px",
        margin: "0 0 20px",
        borderLeft: "5px solid #eee",
      }}
    >
      <img
        src={image}
        alt={name}
        title={title}
        style={{
          height: "100px",
          borderRadius: "6px",
          float: "left",
          margin: "15px",
        }}
      />
      {children}
      <footer style={{ marginTop: "15px", color: "#666" }}>
        — <strong>{name}</strong> — {coords}
      </footer>
    </blockquote>
  );
}
