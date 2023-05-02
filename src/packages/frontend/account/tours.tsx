import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { Checkbox, Space } from "antd";

export default function Tours() {
  const tours = useRedux("account", "tours");
  return (
    <Space>
      Completed Tours:
      <Checkbox
        checked={tours?.includes("projects") || tours?.includes("all")}
        onChange={(e) => {
          const actions = redux.getActions("account");
          if (e.target.checked) {
            actions.setTourDone("projects");
          } else {
            actions.setTourNotDone("projects");
          }
        }}
      >
        Projects
      </Checkbox>
    </Space>
  );
}
