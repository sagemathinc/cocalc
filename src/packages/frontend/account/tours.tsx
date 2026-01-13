// cSpell:ignore fullpage

import { Space } from "antd";
import { ReactNode } from "react";
import { useIntl } from "react-intl";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { redux, useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { labels } from "@cocalc/frontend/i18n";

const TOUR_KEYS = [
  "projects",
  "chatgpt-title-bar-button",
  "explorer",
  "frame-terminal",
  "flyout-fullpage",
] as const;

export type TourName = (typeof TOUR_KEYS)[number];

export default function Tours() {
  const intl = useIntl();
  const tours = useRedux("account", "tours");
  const tourNames: Record<TourName, string> = {
    projects: intl.formatMessage(labels.projects),
    "chatgpt-title-bar-button": "ChatGPT Button",
    explorer: "File Explorer",
    "frame-terminal": "Linux Terminal",
    "flyout-fullpage": "Fullpage Flyout",
  };
  const v: ReactNode[] = [];
  for (const name of TOUR_KEYS) {
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
        {tourNames[name]}
      </Switch>,
    );
  }
  return (
    <Panel
      size={"small"}
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
