/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Layout, Row } from "antd";
import { ReactNode } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { AvailableTools } from "components/landing/available-tools";
import BannerWithLinks from "components/landing/banner-with-links";
import Contact from "components/landing/contact";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import assignments from "public/features/cocalc-course-assignments-2019.png";
import nbgrader from "public/features/cocalc-jupyter-nbgrader-overview.png";
import teaching from "public/features/cocalc-teaching.png";
import logo from "public/features/fa-graduation-cap.svg";
import kiran from "public/features/kiran.jpeg";
import conley from "public/features/will_conley.jpg";

export default function Teaching({ customize }) {
  const { onCoCalcCom, shareServer } = customize;

  const pitchPcLab = (
    <>
      <Title level={2}>
        <Icon name="server" style={{ fontSize: "32px", marginRight: "10px" }} />{" "}
        An entire computer lab in the cloud
      </Title>
      <Paragraph>
        {" "}
        <ul>
          <li>
            Every student works 100% online – inside their own dedicated
            workspace.
          </li>
          <li>Follow the progress of each student in real time.</li>
          <li>
            At any time you and your teaching assistants can{" "}
            <strong>jump into a student's file</strong>, right where they are
            working, and answer their questions.
          </li>
          <li>
            Use{" "}
            <strong>
              <A href="https://doc.cocalc.com/time-travel.html">TimeTravel</A>
            </strong>{" "}
            to see every step a student took to get to their solution, and to
            get context when helping them.
          </li>
          <li>
            <strong>
              <A href="https://doc.cocalc.com/chat.html">
                Integrated chat rooms
              </A>
            </strong>{" "}
            allow you to guide students directly where they are working or
            discuss collected files with your teaching assistants.
          </li>
          <li>
            The project's{" "}
            <strong>
              <A href="https://doc.cocalc.com/project-log.html">Activity Log</A>
            </strong>{" "}
            records exactly when and by whom a file was accessed.{" "}
          </li>
          <li>
            CoCalc's massive default{" "}
            <strong>
              <A href="/software">Software Environment</A>
            </strong>{" "}
            provides nearly everything anybody{" "}
            <strong>has ever asked us to install since 2013!</strong>
          </li>
        </ul>
      </Paragraph>
    </>
  );

  const pitchNoSetup = (
    <>
      <Title level={2}>
        <Icon name="laptop" style={{ fontSize: "32px", marginRight: "10px" }} />{" "}
        No software setup <small>100% online</small>
      </Title>
      <Paragraph>
        <strong>Fully managed software environment</strong>:
        <ul>
          <li>
            Forget any complicated software setup – everyone is able to start
            working in seconds!
          </li>
          <li>
            Since everyone works with exactly the same software stack, all
            inconsistencies are eliminated.
          </li>
        </ul>
      </Paragraph>

      <Paragraph>
        <strong>Batteries included</strong>: CoCalc includes much of what you
        need to teach your course
        <p></p>
        <ul>
          <li>
            Integrated{" "}
            <A href={"/features/jupyter-notebook"}>
              <strong>Jupyter Notebooks</strong>
            </A>{" "}
            with collaboration, recording changes, and much more…
          </li>
          <li>
            Support for <strong>many programming languages</strong>:
            <br />
            <A href={"/features/python"}>Python</A> with many pre-installed{" "}
            <A href={"/software/python"}>Python packages</A>;
            <br />
            <A href={"/features/r-statistical-software"}>
              Statistical Software R
            </A>{" "}
            with many pre-installed <A href={"/software/r"}>R packages</A>;
            <br />
            <A href={"/features/julia"}>Julia</A> programming language,{" "}
            <A href={"/features/octave"}>Octave</A>, and{" "}
            <A href={"/features/sage"}>SageMath</A>, …
          </li>
          <li>
            A <A href={"/features/linux"}>Linux environment</A>, with many{" "}
            pre-installed <A href={"/software/executables"}>utilities</A> and a{" "}
            <A href={"/features/terminal"}>terminal</A>.
          </li>
          <li>
            Use a virtual{" "}
            <A href={"/features/whiteboard"}>
              <strong>Whiteboard</strong>
            </A>{" "}
            with embedded Jupyter Cells to bring your ideas across.
          </li>
        </ul>
      </Paragraph>
    </>
  );

  return (
    <Customize value={customize}>
      <Head
        title={
          "Teach scientific software online using Jupyter Notebook, Python, R, and more"
        }
      />
      <Layout>
        <Header page="features" subPage="teaching" />
        <Layout.Content>
          {shareServer && onCoCalcCom && <BannerWithLinks />}
          <Content
            style={{ backgroundColor: COLORS.LANDING.TOP_BG }}
            startup={"CoCalc"}
            aboveImage={<></>}
            logo={logo}
            title={"Teach scientific software online using Jupyter Notebooks"}
            subtitle={
              <>
                CoCalc is a virtual online computer lab: it takes away the pain
                of teaching scientific software!
              </>
            }
            subtitleBelow={true}
            image={assignments}
            alt={"Cocalc's course management interface"}
          />

          <Pitch col1={pitchPcLab} col2={pitchNoSetup} />

          <Pitch
            col1={
              <Paragraph>
                <Title level={2}>
                  <Icon
                    name="files"
                    style={{ fontSize: "32px", marginRight: "10px" }}
                  />{" "}
                  Manage all files
                </Title>
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
                  <Image
                    src={teaching}
                    style={{ width: "100%" }}
                    alt="Diagram showing how to use CoCalc for teaching."
                  />
                </div>
              </Paragraph>
            }
            col2={
              <Paragraph>
                <Title level={2}>
                  <Icon
                    name="book"
                    style={{ fontSize: "32px", marginRight: "10px" }}
                  />{" "}
                  Learn more
                </Title>
                <ul>
                  <li>
                    Start{" "}
                    <strong>
                      <A href={"/features"}>discovering CoCalc</A>
                    </strong>
                    :{" "}
                    <A href={"/features/jupyter-notebook"}>
                      CoCalc's Jupyter Notebooks
                    </A>
                  </li>
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
                <p
                  style={{
                    fontSize: "150%",
                    margin: "30px",
                    padding: "15px",
                    border: "1px solid #c0c0c0",
                    boxShadow: "2px 2px 2px 2px #cfcfcf",
                    borderRadius: "5px",
                  }}
                >
                  <Contact /> or{" "}
                  <A href="https://docs.google.com/forms/d/e/1FAIpQLSesDZkGD2XVu8BHKd_sPwn5g7MrLAA8EYRTpB6daedGVMTpkA/viewform">
                    request a live demo
                  </A>
                  !
                </p>
              </Paragraph>
            }
          />

          <Info.Heading>Feature Overview</Info.Heading>

          <Info
            title="NBGrader support"
            icon="graduation-cap"
            image={nbgrader}
            alt="Editing an NBgrader Jupyter notebook"
            anchor="a-nbgrader"
          >
            <Paragraph>
              CoCalc's Jupyter Notebooks fully support{" "}
              <strong>automatic</strong> and <strong>manual grading</strong>{" "}
              <A href="https://doc.cocalc.com/teaching-nbgrader.html">
                using our version of NBGrader
              </A>{" "}
              with no configuration!
            </Paragraph>
            <Paragraph>
              The teacher's notebook contains exercise cells for students and
              test cells, some of which students can also run to get immediate
              feedback. Once collected, you tell CoCalc to automatically run the
              full test suite across all student notebooks and tabulate the
              results.
            </Paragraph>
            <Paragraph>
              By default, tests run in the student's project, so malicious code
              won't impact anybody except the student.
            </Paragraph>
          </Info>

          <AvailableTools style={{}} />

          <div style={{ padding: "30px 10%", backgroundColor: "#fff" }}>
            <Title
              level={1}
              style={{ textAlign: "center", color: "#333", fontSize: "32pt" }}
            >
              <Icon name="comment" style={{ marginRight: "10px" }} />{" "}
              Testimonials
            </Title>

            <Row>
              <Col lg={12}>
                <Testimonial
                  image={kiran}
                  name="Kiran Kedlaya"
                  coords="UC San Diego, March 2017"
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
                  image={conley}
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

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}

interface TestimonialProps {
  image;
  name: string;
  coords: string;
  children: ReactNode;
}

function Testimonial({ image, name, coords, children }: TestimonialProps) {
  return (
    <blockquote
      style={{
        padding: "10px 20px",
        margin: "0 0 20px",
        borderLeft: "5px solid #eee",
      }}
    >
      <Image
        src={image}
        alt={name}
        style={{
          width: "90px",
          borderRadius: "6px",
          float: "left",
          margin: "15px",
        }}
      />
      <Paragraph>
        {children}
        <footer style={{ marginTop: "15px", color: "#666" }}>
          — <strong>{name}</strong> — {coords}
        </footer>
      </Paragraph>
    </blockquote>
  );
}
