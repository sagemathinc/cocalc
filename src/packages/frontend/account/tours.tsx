// cSpell:ignore fullpage

import { Space } from "antd";
import { ReactNode } from "react";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";

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
      <Switch
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
      </Switch>,
    );
  }
  return (
    <Panel
      size={"small"}
      role="region"
      aria-label="Completed tours"
      header={
        <span>
          <Icon name="map" /> Completed Tours
        </span>
      }
    >
      <Space wrap>{v}</Space>
    </Panel>
  );
}
