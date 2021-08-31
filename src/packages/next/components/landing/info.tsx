import { Row, Col } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { ReactNode } from "react";
import { MediaURL } from "./util";

interface Props {
  anchor: string;
  icon?: IconName;
  title: ReactNode;
  image?: string;
  video?: string | string[];
  children: ReactNode;
}

export default function Info({
  anchor,
  icon,
  title,
  image,
  video,
  children,
}: Props) {
  const head = (
    <h2 id={anchor}>
      {icon && (
        <>
          <Icon name={icon} />{" "}
        </>
      )}
      {title}
    </h2>
  );

  let graphic: ReactNode = null;
  if (image != null) {
    graphic = <img style={{ maxWidth: "100%" }} src={MediaURL(image)} />;
  } else if (video != null) {
    if (typeof video == "string") video = [video];
    verifyHasMp4(video);
    graphic = (
      <div style={{ position: "relative", width: "100%" }}>
        <video style={{ width: "100%" }} loop controls>
          {sources(video)}
        </video>
      </div>
    );
  }
  return (
    <div style={{ padding: "60px 10%", background: "white", fontSize: "11pt" }}>
      {graphic ? (
        <>
          {head}
          <Row>
            <Col lg={12} style={{ paddingRight: "30px" }}>
              {graphic}
            </Col>
            <Col lg={12} style={{ paddingRight: "30px" }}>
              {children}
            </Col>
          </Row>
        </>
      ) : (
        <div style={{ width: "100%" }}>
          <div
            style={{ maxWidth: "900px", textAlign: "center", margin: "0 auto" }}
          >
            {head}
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function sources(video: string[]) {
  const v: JSX.Element[] = [];
  for (const x of video) {
    v.push(<source src={MediaURL(x)} />);
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

Info.Heading = ({ children, description }) => {
  return (
    <div
      style={{
        textAlign: "center",
        margin: "40px",
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
