import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { Checkbox, Space } from "antd";
import { ReactNode } from "react";

const tourNames = {
  projects: "Projects",
  "chatgpt-title-bar-button": "ChatGPT Button",
  explorer: "File Explorer",
  "frame-terminal": "Linux Terminal",
  "flyout-fullscreen": "Fullscreen Flyout",
} as const;

export type TourName = keyof typeof tourNames;

export default function Tours() {
  const tours = useRedux("account", "tours");
  const v: ReactNode[] = [];
  for (const name in tourNames) {
    v.push(
      <Checkbox
        key={name}
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
        {tourNames[name]}
      </Checkbox>
    );
  }
  return <Space>Completed Tours: {v}</Space>;
}
