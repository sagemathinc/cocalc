import { Row, Col } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { ReactNode } from "react";
import { ImageURL } from "./util";

interface Props {
  anchor: string;
  icon?: IconName;
  title: string;
  image: string;
  children: ReactNode;
}

export default function InfoBlock({
  anchor,
  icon,
  title,
  image,
  children,
}: Props) {
  const head = (
    <h2>
      <a name={anchor} />
      {icon && (
        <>
          <Icon name={icon} />{" "}
        </>
      )}
      {title}
    </h2>
  );
  return (
    <div style={{ padding: "60px 10%", background: "white", fontSize: "11pt" }}>
      {image ? (
        <>
          {head}
          <Row>
            <Col lg={12} style={{ paddingRight: "30px" }}>
              <img style={{ maxWidth: "100%" }} src={ImageURL(image)} />
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
