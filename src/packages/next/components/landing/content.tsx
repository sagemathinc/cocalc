/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row, Space } from "antd";
import { ReactNode } from "react";

import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";
import Path from "components/app/path";
import { CSS, Paragraph, Title } from "components/misc";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { MAX_WIDTH_LANDING } from "lib/config";
import useCustomize from "lib/use-customize";
import Image from "./image";
import SignIn from "./sign-in";

// See https://github.com/vercel/next.js/issues/29788 for why we have to define this for now (it's to work around a bug).
interface StaticImageData {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
}

interface Props {
  aboveImage?: ReactNode;
  alignItems?: "center" | "flex-start";
  alt?: string;
  caption?;
  description?: ReactNode;
  image?: string | StaticImageData;
  imageAlternative?: JSX.Element | string; // string as markdown, replaces the image
  landing?: boolean;
  body?: ReactNode | string | StaticImageData;
  startup?: ReactNode;
  style?: React.CSSProperties;
  subtitle?: ReactNode;
  subtitleBelow?: boolean;
  title: ReactNode;
}

const SUBTITLE_STYLE: CSS = {
  color: COLORS.GRAY_D,
  textAlign: "center",
};

function Logo({ logo, title }) {
  if (!logo) return null;
  if (typeof logo === "string" || logo.src != null) {
    return <Image src={logo} style={{ width: "40%" }} alt={`${title} logo`} />;
  } else {
    return logo;
  }
}

export default function Content(props: Props) {
  const {
    aboveImage,
    alignItems = "center",
    alt,
    caption,
    description,
    image,
    imageAlternative,
    landing = false, // for all pages on /landing/* – makes the splash content background at the top blue-ish
    body,
    startup,
    style,
    subtitle,
    subtitleBelow = false,
    title,
  } = props;

  const { sandboxProjectId } = useCustomize();

  function renderIndexInfo() {
    if (!imageAlternative) return;
    if (typeof imageAlternative === "string") {
      return (
        <Col xs={24}>
          <SanitizedMarkdown
            value={imageAlternative}
            style={{ padding: "20xp" }}
          />
        </Col>
      );
    } else {
      return <Col xs={24}>{imageAlternative}</Col>;
    }
  }

  function renderTitle() {
    if (title)
      return (
        <Title level={2} style={{ color: COLORS.GRAY_DD }}>
          {title}
        </Title>
      );
  }

  function renderSubtitleTop() {
    if (subtitleBelow) return;
    return (
      <Title level={4} style={SUBTITLE_STYLE}>
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
          <Title level={4} style={SUBTITLE_STYLE}>
            {subtitle}
          </Title>
        </Col>
      </>
    );
  }

  function renderImage() {
    // if the index info is anything more than an empty string, we render this here instead
    if (!!imageAlternative) return renderIndexInfo();
    if (!image) return;
    return (
      <>
        <Image
          src={image}
          priority={true}
          style={{ paddingRight: "15px", paddingLeft: "15px" }}
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

  function renderLogo() {
    if (typeof body === "string" || (body as StaticImageData)?.src != null) {
      return (
        <Logo
          logo={body}
          title={title}
        />
      );
    } else {
      return (
        <>
          {body}
        </>
      );
    }
  }

  return (
    <div
      style={{
        ...(landing && { backgroundColor: COLORS.LANDING.TOP_BG }),
        ...style,
      }}
    >
      <Row
        gutter={[20, 30]}
        style={{
          paddingTop: "12px",
          maxWidth: MAX_WIDTH_LANDING,
          marginTop: "0",
          marginBottom: "0",
          marginLeft: "auto",
          marginRight: "auto",
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
            size="large"
            direction="vertical"
            style={{ textAlign: "center", width: "100%" }}
          >
            {renderLogo()}
            {renderTitle()}
            {subtitle && renderSubtitleTop()}
            {description && (
              <Title
                level={4}
                style={{ color: COLORS.GRAY }}
              >
                {description}
              </Title>
            )}
          </Space>
        </Col>
        <Col sm={14} xs={24}>
          {renderAboveImage()}
          {renderImage()}
          {renderBelowImage()}
        </Col>
        {subtitle && renderSubtitleBelow()}
        <Col lg={24}>
          <SignIn startup={startup ?? title} hideFree={true} />
        </Col>
      </Row>
    </div>
  );
}
