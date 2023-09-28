import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import type {
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Button, Divider, Popover, Progress, Spin } from "antd";
import getActions from "./action";
import { User } from "@cocalc/frontend/users";
import { CSSProperties, useState } from "react";
import { getServerState } from "./api";
import { useInterval } from "react-interval-hook";

interface Props {
  style?: CSSProperties;
  state?: State;
  state_changed?: Date;
  id: number;
  editable: boolean;
  account_id: string;
  configuration: Configuration;
  setError: (string) => void;
}

export default function State({
  id,
  style,
  state,
  state_changed,
  editable,
  account_id,
  configuration,
  setError,
}: Props) {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const { label, actions, icon, color, stable } =
    STATE_INFO[state ?? "off"] ?? {};
  const refresh = (
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
      <Icon name="refresh" spin={refreshing} /> Refresh State
    </Button>
  );

  if (!label) {
    return (
      <span>
        Invalid State: {state} {refresh}
      </span>
    );
  }

  return (
    <Popover
      mouseEnterDelay={0.5}
      title={<>State: {label}</>}
      content={() => {
        return (
          <div style={{ maxWidth: "400px" }}>
            <Body
              id={id}
              account_id={account_id}
              state={state}
              actions={actions}
              editable={editable}
              setError={setError}
              configuration={configuration}
            />
            <div style={{ textAlign: "center" }}>{refresh}</div>
          </div>
        );
      }}
    >
      <span style={style}>
        <span style={{ color }}>
          <Icon name={icon} /> {label}
        </span>
        {!stable && (
          <>
            <div style={{ display: "inline-block", width: "10px" }} />
            <Spin />
            {state_changed && (
              <ProgressBarTimer
                startTime={state_changed}
                style={{ marginLeft: "10px" }}
              />
            )}
          </>
        )}
      </span>
    </Popover>
  );
}

function ProgressBarTimer({
  startTime,
  style,
  width = "150px",
  interval = 1000,
}: {
  startTime: Date;
  style?;
  width?;
  interval?;
}) {
  const [elapsed, setElapsed] = useState<number>(
    Math.round((Date.now() - startTime.valueOf()) / 1000),
  );

  useInterval(() => {
    setElapsed(Math.round((Date.now() - startTime.valueOf()) / 1000));
  }, interval);

  if (!startTime) {
    return null;
  }

  return (
    <div style={{ display: "inline-block", ...style }}>
      <div style={{ display: "flex", width: "100%" }}>
        <Progress
          style={{ width, marginRight: "-30px" }}
          status="active"
          format={() => ""}
          percent={elapsed}
        />
        {elapsed}s
      </div>
    </div>
  );
}

function Body({ state, actions, id, account_id, editable, setError, configuration }) {
  if (state == "unknown") {
    return <div>Click the "Refresh" button to update the state.</div>;
  }
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
    return <div>{getActions({ state, editable, id, setError, configuration })}</div>;
  }
  return <div>You can {actions.join(", ")}</div>;
}
