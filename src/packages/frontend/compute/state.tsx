import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Button, Divider, Popover } from "antd";
import getActions from "./action";
import { User } from "@cocalc/frontend/users";
import { CSSProperties } from "react";

interface Props {
  style?: CSSProperties;
  state;
  id;
  editable;
  account_id;
}

export default function State({
  style,
  state,
  id,
  editable,
  account_id,
}: Props) {
  const { label, actions, icon, color } = STATE_INFO[state ?? "off"] ?? {};
  if (!label) {
    return <span>Invalid State: {state}</span>;
  }
  console.log({ id, editable, state, color });

  return (
    <Popover
      title={<>Compute Server is {label}</>}
      content={() => {
        if (actions.length == 0) {
          return <div>Please wait for this to finish.</div>;
        } else {
          if (!editable) {
            return (
              <div>
                Only the owner of the compute server can change its state.
                <Divider />
                <div style={{ textAlign: "center" }}>
                  <User account_id={account_id} show_avatar />
                </div>
                <Divider />
                Instead, create your own clone of this compute server.
              </div>
            );
          }
          return (
            <div>
              {getActions({ state, editable }).map((x) => (
                <Button style={{ marginRight: "5px" }}>{x}</Button>
              ))}
            </div>
          );
        }
        <div>You can {actions.join(", ")}</div>;
      }}
    >
      <span style={{ color, ...style }}>
        <Icon name={icon} /> {label}
      </span>
    </Popover>
  );
}
