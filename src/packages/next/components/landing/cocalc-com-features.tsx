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
import { MAX_WIDTH_LANDING } from "lib/config";
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
    return (
      <Info
        title="And much more …"
        icon="wrench"
        anchor="more"
        style={{ backgroundColor: COLORS.YELL_LLL }}
      >
        <Row>
          <Col lg={8}>
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
              <Paragraph style={{ textAlign: "center" }}>
                <A href="/software">
                  <strong>Learn more about software on {siteName}</strong>
                </A>
              </Paragraph>
            </Tool>
          </Col>
          <Col lg={8}>
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
              <Paragraph style={{ textAlign: "center" }}>
                <A href="/features/whiteboard">
                  <strong>Learn more about the whiteboard</strong>
                </A>
              </Paragraph>
            </Tool>
          </Col>
          <Col lg={8}>
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
              <Paragraph style={{ textAlign: "center" }}>
                <A href="/features">
                  <strong>Learn more about all features</strong>
                </A>
                .
              </Paragraph>
            </Tool>
          </Col>
        </Row>
      </Info>
    );
  }

  function renderAvailableProducts(): JSX.Element {
    const txtCol = COLORS.GRAY_LLL;
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

    const productsLink = (
      <Col lg={8}>
        <Paragraph style={bottom}>
          <A href="/pricing/products" style={link}>
            <strong>Products Overview</strong>
          </A>
        </Paragraph>
      </Col>
    );

    const courseLink = (
      <Col lg={8}>
        <Paragraph style={bottom}>
          <A href="/pricing/courses" style={link}>
            <strong>Course Licenses</strong>
          </A>
        </Paragraph>
      </Col>
    );

    const onpremLink = (
      <Col lg={8}>
        <Paragraph style={bottom}>
          <A href="/pricing/onprem" style={link}>
            <strong>On-premises Offerings</strong>
          </A>
        </Paragraph>
      </Col>
    );

    return (
      <Info
        title="Offered Solutions"
        icon="shopping-cart"
        anchor="products"
        style={{ backgroundColor: COLORS.BLUE_D }}
        textStyle={{ color: COLORS.GRAY_LLL }}
      >
        <Row>
          <Col lg={8}>
            <Tool
              icon="server"
              href="/pricing/products"
              title="Personal use"
              alt="Personal use"
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
                better hosting quality, and other upgrades by purchasing a{" "}
                <A style={link} href={"https://doc.cocalc.com/licenses.html"}>
                  site license
                </A>
                .
              </Paragraph>
              {!width.lg && productsLink}
            </Tool>
          </Col>
          <Col lg={8}>
            <Tool
              icon="graduation-cap"
              href="/pricing/courses"
              title="Teaching a Course"
              alt="Teaching a Course"
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                {siteName} is made for{" "}
                <A style={link} href="/features/teaching">
                  teaching a course online
                </A>
                . Explore{" "}
                <A style={link} href="pricing/courses">
                  course license options
                </A>{" "}
                to learn about pricing and how to get started.
              </Paragraph>
              {!width.lg && courseLink}
            </Tool>
          </Col>
          <Col lg={8}>
            <Tool
              icon="network-wired"
              href="/features"
              alt="On-premises"
              title={"On-premises"}
              textStyle={{ color: toolCol }}
            >
              <Paragraph style={{ color: txtCol }}>
                It is possible to run {siteName} on your own infrastructure.
                There are two options available: a single-server variant for a
                small working group, or a highly scalable variant for a
                Kubernetes cluster.
              </Paragraph>
              {!width.lg && onpremLink}
            </Tool>
          </Col>
          {width.lg && (
            <>
              {productsLink}
              {courseLink}
              {onpremLink}
            </>
          )}
        </Row>
      </Info>
    );
  }

  return (
    <>
      <Info.Heading
        textStyle={{ color: "white" }}
        style={{
          backgroundColor: COLORS.BLUE_D,
          paddingBottom: "30px",
          marginTop: "30px",
          paddingTop: "45px",
        }}
        description={<>See what {siteName} can do for you in more detail.</>}
      >
        <Icon name="lightbulb" /> Learn all about {siteName}
      </Info.Heading>
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
