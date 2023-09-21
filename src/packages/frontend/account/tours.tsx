import { Checkbox, Space } from "antd";
import { ReactNode } from "react";

import { redux, useRedux } from "@cocalc/frontend/app-framework";

const TOUR_NAMES = {
  projects: "Projects",
  "chatgpt-title-bar-button": "ChatGPT Button",
  explorer: "File Explorer",
  "frame-terminal": "Linux Terminal",
  "flyout-fullpage": "Fullpage Flyout",
} as const;

export type TourName = keyof typeof TOUR_NAMES;

export default function Tours() {
  const tours = useRedux("account", "tours");
  const v: ReactNode[] = [];
  for (const name in TOUR_NAMES) {
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
        {TOUR_NAMES[name]}
      </Checkbox>
    );
  }
  return <Space>Completed Tours: {v}</Space>;
}
