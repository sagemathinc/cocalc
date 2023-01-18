/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";
import SignIn from "components/landing/sign-in";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { ReactNode } from "react";
import Image from "./image";
import useCustomize from "lib/use-customize";
import Path from "components/app/path";
import { Paragraph, Title } from "components/misc";

// See https://github.com/vercel/next.js/issues/29788 for why we have to define this for now (it's to work around a bug).
interface StaticImageData {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
}

interface Props {
  alt?: string;
  caption?: string;
  description?: ReactNode;
  image?: string | StaticImageData;
  aboveImage?: ReactNode;
  indexInfo?: string;
  logo?: ReactNode | string | StaticImageData;
  startup?: ReactNode;
  subtitle: ReactNode;
  subtitleBelow?: boolean;
  title: ReactNode;
}

function Logo({ logo, title }) {
  if (!logo) return null;
  if (typeof logo == "string" || logo?.src != null) {
    return (
      <Image src={logo} style={{ width: "200px" }} alt={`${title} logo`} />
    );
  }
  return logo;
}

export default function Content(props: Props) {
  const {
    title,
    alt,
    caption,
    description,
    image,
    aboveImage,
    indexInfo,
    logo,
    startup,
    subtitle,
    subtitleBelow = false,
  } = props;

  const { sandboxProjectId } = useCustomize();

  function renderIndexInfo() {
    if (!indexInfo) return;
    return (
      <Col xs={20}>
        <SanitizedMarkdown value={indexInfo} style={{ padding: "20xp" }} />
      </Col>
    );
  }

  function renderSubtitleTop() {
    if (subtitleBelow) return;
    return (
      <Title level={3} style={{ color: "#333" }}>
        {subtitle}
      </Title>
    );
  }

  function renderSubtitleBelow() {
    if (!subtitleBelow) return;
    return (
      <>
        <Col xs={0} sm={4}></Col>
        <Col xs={24} sm={16}>
          <Title level={3} style={{ textAlign: "center", marginTop: "30px" }}>
            {subtitle}
          </Title>
        </Col>
      </>
    );
  }

  function renderImage() {
    // if the index info is anything more than an empty string, we render this here instead
    if (!!indexInfo) return renderIndexInfo();
    if (!image) return;
    return (
      <>
        <Image
          src={image}
          priority={true}
          style={{ padding: "15px" }}
          alt={alt ?? `Image illustrating ${title}`}
        />
        <Paragraph
          style={{ textAlign: "center", color: "#333", fontSize: "12pt" }}
        >
          {caption}
        </Paragraph>
      </>
    );
  }

  function renderAboveImage() {
    return aboveImage != null
      ? aboveImage
      : sandboxProjectId && (
          <div style={{ margin: "15px" }}>
            <Path
              style={{ marginBottom: "15px" }}
              project_id={sandboxProjectId}
              description="Public Sandbox"
            />
          </div>
        );
  }

  return (
    <div style={{ padding: "30px 0" }}>
      <Row>
        <Col
          sm={10}
          xs={24}
          style={{
            display: "flex",
            alignItems: "center",
            paddingTop: "15px",
          }}
        >
          <Paragraph
            style={{ textAlign: "center", margin: "auto", padding: "0 10%" }}
          >
            <Logo logo={logo} title={title} />
            <br />
            <br />
            <Title level={2} style={{ color: "#333" }}>
              {title}
            </Title>
            {renderSubtitleTop()}
            <Title level={3} style={{ color: "#666" }}>
              {description}
            </Title>
          </Paragraph>
        </Col>
        <Col sm={14} xs={24}>
          {renderAboveImage()}
          {renderImage()}
        </Col>
        {renderSubtitleBelow()}
      </Row>
      <SignIn
        startup={startup ?? title}
        hideFree={true}
        style={{ paddingBottom: 0 }}
      />
    </div>
  );
}
