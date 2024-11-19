import { Badge, Tooltip } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

export default function Counter() {
  const unread_message_count =
    useTypedRedux("account", "unread_message_count") ?? 0;
  return (
    <Tooltip title={<>Unread messages in your inbox</>}>
      <Badge
        showZero
        count={unread_message_count}
        color={unread_message_count == 0 ? COLORS.GRAY : "green"}
      />
    </Tooltip>
  );
}
