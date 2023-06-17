import { Popover } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Information() {
  return (
    <Popover
      content={
        <div style={{ width: "550px", maxWidth: "90vw" }}>
          <p>
            Set quotas here. When this project starts, any licenses and upgrades
            are applied, then the quotas of the project are increased to at
            least the values listed here, as long as you haven't exceeded your
            monthly spending limit. You will be charged for usage that isn't
            covered by any licenses and upgrades, and which you can monitor via
            an indicator when the project is running.
          </p>
          <p>
            You can configure your project so these minimal upgrades are
            available only when <b>you</b> start the project, or when{" "}
            <b>any collaborator</b> starts the project.
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
