import { Popover } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Information() {
  return (
    <Popover
      content={
        <div style={{ width: "550px", maxWidth: "90vw" }}>
          <p>
            Set quotas here. IMPORTANT: When this project starts, any other
            licenses and upgrades are NOT applied, and instead{" "}
            <b>only the upgrades listed here are used</b>.
          </p>
          <p>
            There is a monthly spending limit on project upgrades, and if you
            hit this limit, then the project stops running so you don't get
            charged beyond that amount. You can add credit to your account at
            any time to avoid hitting this limit.
          </p>
        </div>
      }
      trigger={["click"]}
      placement="rightTop"
      title={"Pay As You Go Quotas"}
    >
      <Icon name="question-circle" />
    </Popover>
  );
}
