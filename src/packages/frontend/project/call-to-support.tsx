import { Alert, Typography } from "antd";
import { A } from "@cocalc/frontend/components/A";
import { SiteName } from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

const { Paragraph, Text } = Typography;
export const BUY_A_LICENSE_URL = join(appBasePath, "/store/site-license");

const VERSIONS = {
  hsy: (
    <>
      <Paragraph strong>
        This is a call to support <SiteName /> by{" "}
        <A href={BUY_A_LICENSE_URL}>purchasing a license</A>.
      </Paragraph>
      <Paragraph>
        Behind the scenes, <A href={"/about/team"}>people are working hard</A>{" "}
        to keep the service running and improve it constantly. Your files and
        computations <A href={"/info/status"}>run in our cluster</A>, which
        costs money as well.
      </Paragraph>
      <Paragraph>
        <SiteName /> receives no funding from large organizations or charitable
        foundations. The site depends entirely{" "}
        <Text strong>on your financial support</Text> to continue operating.
        Without your financial support this service will not survive long-term!
      </Paragraph>
      <Paragraph>
        <A
          href={
            "/support/new?hideExtra=true&type=purchase&subject=Support+CoCalc&title=Support+CoCalc"
          }
        >
          Contact us
        </A>{" "}
        if you can give support in other ways or have any questions or comments.
      </Paragraph>
    </>
  ),
  blaec: (
    <>
      <Paragraph strong>
        Please{" "}
        <b>
          <A href={BUY_A_LICENSE_URL}>
            purchase a <SiteName /> license
          </A>
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
        working to make Collaborative Calculation accessible for academics and
        researchers everywhere. Behind every computation is a{" "}
        <A href={"/info/status"}>cluster</A> that takes resources to maintain,
        and believe it or not, our company receives no funding from large
        organizations, charitable foundations or institutional investors.
      </Paragraph>
      <Paragraph>
        The site depends entirely <Text strong>on your financial support</Text>{" "}
        to continue operating.
      </Paragraph>
      <Paragraph>
        Unable to purchase a license?{" "}
        <A
          href={
            "/support/new?hideExtra=true&type=purchase&subject=Support+CoCalc&title=Support+CoCalc"
          }
        >
          Contact us
        </A>{" "}
        if you can give support in other ways or have any questions or comments.
      </Paragraph>
    </>
  ),
};

export function CallToSupport({ onClose }: { onClose? }) {
  return (
    <Alert
      closable={onClose != null}
      onClose={onClose}
      banner
      type="warning"
      showIcon={false}
      message={VERSIONS.blaec}
    />
  );
}
