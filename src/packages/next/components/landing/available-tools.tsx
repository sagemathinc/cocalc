/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row } from "antd";
import { ReactNode } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import Image from "components/landing/image";
import LaTeX from "components/landing/latex";
import { CSS, Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import latexLogo from "public/features/latex-logo.svg";
import linuxLogo from "public/features/linux-logo.svg";
import sticker from "public/features/sage-sticker-1x1_inch-small.png";
import Info from "./info";
import JupyterLogo from "/public/features/jupyter-logo.svg";
import { LANDING_HEADER_LEVEL } from "./constants";

interface Props {
  style?: React.CSSProperties;
}

export function AvailableTools(props: Props) {
  const { style } = props;

  return (
    <Info
      level={LANDING_HEADER_LEVEL}
      title="Jupyter, SageMath, LaTeX, and Linux"
      icon="wrench"
      anchor="available-tools"
      style={{ ...style }}
    >
      <Row>
        <Col lg={6}>
          <Tool
            image={JupyterLogo}
            href="/features/jupyter-notebook"
            title="Jupyter Notebooks"
            alt="Jupyter logo"
          >
            CoCalc's own{" "}
            <A href="/features/jupyter-notebook">Jupyter Notebook</A>{" "}
            implementation offers realtime synchronization, TimeTravel,
            automatic grading, side chat, and more.
          </Tool>
        </Col>
        <Col lg={6}>
          <Tool
            image={sticker}
            href="https://doc.cocalc.com/sagews.html"
            title="Sage Worksheets"
            alt="SageMath sticker logo"
          >
            <A href="https://doc.cocalc.com/sagews.html">Sage Worksheets</A> are
            similar to Jupyter Notebooks, but made to work well with{" "}
            <A href="https://www.sagemath.org">SageMath</A>. They offer a
            single-document model that scales to large documents and integrated
            3d graphics.
          </Tool>
        </Col>
        <Col lg={6}>
          <Tool
            image={latexLogo}
            href="/features/latex-editor"
            alt="LaTeX Logo"
            title={
              <>
                <LaTeX /> Editor
              </>
            }
          >
            A full{" "}
            <A href="/features/latex-editor">
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
            image={linuxLogo}
            href="/features/terminal"
            title="Linux Terminal"
            alt="Tux Linux Penguin"
          >
            The very sophisticated collaborative{" "}
            <A href={"/features/linux"}>Linux</A> Terminal makes you incredibly
            productive. Many programming languages and hundreds of tools are
            available at your fingertips in a{" "}
            <A href="/features/linux">full Ubuntu Linux environment</A>.
          </Tool>
        </Col>
      </Row>
    </Info>
  );
}

interface ToolProps {
  image?;
  alt: string;
  href: string;
  title: ReactNode;
  children: ReactNode;
  icon?: IconName;
  size?: number;
  style?: CSS;
  textStyle?: CSS;
}

export function Tool(props: ToolProps) {
  const {
    size = 75,
    image,
    alt,
    href,
    title,
    children,
    icon,
    style,
    textStyle,
  } = props;

  return (
    <div style={{ padding: "15px" }}>
      <div
        style={{
          textAlign: "center",
          marginBottom: "15px",
          height: "100px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          ...style,
        }}
      >
        <A href={href}>
          {image ? (
            <Image
              style={{ width: "75px", margin: "auto", ...textStyle }}
              src={image}
              alt={alt}
            />
          ) : (
            <Icon
              name={icon}
              style={{ color: "black", fontSize: `${size}px`, ...textStyle }}
            />
          )}
        </A>
      </div>
      <Title level={3} style={{ textAlign: "center" }}>
        <A href={href} style={{ ...textStyle }}>
          {title}
        </A>
      </Title>
      <Paragraph style={{ ...textStyle }}>{children}</Paragraph>
    </div>
  );
}
