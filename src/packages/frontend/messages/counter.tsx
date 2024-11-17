import { Badge } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";

export default function Counter() {
  const count = useTypedRedux("account", "unread_message_count") ?? 0;
  return <Badge count={count} />;
}
