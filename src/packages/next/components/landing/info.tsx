import { Row, Col } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { ReactNode } from "react";
import { ImageURL } from "./util";

interface Props {
  anchor: string;
  icon?: IconName;
  title: ReactNode;
  image?: string;
  video?: string;
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
    graphic = <img style={{ maxWidth: "100%" }} src={ImageURL(image)} />;
  } else if (video != null) {
    graphic = (
      <div style={{ position: "relative", width: "100%" }}>
        <video style={{ width: "100%" }} loop controls>
          <source src={ImageURL(video)} type="video/webm; codecs=vp9" />
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

Info.Heading = ({ children }) => {
  return (
    <h1
      style={{
        textAlign: "center",
        fontSize: "400%",
        margin: "40px",
        color: "#666",
      }}
    >
      {children}
    </h1>
  );
};
