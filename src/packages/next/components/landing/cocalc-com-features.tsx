/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Grid, Row } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import Path from "components/app/path";
import { AvailableTools, Tool } from "components/landing/available-tools";
import Info from "components/landing/info";
import { CSS, Paragraph, Text } from "components/misc";
import A from "components/misc/A";
import ProxyInput from "components/share/proxy-input";
import PublicPaths from "components/share/public-paths";
import { MAX_WIDTH, MAX_WIDTH_LANDING } from "lib/config";
import assignments from "public/features/cocalc-course-assignments-2019.png";
import SignIn from "./sign-in";
import RTC from "/public/features/cocalc-real-time-jupyter.png";

interface CCFeatures {
  sandboxProjectId?: string;
  siteName: string;
  shareServer: boolean;
  publicPaths: any[];
}

// NOTE: This component is only rendered if the onCoCalcCom customization variable is "true"
export default function CoCalcComFeatures(props: CCFeatures) {
  const { sandboxProjectId, siteName, shareServer, publicPaths } = props;
  const width = Grid.useBreakpoint();

  function renderCollaboration(): JSX.Element {
    return (
      <Info
        title="Collaborative editing"
        icon="users"
        image={RTC}
        anchor="a-realtimesync"
        alt={"Two browser windows editing the same Jupyter notebook"}
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
      >
        <Paragraph>
          Have you ever been frustrated sending files back and forth between
          your collaborators? Do you spend too much time on reviewing changes
          and merging documents?
        </Paragraph>
        <Paragraph>
          Share your computational documents like{" "}
          <A href={"/features/jupyter-notebook"}>
            <strong>Jupyter Notebooks</strong>
          </A>
          , <A href={"/features/latex-editor"}>LaTeX files</A>,{" "}
          <A href="/features/sage">SageMath Worksheets</A>,{" "}
          <A href={"/features/whiteboard"}>Computational Whiteboards</A> and
          many more with your collaborators.
        </Paragraph>
        <Paragraph>
          Everyone always stays on the same page, because all modifications are{" "}
          <strong>synchronized in real time</strong> and your code runs in the
          very same environment.
        </Paragraph>
      </Info>
    );
  }

  function renderTeaching() {
    return (
      <Info
        title="Made for Teaching"
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
          <A href="/features/teaching">
            <strong>Learn more about teaching with {siteName}</strong>
          </A>
          .
        </Paragraph>
      </Info>
    );
  }

  function renderSandbox() {
    if (sandboxProjectId)
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
    if (shareServer)
      return (
        <Info
          title={
            <>
              Explore what{" "}
              <A href="/share/public_paths/page/1">people have published</A> on{" "}
              {siteName}!
            </>
          }
          level={2}
          icon="share-square"
          anchor="a-teaching"
          style={{ backgroundColor: COLORS.GRAY_LLL }}
        >
          <div
            style={{
              maxHeight: "60vh",
              overflow: "auto",
              margin: "0 auto",
              maxWidth: MAX_WIDTH_LANDING,
              padding: "15px",
            }}
          >
            <ProxyInput />
            {publicPaths && <PublicPaths publicPaths={publicPaths} />}
          </div>
        </Info>
      );
  }

  function renderMore(): JSX.Element {
    const software = (
      <Paragraph style={{ textAlign: "center" }}>
        <A href="/software">
          <strong>Learn more about software on {siteName}</strong>
        </A>
      </Paragraph>
    );
    const whiteboard = (
      <Paragraph style={{ textAlign: "center" }}>
        <A href="/features/whiteboard">
          <strong>Learn more about the whiteboard</strong>
        </A>
      </Paragraph>
    );
    const features = (
      <Paragraph style={{ textAlign: "center" }}>
        <A href="/features">
          <strong>Learn more about all features</strong>
        </A>
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
              icon="hdd"
              href="/software"
              title="Available Software"
              alt="Available Software"
            >
              <Paragraph>
                {siteName} comes with a variety of software pre-installed, e.g.{" "}
                <A href={"/features/python"}>Python</A>,{" "}
                <A href={"/features/sage"}>SageMath</A> and{" "}
                <A href={"/features/octave"}>Octave</A>. You can install
                additional software locally in your project as well.
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
    };

    const bottom: CSS = {
      color: txtCol,
      textAlign: "center",
      fontSize: "150%",
    };

    const urlProducts = "/pricing/products";
    const urlCourses = "/pricing/courses";
    const urlOnprem = "/pricing/onprem";

    const productsLink = (
      <Paragraph style={bottom}>
        <A href={urlProducts} style={link}>
          <strong>Products Overview</strong>
        </A>
      </Paragraph>
    );

    const courseLink = (
      <Paragraph style={bottom}>
        <A href={urlCourses} style={link}>
          <strong>Course Licenses</strong>
        </A>
      </Paragraph>
    );

    const onpremLink = (
      <Paragraph style={bottom}>
        <A href={urlOnprem} style={link}>
          <strong>On-premises Offerings</strong>
        </A>
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
              title="Professional use"
              alt="Professional use"
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                You can start using {siteName} for free today. Create a{" "}
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
                better hosting quality, and other upgrades by{" "}
                <A style={link} href={"/store/site-license"}>
                  purchasing a site license
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
              title="Teaching a Course"
              alt="Teaching a Course"
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                {siteName} is made for{" "}
                <A style={link} href="/features/teaching">
                  teaching a course online
                </A>
                .
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

  return (
    <>
      {renderSandbox()}
      {renderShareServer()}
      {renderCollaboration()}
      <AvailableTools style={{ backgroundColor: COLORS.YELL_LLL }} />
      {renderTeaching()}
      {renderMore()}
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
