/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row, Space } from "antd";
import { ReactNode } from "react";

import Path from "components/app/path";
import SignIn from "components/landing/sign-in";
import { Paragraph, Title } from "components/misc";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { MAX_WIDTH_LANDING } from "lib/config";
import useCustomize from "lib/use-customize";
import Image from "./image";
import { COLORS } from "@cocalc/util/theme";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

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
  alignItems?: "center" | "flex-start";
}

function Logo({ logo, title }) {
  if (!logo) return null;
  if (typeof logo === "string" || logo.src != null) {
    return (
      <Image src={logo} style={{ width: "200px" }} alt={`${title} logo`} />
    );
  } else {
    return logo;
  }
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
    alignItems = "center",
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
      <Title level={3} style={{ color: COLORS.GRAY_DD }}>
        {typeof subtitle === "string" ? (
          <StaticMarkdown value={subtitle} />
        ) : (
          subtitle
        )}
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
          style={{
            textAlign: "center",
            color: COLORS.GRAY_DD,
            fontSize: "12pt",
          }}
        >
          {caption}
        </Paragraph>
      </>
    );
  }

  function renderAboveImage() {
    if (aboveImage != null) return aboveImage;
  }

  function renderBelowImage() {
    if (aboveImage == null && sandboxProjectId) {
      return (
        <div style={{ margin: "15px" }}>
          <Path
            style={{ marginBottom: "15px" }}
            project_id={sandboxProjectId}
            description="Public Sandbox"
          />
        </div>
      );
    }
  }

  return (
    <>
      <Row
        gutter={[20, 30]}
        style={{
          padding: "30px 0",
          maxWidth: MAX_WIDTH_LANDING,
        }}
      >
        <Col
          sm={10}
          xs={24}
          style={{
            display: "flex",
            alignItems: alignItems,
          }}
        >
          <Space
            size="middle"
            direction="vertical"
            style={{ textAlign: "center", width: "100%" }}
          >
            <>
              {typeof logo === "string" ||
              (logo as StaticImageData)?.src != null ? (
                <Logo logo={logo} title={title} />
              ) : (
                logo
              )}
            </>
            {renderSubtitleTop()}
            <Title level={4} style={{ color: COLORS.GRAY }}>
              {description}
            </Title>
          </Space>
        </Col>
        <Col sm={14} xs={24}>
          {renderAboveImage()}
          {renderImage()}
          {renderBelowImage()}
        </Col>
        {renderSubtitleBelow()}
      </Row>
      <SignIn startup={startup ?? title} hideFree={true} />
    </>
  );
}
