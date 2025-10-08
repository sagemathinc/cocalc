/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row, Space } from "antd";
import { CSSProperties, ReactNode, type JSX } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { TitleProps } from "antd/es/typography/Title";
import { CSS, Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH_LANDING } from "lib/config";
import Image, { StaticImageData } from "./image";
import { MediaURL, SHADOW } from "./util";

interface Props {
  alt?: string;
  anchor: string;
  below?: ReactNode;
  belowWide?: boolean;
  caption?: ReactNode;
  children: ReactNode;
  icon?: IconName | JSX.Element;
  image?: string | StaticImageData;
  imageComponent?: ReactNode; // if set, this replaces the image!
  level?: TitleProps["level"];
  narrow?: boolean; // emphasis on the text part, not the image.
  style?: CSSProperties;
  swapCols?: boolean; // if true, then put text on left and image on right.
  textStyle?: CSSProperties;
  textStyleExtra?: CSSProperties;
  title: ReactNode;
  video?: string | string[];
  wide?: boolean; // if given image is wide and could use more space or its very hard to see.
  innerRef?;
  icons?: { icon: IconName | JSX.Element; title?: string; link?: string }[];
}

export default function Info({
  alt,
  anchor,
  below,
  belowWide = false,
  caption,
  children,
  icon,
  image,
  imageComponent,
  level = 1,
  narrow = false,
  style,
  swapCols,
  textStyle,
  textStyleExtra,
  title,
  video,
  wide,
  innerRef,
  icons,
}: Props) {
  function renderIcons() {
    if (icons == null || icons.length == 0) {
      return null;
    }
    return (
      <div style={{ margin: "auto" }}>
        <Space size={"large"}>
          {icons.map(({ icon, title, link }, idx) => {
            const elt = (
              <div style={{ textAlign: "center", color: "#333" }}>
                {typeof icon === "string" ? (
                  <Icon name={icon} style={{ fontSize: "28pt" }} key={icon} />
                ) : (
                  icon
                )}
                <br />
                {title ?? capitalize(typeof icon === "string" ? icon : "")}
              </div>
            );
            if (link) {
              return (
                <A key={idx} href={link}>
                  {elt}
                </A>
              );
            }
            return elt;
          })}
        </Space>
      </div>
    );
  }
  function renderBelow() {
    if (!below) return;

    if (belowWide) {
      return (
        <Col
          lg={{ span: 20, offset: 2 }}
          md={{ span: 22, offset: 1 }}
          style={{ paddingTop: "30px" }}
        >
          {below}
        </Col>
      );
    } else {
      return (
        <Col
          lg={{ span: 16, offset: 4 }}
          md={{ span: 18, offset: 3 }}
          style={{ paddingTop: "30px" }}
        >
          {below}
        </Col>
      );
    }
  }

  const head = (
    <Title
      level={level}
      id={anchor}
      style={{
        textAlign: "center",
        marginBottom: "30px",
        color: COLORS.GRAY_D,
        ...textStyle,
      }}
    >
      {icon != null && (
        <span style={{ fontSize: "24pt", marginRight: "5px" }}>
          {typeof icon === "string" ? <Icon name={icon} /> : icon}{" "}
        </span>
      )}
      {title}
    </Title>
  );

  let graphic: ReactNode = null;

  // common for "text" and "text + image" div wrappers
  const padding: CSS = {
    paddingTop: "45px",
    paddingBottom: "45px",
    paddingLeft: "15px",
    paddingRight: "15px",
  };

  if (image != null) {
    graphic = <Image shadow src={image} alt={alt ?? ""} />;
  } else if (video != null) {
    const videoSrcs = typeof video == "string" ? [video] : video;
    verifyHasMp4(videoSrcs);
    graphic = (
      <div style={{ position: "relative", width: "100%" }}>
        <video style={{ width: "100%", ...SHADOW }} loop controls>
          {sources(videoSrcs)}
        </video>
      </div>
    );
  } else if (imageComponent != null) {
    graphic = imageComponent;
  }

  if (graphic != null && caption != null) {
    graphic = (
      <div>
        {graphic}
        <br />
        <br />
        <Paragraph
          style={{
            textAlign: "center",
            color: COLORS.GRAY_D,
          }}
        >
          {caption}
        </Paragraph>
      </div>
    );
  }

  if (!graphic) {
    const noGraphicTextStyle: CSSProperties = {
      ...style,
    };

    if (textStyleExtra != null) {
      // if textColStyleExtra is given, then merge it into noGraphicTextStyle.
      Object.assign(noGraphicTextStyle, textStyleExtra);
    }

    const icons = renderIcons();

    return (
      <div
        style={{
          width: "100%",
          ...padding,
          ...style,
        }}
      >
        <div style={{ maxWidth: MAX_WIDTH_LANDING, margin: "0 auto" }}>
          <div style={noGraphicTextStyle}>
            <div style={{ textAlign: "center" }}>{head}</div>
            <div
              style={{ margin: "auto", maxWidth: wide ? "600px" : undefined }}
            >
              {children}
            </div>
            {icons && (
              <div style={{ marginTop: "20px", textAlign: "center" }}>
                {icons}
              </div>
            )}
            {below && <div style={{ marginTop: "20px" }}>{below}</div>}
          </div>
        </div>
      </div>
    );
  }

  const textColStyle: CSSProperties = {
    padding: "0 20px 0 20px",
    marginBottom: "15px",
    display: "flex",
    justifyContent: "start",
    alignContent: "start",
    flexDirection: "column",
  };

  if (textStyleExtra != null) {
    // if textColStyleExtra is given, then merge it into textColStyle.
    Object.assign(textColStyle, textStyleExtra);
  }

  const widths = wide ? [7, 17] : narrow ? [12, 12] : [9, 15];

  const textCol = (
    <Col key="text" lg={widths[0]} style={textColStyle}>
      {children}
    </Col>
  );
  const graphicCol = (
    <Col
      key="graphics"
      lg={widths[1]}
      style={{ padding: "0 30px 15px 30px", width: "100%" }}
    >
      {graphic}
    </Col>
  );

  const cols = swapCols ? [textCol, graphicCol] : [graphicCol, textCol];

  return (
    <div
      ref={innerRef}
      style={{
        ...padding,
        background: "white",
        fontSize: "11pt",
        ...style,
      }}
    >
      <>
        {head}
        <Row
          style={{
            maxWidth: MAX_WIDTH_LANDING,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {cols}
          {renderBelow()}
          {renderIcons()}
        </Row>
      </>
    </div>
  );
}

function sources(video: string[]) {
  const v: JSX.Element[] = [];
  for (const x of video) {
    v.push(<source key={x} src={MediaURL(x)} />);
  }
  return v;
}

function verifyHasMp4(video: string[]) {
  for (const x of video) {
    if (x.endsWith(".mp4")) {
      return;
    }
  }
  console.warn(
    "include mp4 format for the video, so that it is viewable on iOS!!",
    video,
  );
}

interface HeadingProps {
  children: ReactNode;
  description?: ReactNode;
  style?: CSSProperties;
  textStyle?: CSSProperties;
  level?: TitleProps["level"];
  anchor?: string;
  icon?: IconName | JSX.Element;
}

Info.Heading = (props: HeadingProps) => {
  const {
    level = 1,
    children,
    description,
    style,
    textStyle,
    anchor,
    icon,
  } = props;
  return (
    <div
      style={{
        ...{
          textAlign: "center",
          margin: "0",
          padding: "20px",
        },
        ...style,
      }}
    >
      <Title
        level={level}
        id={anchor}
        style={{
          color: COLORS.GRAY_D,
          maxWidth: MAX_WIDTH_LANDING,
          margin: "0 auto 20px auto",
          ...textStyle,
        }}
      >
        {icon != null && (
          <span style={{ fontSize: "24pt", marginRight: "5px" }}>
            {typeof icon === "string" ? <Icon name={icon} /> : icon}{" "}
          </span>
        )}
        {children}
      </Title>
      {description && (
        <Paragraph
          style={{
            fontSize: "13pt",
            color: COLORS.GRAY_D,
            ...textStyle,
          }}
        >
          {description}
        </Paragraph>
      )}
    </div>
  );
};
