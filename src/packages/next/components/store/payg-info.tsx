import { Alert, Tag } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { WORKSPACE_LABEL } from "@cocalc/util/i18n/terminology";
import A from "components/misc/A";

export default function PaygInfo({ what }) {
  return (
    <Alert
      showIcon
      icon={<Icon name="servers" />}
      type="info"
      message={
        <div>
          <Tag style={{ float: "right" }} color={COLORS.ANTD_GREEN}>
            new
          </Tag>
          Compute Servers and Pay As You Go Upgrades -- alternative to {what}
        </div>
      }
      description={
        <div>
          <ul>
            <li>
              If you need a large amount of compute power, disk space, GPUs,
              root privileges, or to run commercial software, add a{" "}
              <A href="https://doc.cocalc.com/compute_server.html">
                pay as you go compute server to your{" "}
                {WORKSPACE_LABEL.toLowerCase()}
              </A>
              .
            </li>
            <li>
              If you need to upgrade your {WORKSPACE_LABEL.toLowerCase()} for a
              few minutes or a few hours, you can use{" "}
              <A href="https://doc.cocalc.com/paygo.html" external>
                pay as you go {WORKSPACE_LABEL.toLowerCase()} upgrades
              </A>
              .
            </li>
          </ul>
        </div>
      }
    />
  );
}
