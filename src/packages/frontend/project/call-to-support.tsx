import { Alert, Typography } from "antd";
import { join } from "path";

import { A } from "@cocalc/frontend/components/A";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

const { Paragraph, Text } = Typography;
export const BUY_A_LICENSE_URL = join(appBasePath, "/store/site-license");

export function CallToSupport({ onClose }: { onClose? }) {
  return (
    <Alert
      closable={onClose != null}
      onClose={onClose}
      banner
      type="warning"
      showIcon={false}
      message={
        <>
          <Paragraph strong>
            Please{" "}
            <b>
              <A href={BUY_A_LICENSE_URL}>purchase a CoCalc license</A>
            </b>
            !
          </Paragraph>
          <Paragraph>
            Not only will you{" "}
            <u>
              <b>have a better experience</b>
            </u>
            , but behind the scenes, a{" "}
            <A href={"/about/team"}>handful of individuals</A> are continuously
            working to make Collaborative Calculation accessible for academics
            and researchers everywhere. Behind every computation is a{" "}
            <A href={"/info/status"}>cluster</A> that takes resources to
            maintain.
          </Paragraph>
          <Paragraph>
            <A
              href={
                "/support/new?hideExtra=true&type=purchase&subject=Support+CoCalc&title=Support+CoCalc"
              }
            >
              Contact us
            </A>{" "}
            if you have any questions or comments.
          </Paragraph>
        </>
      }
    />
  );
}
