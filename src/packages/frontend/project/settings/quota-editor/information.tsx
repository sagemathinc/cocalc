import { Popover } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Information() {
  return (
    <Popover
      content={<>Explain the Stuff</>}
      trigger={["click"]}
      placement="rightTop"
      title="Quota editor information"
    >
      <Icon name="question-circle" />
    </Popover>
  );
}
