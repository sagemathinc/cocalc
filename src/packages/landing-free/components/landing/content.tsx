import { join } from "path";
import { Button, Layout, Row, Col } from "antd";
import {
  basePath,
  siteName,
  siteDescription,
  organizationName,
  organizationURL,
  splashImage,
} from "lib/customize";
import SquareLogo from "components/landing/logo-square";
import A from "components/misc/A";

export default function Content() {
  return (
    <Layout.Content style={{ backgroundColor: "#c7d9f5" }}>
      <Row>
        <Col
          sm={12}
          xs={24}
          style={{ display: "flex", alignItems: "center", paddingTop: "15px" }}
        >
          <div style={{ textAlign: "center", margin: "auto" }}>
            <SquareLogo style={{ width: "120px" }} />
            <br />
            <h2>{siteName}</h2>
            <h3>{siteDescription}</h3>
            An instance of <A href="https://cocalc.com">CoCalc</A>, hosted by{" "}
            <A href={organizationURL}>{organizationName}</A>.
          </div>
        </Col>
        <Col sm={12} xs={24} style={{ display: "flex", alignItems: "center" }}>
          {splashImage && (
            <img src={splashImage} style={{ width: "100%", padding: "15px" }} />
          )}
        </Col>
      </Row>
      <div style={{ textAlign: "center" }}>
        <Button
          type="primary"
          href={join(basePath, "static/app.html")}
          title={`Immediately run ${siteName} without creating an account.`}
        >
          Run {siteName} Now
        </Button>
        <Button
          href={join(basePath, "static/app.html")}
          style={{ margin: "15px" }}
          title={
            "Either create a new account or sign into an existing account."
          }
        >
          Create Account or Sign In
        </Button>
      </div>
    </Layout.Content>
  );
}
