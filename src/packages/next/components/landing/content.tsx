import { Row, Col } from "antd";
import { ReactNode } from "react";
import SignIn from "components/landing/sign-in";
import { ImageURL } from "./util";

interface Props {
  title: ReactNode;
  subtitle: ReactNode;
  description?: ReactNode;
  logo?: ReactNode;
  image?: string;
  startup?: ReactNode;
}

function Logo({ logo, title }) {
  if (!logo) return null;
  if (typeof logo == "string") {
    return <img src={ImageURL(logo)} width="200px" alt={`${title} logo`} />;
  }
  return logo;
}

export default function Content({
  title,
  subtitle,
  description,
  logo,
  image,
  startup,
}: Props) {
  return (
    <div style={{ padding: "30px 0" }}>
      <Row>
        <Col
          sm={12}
          xs={24}
          style={{
            display: "flex",
            alignItems: "center",
            paddingTop: "15px",
          }}
        >
          <div
            style={{ textAlign: "center", margin: "auto", padding: "0 10%" }}
          >
            <Logo logo={logo} title={title} />
            <h2 style={{ color: "#333" }}>{title}</h2>
            <h3 style={{ color: "#333" }}>{subtitle}</h3>
            <div style={{ color: "#666" }}>{description}</div>
          </div>
        </Col>
        <Col sm={12} xs={24} style={{ display: "flex", alignItems: "center" }}>
          {image && (
            <img
              src={ImageURL(image)}
              style={{ width: "100%", padding: "15px" }}
            />
          )}
        </Col>
      </Row>
      <SignIn startup={startup ?? title} hideFree={true} />
    </div>
  );
}
