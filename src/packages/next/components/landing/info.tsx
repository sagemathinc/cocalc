import { Row, Col } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { CSSProperties, ReactNode } from "react";
import { MediaURL } from "./util";
import Image, { StaticImageData } from "./image";
import { MAX_WIDTH } from "lib/config";

const showcase = {
  width: "100%",
  boxShadow: "2px 2px 4px rgb(0 0 0 / 25%), 0 2px 4px rgb(0 0 0 / 22%)",
  borderRadius: "3px",
} as CSSProperties;

interface Props {
  anchor: string;
  icon?: IconName;
  title: ReactNode;
  image?: string | StaticImageData;
  alt: string;
  video?: string | string[];
  caption?: ReactNode;
  children: ReactNode;
  wide?: boolean; // if given image is wide and could use more space or its very hard to see.
  swapCols?: boolean; // if true, then put text on left and image on right.
  textStyleExtra?: CSSProperties;
}

export default function Info(props: Props) {
  const {
    anchor,
    icon,
    title,
    image,
    alt,
    video,
    caption,
    children,
    wide,
    swapCols,
    textStyleExtra,
  } = props;

  const head = (
    <h1
      id={anchor}
      style={{ textAlign: "center", marginBottom: "20px", color: "#333" }}
    >
      {icon && (
        <span style={{ fontSize: "24pt", marginRight: "5px" }}>
          <Icon name={icon} />{" "}
        </span>
      )}
      {title}
    </h1>
  );

  let graphic: ReactNode = null;

  if (image != null) {
    graphic = <Image style={showcase} src={image} alt={alt ?? caption} />;
  } else if (video != null) {
    const videoSrcs = typeof video == "string" ? [video] : video;
    verifyHasMp4(videoSrcs);
    graphic = (
      <div style={{ position: "relative", width: "100%" }}>
        <video style={showcase} loop controls>
          {sources(videoSrcs)}
        </video>
      </div>
    );
  }

  if (graphic != null && caption != null) {
    graphic = (
      <div>
        {graphic}
        <br />
        <br />
        <div style={{ textAlign: "center", color: "#666", fontSize: "13pt" }}>
          {caption}
        </div>
      </div>
    );
  }

  if (!graphic) {
    const noGraphicTextStyle: CSSProperties = {
      background: "#fafafa",
      padding: "20px",
      marginBottom: "15px",
    };

    if (textStyleExtra != null) {
      // if textColStyleExtra is given, then merge it into noGraphicTextStyle.
      Object.assign(noGraphicTextStyle, textStyleExtra);
    }

    return (
      <div style={{ width: "100%" }}>
        <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto" }}>
          <div style={noGraphicTextStyle}>
            <div style={{ textAlign: "center" }}>{head}</div>
            <div
              style={{ margin: "auto", maxWidth: wide ? "600px" : undefined }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const textColStyle: CSSProperties = {
    border: "1px solid white",
    borderRadius: "5px",
    padding: "0 20px 0 20px",
    marginBottom: "15px",
    display: "flex",
    justifyContent: "start",
    alignContent: "start",
    flexDirection: "column",
    fontSize: "12pt",
  };

  if (textStyleExtra != null) {
    // if textColStyleExtra is given, then merge it into textColStyle.
    Object.assign(textColStyle, textStyleExtra);
  }

  const textCol = (
    <Col key="text" lg={wide ? 7 : 9} style={textColStyle}>
      {children}
    </Col>
  );
  const graphicCol = (
    <Col
      key="graphics"
      lg={wide ? 17 : 15}
      style={{ padding: "0 30px", width: "100%" }}
    >
      {graphic}
    </Col>
  );

  const cols = swapCols ? [textCol, graphicCol] : [graphicCol, textCol];

  return (
    <div style={{ padding: "60px 5%", background: "white", fontSize: "11pt" }}>
      <>
        {head}
        <Row>{cols}</Row>
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
    video
  );
}

interface HeadingProps {
  children: ReactNode;
  description?: ReactNode;
  style?: CSSProperties;
}

Info.Heading = ({ children, description, style }: HeadingProps) => {
  return (
    <div
      style={{
        ...{ textAlign: "center", margin: "40px" },
        ...style,
      }}
    >
      <h1
        style={{
          fontSize: "400%",
          color: "#444",
        }}
      >
        {children}
      </h1>
      <div style={{ fontSize: "13pt", color: "#666" }}>{description}</div>
    </div>
  );
};
