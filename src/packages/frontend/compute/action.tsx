import { Popover } from "antd";
import { Icon } from "@cocalc/frontend/components";
import {
  ACTION_INFO,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";

export default function getActions({ state, editable }): JSX.Element[] {
  if (!editable) {
    return [];
  }
  const s = STATE_INFO[state ?? "off"];
  if (s == null) {
    return [];
  }
  if ((s.actions ?? []).length == 0) {
    return [];
  }
  const v: JSX.Element[] = [];
  for (const action of s.actions) {
    const a = ACTION_INFO[action];
    if (!a) continue;
    const { label, icon, tip, description } = a;
    v.push(
      <Popover
        key={action}
        mouseEnterDelay={0.5}
        title={
          <div>
            <Icon name={icon} /> {tip}
          </div>
        }
        content={<div style={{ width: "400px" }}>{description}</div>}
      >
        <span>
          <Icon name={icon} /> {label} VM
        </span>
      </Popover>,
    );
  }
  return v;
}
