import { Icon } from "@cocalc/frontend/components";
import { Button } from "antd";
import { COLORS } from "@cocalc/util/theme";
import { useActions } from "@cocalc/frontend/app-framework";

export default function HomePageButton({ project_id, active }) {
  const actions = useActions({ project_id });
  return (
    <Button
      size="large"
      type="text"
      style={{
        width: "57px",
        fontSize: "24px",
        color: active ? "#1677ff" : COLORS.FILE_ICON,
      }}
      onClick={() => {
        actions?.set_active_tab("home");
      }}
    >
      <Icon name="home" style={{ verticalAlign: "5px" }} />
    </Button>
  );
}
