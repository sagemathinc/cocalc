import { Layout } from "antd";
import {
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
    <Layout.Content>
      <div style={{ width: "100%", display: "flex" }}>
        <div style={{ width: "50%", textAlign: "center" }}>
          <SquareLogo style={{ width: "200px" }} />
          <br />
          <h2>{siteName}</h2>
          <h3>{siteDescription}</h3>
          An instance of <A href="https://cocalc.com">CoCalc</A>, hosted by{" "}
          <A href={organizationURL}>{organizationName}</A>.
        </div>
        {splashImage && <img src={splashImage} style={{ width: "50%" }} />}
      </div>
    </Layout.Content>
  );
}
