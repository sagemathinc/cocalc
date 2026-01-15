/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Col, Grid, Row } from "antd";
import { join } from "path";
import { useEffect, useState, type JSX } from "react";

import { SOFTWARE_ENVIRONMENT_ICON } from "@cocalc/frontend/project/settings/software-consts";
import { DOC_AI } from "@cocalc/util/consts/ui";
import { COLORS } from "@cocalc/util/theme";
import DemoCell from "components/demo-cell";
import { AvailableTools, Tool } from "components/landing/available-tools";
import Info from "components/landing/info";
import { CSS, Paragraph, Text } from "components/misc";
import A from "components/misc/A";
import ChatGPTHelp from "components/openai/chatgpt-help";
import {
  Testimonial,
  TestimonialComponent,
  twoRandomTestimonials,
} from "components/testimonials";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import assignments from "public/features/cocalc-course-assignments-2019.png";
import RTC from "public/features/cocalc-real-time-jupyter.png";
import ComputeServers from "./compute-servers";
import { LANDING_HEADER_LEVEL } from "./constants";

// NOTE: This component is only rendered if the onCoCalcCom customization variable is "true"
export function CoCalcComFeatures() {
  const {
    siteName = "CoCalc",
    openaiEnabled,
    jupyterApiEnabled,
    shareServer = false,
    onCoCalcCom,
  } = useCustomize();
  const width = Grid.useBreakpoint();

  // to avoid next-js hydration errors
  const [testimonials, setTestimonials] =
    useState<[Testimonial, Testimonial]>();

  useEffect(() => {
    setTestimonials(twoRandomTestimonials());
  }, []);

  function renderCollaboration(): JSX.Element {
    return (
      <Info
        level={LANDING_HEADER_LEVEL}
        title="Realtime Collaboration Using Your Favorite Tools"
        icon="users"
        image={RTC}
        anchor="a-realtimesync"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
        belowWide={true}
        icons={[
          { icon: "jupyter", link: "/features/jupyter-notebook" },
          { icon: "tex", title: "LaTeX", link: "/features/latex-editor" },
          { icon: "slides", title: "Whiteboard", link: "/features/whiteboard" },
        ]}
      >
        <Paragraph>
          With {siteName}, you can easily collaborate with colleagues, students,
          and friends to edit computational documents. We support{" "}
          <A href={"/features/jupyter-notebook"}>
            <strong>Jupyter Notebooks</strong>
          </A>
          , <A href={"/features/latex-editor"}>LaTeX files</A>,{" "}
          <A href="/features/sage">SageMath Worksheets</A>,{" "}
          <A href={"/features/whiteboard"}>Computational Whiteboards</A>, and
          much more. We have an{" "}
          <A href={"https://doc.cocalc.com/why.html#open-world-approach"}>
            open world approach
          </A>{" "}
          giving users as much flexibility in choosing software and hardware as
          possible.
        </Paragraph>

        <Paragraph>
          You and your collaborators use the same per-project environment, which
          provides consistent results, synchronized file changes, and automatic
          revision history so that you can go back in time when you need to
          discover what changed and when. {renderShareServer()}
        </Paragraph>

        <Paragraph>
          Forget the frustration of sending files back and forth between your
          collaborators, wasting time reviewing changes, and merging documents.{" "}
          <A href={"/auth/sign-up"}>Get started with {siteName} today.</A>
        </Paragraph>
      </Info>
    );
  }

  function renderTeaching() {
    return (
      <Info
        level={LANDING_HEADER_LEVEL}
        title="Integrated Course Management System"
        icon="graduation-cap"
        image={assignments}
        anchor="a-teaching"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
        icons={[
          {
            icon: "users",
            title: "Course Management",
            link: "https://doc.cocalc.com/teaching-instructors.html",
          },
          {
            icon: "graduation-cap",
            title: "nbgrader",
            link: "https://doc.cocalc.com/teaching-nbgrader.html",
          },
          { icon: "slides", title: "Slides", link: "/features/whiteboard" },
        ]}
      >
        <Paragraph>
          You can think of {siteName} as{" "}
          <Text strong>virtual computer lab</Text> in the cloud. It takes away
          the pain of teaching scientific software.
        </Paragraph>
        <Paragraph>
          <Text strong>Hassle-free assignments</Text>: {siteName} keeps all
          files well organized! Due to real-time synchronization you never have
          to deal with multiple versions of the same file. There is even support
          for{" "}
          <A href={"https://doc.cocalc.com/teaching-nbgrader.html"}>
            automated grading via nbgrader
          </A>
          .
        </Paragraph>
        <Paragraph>
          <Text strong>Pre-installed Software</Text> like in a computer lab,{" "}
          <A href={"/software"}>all software you need</A> is already installed
          and ready to use.
        </Paragraph>
        <Paragraph>
          <Text strong>Real-time Collaboration</Text> allows you to virtually
          look students over their shoulders. You can check their work directly
          and help them by editing the file or using side-chat communication.
        </Paragraph>
        <Paragraph>
          <Button
            onClick={() =>
              (window.location.href = join(basePath, "/features/teaching"))
            }
          >
            More about teaching on {siteName}
          </Button>
        </Paragraph>
      </Info>
    );
  }


  function renderShareServer() {
    if (!shareServer) return;

    return (
      <>
        {" "}
        You can even publish your {siteName} creations to share with anyone via
        the built-in <A href={"/share/public_paths/page/1"}>share server</A>.
      </>
    );
  }

  function renderMore(): JSX.Element {
    const text = {
      software: `All available software`,
      whiteboard: `Computational whiteboard`,
      features: `Features overview`,
    };
    const software = (
      <Paragraph style={{ textAlign: "center" }}>
        <Button
          onClick={() => (window.location.href = join(basePath, "/software"))}
          title={text.software}
        >
          {text.software}
        </Button>
      </Paragraph>
    );
    const whiteboard = (
      <Paragraph style={{ textAlign: "center" }}>
        <Button
          onClick={() =>
            (window.location.href = join(basePath, "/features/whiteboard"))
          }
          title={text.whiteboard}
        >
          {text.whiteboard}
        </Button>
      </Paragraph>
    );
    const features = (
      <Paragraph style={{ textAlign: "center" }}>
        <Button
          onClick={() => (window.location.href = join(basePath, "/features"))}
          title={text.features}
        >
          {text.features}
        </Button>
      </Paragraph>
    );
    return (
      <Info
        level={LANDING_HEADER_LEVEL}
        title="Much More …"
        icon="wrench"
        anchor="more"
        style={{ backgroundColor: COLORS.YELL_LLL }}
      >
        <Row>
          <Col md={8}>
            <Tool
              icon={SOFTWARE_ENVIRONMENT_ICON}
              href="/software"
              title="Available Software"
              alt="Available Software"
            >
              <Paragraph>
                {siteName} comes with a variety of software pre-installed,
                including
                <A href={"/features/python"}>Python</A>,{" "}
                <A href={"/features/sage"}>SageMath</A>,{" "}
                <A href={"/features/r-statistical-software"}>R</A> and{" "}
                <A href={"/features/julia"}>Julia</A> . You can{" "}
                <A
                  href={"https://doc.cocalc.com/howto/install-python-lib.html"}
                >
                  install additional software
                </A>{" "}
                directly in your project as well.
              </Paragraph>
              {!width.md && software}
            </Tool>
          </Col>
          <Col md={8}>
            <Tool
              icon="layout"
              href="/features/whiteboard"
              title="Computational Whiteboard"
              alt="Computational Whiteboard"
            >
              <Paragraph>
                Use a full featured collaborative whiteboard – with support for
                Jupyter notebook cells – to express and share your ideas.
              </Paragraph>
              {!width.md && whiteboard}
            </Tool>
          </Col>
          <Col md={8}>
            <Tool
              icon="wrench"
              href="/features"
              alt="Features"
              title="Feature Overview"
            >
              <Paragraph>
                {siteName} offers a variety of features to make your life
                easier. You can find a list of all features{" "}
                <A href="/features">here</A>.
              </Paragraph>
              {!width.md && features}
            </Tool>
          </Col>
          {width.md && (
            <>
              <Col md={8}>{software}</Col>
              <Col md={8}>{whiteboard}</Col>
              <Col md={8}>{features}</Col>
            </>
          )}
        </Row>
      </Info>
    );
  }

  function renderAvailableProducts(): JSX.Element {
    const txtCol = COLORS.GRAY_LL;
    const toolCol = "white";

    const link: CSS = {
      color: "white",
      fontWeight: "bold",
    } as const;

    const bottom: CSS = {
      color: txtCol,
      textAlign: "center",
      fontSize: "150%",
    } as const;

    const urlProducts = "/pricing/products";
    const urlCourses = "/pricing/courses";
    const urlOnprem = "/pricing/onprem";

    const productsLink = (
      <Paragraph style={bottom}>
        <Button
          ghost
          size="large"
          style={{ fontWeight: "bold" }}
          onClick={() => (window.location.href = join(basePath, urlProducts))}
          title={"Products Overview"}
        >
          Products Overview
        </Button>
      </Paragraph>
    );

    const courseLink = (
      <Paragraph style={bottom}>
        <Button
          ghost
          size="large"
          style={{ fontWeight: "bold" }}
          onClick={() => (window.location.href = join(basePath, urlCourses))}
          title={"Course Licenses"}
        >
          Course Licenses
        </Button>
      </Paragraph>
    );

    const onpremLink = (
      <Paragraph style={bottom}>
        <Button
          ghost
          size="large"
          style={{ fontWeight: "bold" }}
          onClick={() => (window.location.href = join(basePath, urlOnprem))}
          title={"On-Premises Offerings"}
        >
          On-Premises Offerings
        </Button>
      </Paragraph>
    );

    return (
      <Info
        level={LANDING_HEADER_LEVEL}
        title="Solutions"
        icon="shopping-cart"
        anchor="products"
        style={{ backgroundColor: COLORS.BLUE_D }}
        textStyle={{ color: COLORS.GRAY_LL }}
      >
        <Row>
          <Col md={8}>
            <Tool
              icon="server"
              href={urlProducts}
              title="Online Service with GPUs"
              alt="Online Service"
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                You can start using {siteName} online for free today.{" "}
                <A href={"/auth/sign-up"} style={link}>
                  Create an account
                </A>
                , open your{" "}
                <A style={link} href={"https://doc.cocalc.com/trial.html"}>
                  trial project
                </A>{" "}
                and{" "}
                <A
                  style={link}
                  href={"https://doc.cocalc.com/getting-started.html"}
                >
                  start exploring
                </A>{" "}
                {siteName}.
              </Paragraph>
              <Paragraph style={{ color: txtCol }}>
                Upgrade your workspaces with a{" "}
                <A style={link} href={"/store/membership"}>
                  membership
                </A>{" "}
                to unlock internet access, better hosting quality, and other
                upgrades.
              </Paragraph>
              {!width.md && productsLink}
            </Tool>
          </Col>
          <Col md={8}>
            <Tool
              icon="graduation-cap"
              href={urlCourses}
              title="Teach a Course"
              alt="Teach a Course"
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                You can{" "}
                <A style={link} href="/features/teaching">
                  teach a course
                </A>{" "}
                on {siteName} online!
              </Paragraph>
              <Paragraph style={{ color: txtCol }}>
                The{" "}
                <A style={link} href="pricing/courses">
                  course license options
                </A>{" "}
                are very flexible: they range from small professional training
                up to large university courses. The students can pay {siteName}{" "}
                directly, or you can pay on their behalf, and it is easy to
                change a license at any time if you need more resources or the
                number of students changes.
              </Paragraph>
              {!width.md && courseLink}
            </Tool>
          </Col>
          <Col md={8}>
            <Tool
              icon="network-wired"
              href={urlOnprem}
              alt="On-Premises"
              title={"On-Premises"}
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                It is very easy to run {siteName} on your own computer or
                cluster. The available options are:
                <ol>
                  <li>
                    Make your computer available in a {siteName} project via an{" "}
                    <A
                      style={link}
                      href={"https://doc.cocalc.com/compute_server.html"}
                    >
                      on-prem compute server
                    </A>
                    .
                  </li>
                  <li>
                    Deploy a highly scalable variant of {siteName} on your{" "}
                    <strong>Kubernetes cluster</strong> via{" "}
                    <A style={link} href="https://onprem.cocalc.com/">
                      <strong>CoCalc OnPrem</strong>
                    </A>
                    .
                  </li>
                </ol>
              </Paragraph>
              {!width.md && onpremLink}
            </Tool>
          </Col>
          {width.md && (
            <>
              <Col md={8}>{productsLink}</Col>
              <Col md={8}>{courseLink}</Col>
              <Col md={8}>{onpremLink}</Col>
            </>
          )}
        </Row>
      </Info>
    );
  }

  function renderTestimonials() {
    if (!testimonials) return;
    const [t1, t2] = testimonials;
    return (
      <Info
        level={LANDING_HEADER_LEVEL}
        title="Testimonials"
        icon="comment"
        anchor="testimonials"
        style={{ backgroundColor: COLORS.BS_GREEN_LL }}
      >
        <Row gutter={[15, 15]}>
          <Col md={12}>
            <TestimonialComponent testimonial={t1} />
          </Col>
          <Col md={12}>
            <TestimonialComponent testimonial={t2} />
          </Col>
          <Col md={24} style={{ textAlign: "center" }}>
            <Button
              onClick={() =>
                (window.location.href = join(basePath, "/testimonials"))
              }
              title={`More testimonials from users of ${siteName}`}
            >
              More testimonials
            </Button>
          </Col>
        </Row>
      </Info>
    );
  }

  function renderChatGPT() {
    if (!openaiEnabled || !onCoCalcCom) return;
    return (
      <Info
        level={LANDING_HEADER_LEVEL}
        title="Extensive Generative AI Integration"
        icon="robot"
        imageComponent={<ChatGPTHelp size="large" tag={"index"} />}
        anchor="a-realtimesync"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
      >
        <Paragraph>
          A wide range of{" "}
          <A href={DOC_AI}>Generative AI Large Language Models</A> are highly
          integrated into {siteName}. This helps you{" "}
          <A href={`${DOC_AI}#jupyter-notebooks`}>fix errors</A>, generate code
          or LaTeX snippets, summarize documents, and much more.
        </Paragraph>
      </Info>
    );
  }

  function renderDemoCell() {
    if (!jupyterApiEnabled) return;

    return (
      <Info
        level={LANDING_HEADER_LEVEL}
        title="Many Programming Languages"
        icon="flow-chart"
        imageComponent={<DemoCell tag={"sage"} style={{ width: "100%" }} />}
        anchor="a-realtimesync"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.YELL_LLL }}
        icons={[
          { icon: "julia", link: "/features/julia" },
          { icon: "linux", link: "/features/linux" },
          { icon: "python", link: "/features/python" },
          { icon: "r", link: "/features/r-statistical-software" },
          { icon: "sagemath", title: "SageMath", link: "/features/sage" },
          { icon: "octave", link: "/features/octave" },
        ]}
      >
        <Paragraph>
          {siteName} supports many{" "}
          <A href={"/software"}>programming languages</A>. Edit the demo cell on
          the left and evaluate it by pressing "Run". You can also select a
          different "kernel", i.e. the programming language that is used to
          evaluate the cell.
        </Paragraph>
      </Info>
    );
  }

  return (
    <>
      <ComputeServers />
      {renderChatGPT()}
      {renderDemoCell()}
      {renderCollaboration()}
      <AvailableTools style={{ backgroundColor: COLORS.YELL_LLL }} />
      {renderTeaching()}
      {renderMore()}
      {renderTestimonials()}
      {renderAvailableProducts()}
    </>
  );
}
