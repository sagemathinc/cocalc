import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { Checkbox, Space } from "antd";
import { ReactNode } from "react";

const names = {
  projects: "Projects",
  "chatgpt-title-bar-button": "ChatGPT Button",
  explorer: "File Explorer",
  "frame-terminal": "Linux Terminal",
};

export default function Tours() {
  const tours = useRedux("account", "tours");
  const v: ReactNode[] = [];
  for (const name in names) {
    v.push(
      <Checkbox
        checked={tours?.includes(name) || tours?.includes("all")}
        onChange={(e) => {
          const actions = redux.getActions("account");
          if (e.target.checked) {
            actions.setTourDone(name);
          } else {
            actions.setTourNotDone(name);
          }
        }}
      >
        {names[name]}
      </Checkbox>
    );
  }
  return <Space>Completed Tours: {v}</Space>;
}
