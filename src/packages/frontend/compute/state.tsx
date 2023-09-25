import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { Button, Divider, Popover, Spin } from "antd";
import getActions from "./action";
import { User } from "@cocalc/frontend/users";
import { CSSProperties, useState } from "react";
import { getServerState } from "./api";

interface Props {
  style?: CSSProperties;
  state;
  id;
  editable;
  account_id;
  setError;
}

export default function State({
  id,
  style,
  state,
  editable,
  account_id,
  setError,
}: Props) {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const { label, actions, icon, color, stable } =
    STATE_INFO[state ?? "off"] ?? {};
  if (!label) {
    return <span>Invalid State: {state}</span>;
  }

  return (
    <Popover
      title={<>State: {label}</>}
      content={() => {
        if (state == "unknown") {
          return <div>Click the "Refresh" button to update the state.</div>;
        }
        if (actions.length) {
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
          return <div>{getActions({ state, editable, id, setError })}</div>;
        }
        <div>You can {actions.join(", ")}</div>;
      }}
    >
      <span style={{ color, ...style }}>
        <Icon name={icon} /> {label}
        {!stable && (
          <>
            <div style={{ display: "inline-block", width: "10px" }} />
            <Spin />
          </>
        )}
        {state == "unknown" && (
          <Button
            disabled={refreshing}
            type="text"
            onClick={async () => {
              try {
                setRefreshing(true);
                await getServerState(id);
              } catch (_) {
              } finally {
                setRefreshing(false);
              }
            }}
          >
            <Icon name="refresh" /> Refresh
          </Button>
        )}
      </span>
    </Popover>
  );
}
