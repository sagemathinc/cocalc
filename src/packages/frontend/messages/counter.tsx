import { Badge, Tooltip } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

export default function Counter() {
  const count = useTypedRedux("account", "unread_message_count") ?? 0;
  return (
    <Tooltip title={<>Unread messages in your inbox</>}>
      <Badge count={count} />
    </Tooltip>
  );
}
