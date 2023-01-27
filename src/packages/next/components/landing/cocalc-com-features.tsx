/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import Path from "components/app/path";
import { AvailableTools, Tool } from "components/landing/available-tools";
import Info from "components/landing/info";
import { Paragraph, Text, Title } from "components/misc";
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
          Have you ever been frustrated sending files back and forth with
          collaborators? Spending too much time on reviewing changes and merging
          documents?
        </Paragraph>
        <Paragraph>
          Share your computational documents like{" "}
          <A href={"/features/jupyter-notebook"}>
            <strong>Jupyter Notebooks</strong>
          </A>
          , <A href={"/features/latex-editor"}>LaTeX files</A>,{" "}
          <A href={"/features/whiteboar"}>Whiteboards</A> and many more on{" "}
          {siteName} with your project collaborators.
        </Paragraph>
        <Paragraph>
          All modifications are <strong>synchronized in real time</strong> and
          your code runs in the very same environment.
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
          <Text strong>Pre-installed Software</Text> like in a computer lab, all
          software you need is already installed and ready to use.
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
        <div style={{ marginBottom: "30px" }}>
          <Title level={3} style={{ textAlign: "center", color: COLORS.GRAY }}>
            The Public {siteName} Sandbox
          </Title>
          <Path
            style={{ marginRight: "15px", marginBottom: "15px" }}
            project_id={sandboxProjectId}
            description="Public Sandbox"
          />
        </div>
      );
  }

  function renderShareServer() {
    if (shareServer)
      return (
        <Info
          title={
            <>
              Explore what{" "}
              <A href="/share/public_paths/page/1">people have published</A>{" "}
              using {siteName}!
            </>
          }
          level={2}
          icon="share-square"
          anchor="a-teaching"
          style={{ backgroundColor: "white" }}
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

  function renderMore() {
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
              icon="network-wired"
              href="/software"
              title="Software"
              alt="Software"
            >
              <Paragraph>
                {siteName} comes with a variety of software pre-installed, e.g.{" "}
                <A href={"/features/python"}>Python</A>,{" "}
                <A href={"/features/sage"}>SageMath</A> and{" "}
                <A href={"/features/octave"}>Octave</A>. You can install
                additional software locally in your project as well.
              </Paragraph>
              <Paragraph>
                <A href="/software">
                  <strong>Learn more about software on {siteName}</strong>
                </A>
                .
              </Paragraph>
            </Tool>
          </Col>
          <Col lg={8}>
            <Tool
              icon="layout"
              href="/features/whiteboard"
              title="Whiteboard"
              alt="Whiteboard"
            >
              <Paragraph>
                Use a full featured collaborative whiteboard – with support for
                computational elements – to express and share your ideas.
              </Paragraph>
              <Paragraph>
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
              title={<>All Features</>}
            >
              <Paragraph>
                {siteName} offers a variety of features to make your life
                easier. You can find a list of all features{" "}
                <A href="/features">here</A>.
              </Paragraph>
              <Paragraph>
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

  return (
    <>
      <Info.Heading
        style={{
          backgroundColor: COLORS.GRAY_LLL,
          marginBottom: "30px",
          marginTop: "30px",
          paddingTop: "30px",
        }}
        description={<>See what {siteName} can do for you in more depth.</>}
      >
        <Icon name="lightbulb" /> Learn all about {siteName}
      </Info.Heading>

      {renderSandbox()}
      {renderShareServer()}
      {renderCollaboration()}
      <AvailableTools style={{ backgroundColor: COLORS.YELL_LLL }} />
      {renderTeaching()}
      {renderMore()}
      <SignIn startup={siteName} hideFree={true} />
    </>
  );
}
