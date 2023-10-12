/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Col, Grid, Row } from "antd";
import { join } from "path";
import { useEffect, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { SOFTWARE_ENVIRONMENT_ICON } from "@cocalc/frontend/project/settings/software-consts";
import { COLORS } from "@cocalc/util/theme";
import Path from "components/app/path";
import DemoCell from "components/demo-cell";
import { AvailableTools, Tool } from "components/landing/available-tools";
import Info from "components/landing/info";
import { CSS, Paragraph, Text } from "components/misc";
import A from "components/misc/A";
import ChatGPTHelp from "components/openai/chatgpt-help";
import Loading from "components/share/loading";
import ProxyInput from "components/share/proxy-input";
import PublicPaths from "components/share/public-paths";
import {
  Testimonial,
  TestimonialComponent,
  twoRandomTestimonials,
} from "components/testimonials";
import basePath from "lib/base-path";
import { MAX_WIDTH } from "lib/config";
import { useCustomize } from "lib/customize";
import useAPI from "lib/hooks/api";
import assignments from "public/features/cocalc-course-assignments-2019.png";
import SignIn from "./sign-in";
import RTC from "/public/features/cocalc-real-time-jupyter.png";

// NOTE: This component is only rendered if the onCoCalcCom customization variable is "true"
export default function CoCalcComFeatures() {
  const {
    siteName = "CoCalc",
    openaiEnabled,
    sandboxProjectId,
    jupyterApiEnabled,
    shareServer = false,
  } = useCustomize();
  const width = Grid.useBreakpoint();
  const [sharedExpanded, setSharedExpanded] = useState(false);

  // to avoid next-js hydration errors
  const [testimonials, setTestimonials] =
    useState<[Testimonial, Testimonial]>();

  useEffect(() => {
    setTestimonials(twoRandomTestimonials());
  }, []);

  function renderCollaboration(): JSX.Element {
    return (
      <Info
        title="Collaborative Computational Documents"
        icon="users"
        image={RTC}
        anchor="a-realtimesync"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
        below={renderShareServer()}
        belowWide={true}
      >
        <Paragraph>
          {siteName} makes it possible to collaboratively edit computational
          documents with your colleagues, students, or friends. Edit{" "}
          <A href={"/features/jupyter-notebook"}>
            <strong>Jupyter Notebooks</strong>
          </A>
          , <A href={"/features/latex-editor"}>LaTeX files</A>,{" "}
          <A href="/features/sage">SageMath Worksheets</A>,{" "}
          <A href={"/features/whiteboard"}>Computational Whiteboards</A> and
          many more with your collaborators in a real-time.
        </Paragraph>

        <Paragraph>
          The code code runs in the same environment for everyone, giving
          consistent results. All changes are synchronized in real-time.
        </Paragraph>

        <Paragraph>
          Therefore, you can forget the frustration of sending files back and
          forth between your collaborators. You no longer waste time reviewing
          changes and merging documents.
        </Paragraph>
      </Info>
    );
  }

  function renderTeaching() {
    return (
      <Info
        title="Teach a Course"
        icon="graduation-cap"
        image={assignments}
        anchor="a-teaching"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
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
            automated grading via NBGrader
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

  function renderSandbox() {
    if (!sandboxProjectId) return;
    return (
      <Info
        title={<>The Public {siteName} Sandbox</>}
        level={2}
        icon="share-square"
        anchor="a-sandbox"
        style={{ backgroundColor: COLORS.GRAY_LLL }}
      >
        <Path
          style={{ marginBottom: "15px" }}
          project_id={sandboxProjectId}
          description="Public Sandbox"
        />
      </Info>
    );
  }

  function renderShareServer() {
    if (!shareServer) return;

    if (sharedExpanded) {
      return <PublishedPathsIndex />;
    } else {
      return (
        <div style={{ textAlign: "center" }}>
          <Button size="large" onClick={() => setSharedExpanded(true)}>
            <Icon name="plus-square" /> Explore published documents on{" "}
            {siteName}!
          </Button>
          <ProxyInput />
        </div>
      );
    }
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
        title="And much more …"
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
                {siteName} comes with a variety of software pre-installed, e.g.{" "}
                <A href={"/features/python"}>Python</A>,{" "}
                <A href={"/features/sage"}>SageMath</A> and{" "}
                <A href={"/features/octave"}>Octave</A>. You can{" "}
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
                computational elements – to express and share your ideas.
              </Paragraph>
              {!width.md && whiteboard}
            </Tool>
          </Col>
          <Col md={8}>
            <Tool
              icon="wrench"
              href="/features"
              alt="Features"
              title="Features Overview"
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
          title={"On-premises Offerings"}
        >
          On-premises Offerings
        </Button>
      </Paragraph>
    );

    return (
      <Info
        title="Offered Solutions"
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
              title="Online Service"
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
                Upgrade your projects at any time, to unlock internet access,
                better hosting quality, and other upgrades by purchasing a{" "}
                <A style={link} href={"/store/site-license"}>
                  site license
                </A>{" "}
                or upgrade via{" "}
                <A style={link} href={"https://doc.cocalc.com/paygo.html"}>
                  pay-as-you-go
                </A>
                .
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
                up to large university courses.
              </Paragraph>
              {!width.md && courseLink}
            </Tool>
          </Col>
          <Col md={8}>
            <Tool
              icon="network-wired"
              href={urlOnprem}
              alt="On-premises"
              title={"On-premises"}
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                It is possible to run {siteName} on your own infrastructure.
              </Paragraph>
              <Paragraph style={{ color: txtCol }}>
                There are two options available: an easy to setup{" "}
                <strong>single-server</strong> variant for a small working group
                and a highly scalable variant for a{" "}
                <strong>Kubernetes cluster</strong>.
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
    if (!openaiEnabled) return;
    return (
      <Info
        title="LLMs are here to help you"
        icon="robot"
        imageComponent={<ChatGPTHelp size="large" tag={"index"} />}
        anchor="a-realtimesync"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
      >
        <Paragraph>
          {siteName}'s file editors are enhanced by{" "}
          <A href={"https://en.wikipedia.org/wiki/Large_language_model"}>
            large language models
          </A>{" "}
          like <A href={"https://doc.cocalc.com/chatgpt.html"}>ChatGPT</A>. They
          help you{" "}
          <A href={"https://doc.cocalc.com/chatgpt.html#jupyter-notebooks"}>
            fixing errors
          </A>
          , generate code or LaTeX snippets, summarize documents, and much more.
        </Paragraph>
      </Info>
    );
  }

  function renderDemoCell() {
    if (!jupyterApiEnabled) return;

    return (
      <Info
        title="Many Programming Languages"
        icon="flow-chart"
        imageComponent={<DemoCell tag={"sage"} style={{ width: "100%" }} />}
        anchor="a-realtimesync"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.YELL_LLL }}
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
      {renderChatGPT()}
      {renderDemoCell()}
      {renderSandbox()}
      {renderCollaboration()}
      <AvailableTools style={{ backgroundColor: COLORS.YELL_LLL }} />
      {renderTeaching()}
      {renderMore()}
      {renderTestimonials()}
      {renderAvailableProducts()}
      <SignIn startup={siteName} hideFree={true} />
    </>
  );
}

export function Hero() {
  return (
    <Info.Heading
      level={2}
      textStyle={{ color: "white" }}
      style={{
        backgroundColor: COLORS.BLUE_D,
        paddingBottom: "30px",
        marginTop: "30px",
        paddingTop: "45px",
      }}
      description={
        <Paragraph
          italic
          style={{
            color: COLORS.GRAY_LL,
            paddingTop: "30px",
            maxWidth: MAX_WIDTH, // bit less wide on wide screens, so its easier to read
            margin: "0 auto",
          }}
        >
          <strong>Mission</strong>: Enable better collaboration in science,
          engineering and mathematics by providing easily accessible and
          sustainable tools for computing, teaching, and publishing.
        </Paragraph>
      }
    >
      <Icon name="user-plus" /> Improve your research, teaching, and publishing
      using realtime collaborative{" "}
      <A href="/features/jupyter-notebook" style={{ color: "white" }}>
        Jupyter notebooks
      </A>
      ,{" "}
      <A href="/features/latex-editor" style={{ color: "white" }}>
        LaTeX
      </A>
      , Markdown, and Linux.
    </Info.Heading>
  );
}

function PublishedPathsIndex() {
  const { result: publicPaths, error } = useAPI("public-paths/listing-cached");

  useEffect(() => {
    if (error) console.log(error);
  }, [error]);

  const text = "All published  files …";

  return (
    <>
      <div
        style={{
          maxHeight: "60vh",
          overflow: "auto",
          margin: "0 auto",
          padding: "0",
        }}
      >
        {publicPaths ? (
          <PublicPaths publicPaths={publicPaths} />
        ) : (
          <Loading large center />
        )}
      </div>
      <Paragraph
        style={{
          textAlign: "center",
          marginTop: "15px",
        }}
      >
        <Button
          size="large"
          onClick={() =>
            (window.location.href = join(
              basePath,
              "/share/public_paths/page/1",
            ))
          }
          title={text}
        >
          <Icon name="share-square" /> {text}
        </Button>
      </Paragraph>
    </>
  );
}
