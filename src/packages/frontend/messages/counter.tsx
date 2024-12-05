import { Badge, Tooltip } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

export default function Counter({
  minimal,
  style,
}: {
  minimal?: boolean;
  style?;
}) {
  const unread_message_count =
    useTypedRedux("account", "unread_message_count") ?? 0;
  if (minimal) {
    return <span style={style}>{unread_message_count}</span>;
  }
  return (
    <Tooltip title={<>Unread messages in your inbox</>}>
      <Badge
        style={style}
        showZero
        count={unread_message_count}
        color={unread_message_count == 0 ? COLORS.GRAY : "green"}
      />
    </Tooltip>
  );
}
