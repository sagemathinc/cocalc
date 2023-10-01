import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import type {
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Button, Divider, Popover, Progress, Spin, Tooltip } from "antd";
import { User } from "@cocalc/frontend/users";
import { CSSProperties, useEffect, useState } from "react";
import { getNetworkUsage, getServerState } from "./api";
import { useInterval } from "react-interval-hook";
import { currency, human_readable_size } from "@cocalc/util/misc";

interface Props {
  style?: CSSProperties;
  data?;
  state?: State;
  state_changed?: Date;
  id: number;
  editable: boolean;
  account_id: string;
  configuration: Configuration;
  setError: (string) => void;
  cost_per_hour?: number;
}

export default function State({
  id,
  data,
  style,
  state,
  state_changed,
  editable,
  account_id,
  cost_per_hour,
}: Props) {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const { label, icon, color, stable } = STATE_INFO[state ?? "off"] ?? {};
  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await getServerState(id);
    } catch (_) {
    } finally {
      setRefreshing(false);
    }
  };

  const refresh = (
    <Button disabled={refreshing} onClick={handleRefresh}>
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

  let cost;
  if (cost_per_hour == null) {
    cost = ""; // no info
  } else if (stable) {
    if (state == "deprovisioned") {
      cost = " - $0/month";
    } else {
      const cost_per_month = `${currency(cost_per_hour * 730)}/month`;
      if (state == "running") {
        cost = (
          <Tooltip title={cost_per_month} placement="right">
            {" "}
            - {currency(cost_per_hour)}/hour
          </Tooltip>
        );
      } else {
        cost = ` - ${cost_per_month}`;
      }
    }
  }

  return (
    <Popover
      mouseEnterDelay={0.5}
      title={
        <>
          <Icon name={icon} /> {label} {cost}
        </>
      }
      content={() => {
        return (
          <div style={{ maxWidth: "400px" }}>
            <Body account_id={account_id} editable={editable} />
            <NetworkUsage id={id} data={data} state={state} />
            <div style={{ textAlign: "center", margin: "15px 0" }}>
              {refresh}
            </div>
          </div>
        );
      }}
    >
      <span style={{ cursor: "pointer", ...style }} onClick={handleRefresh}>
        <span style={{ color }}>
          <Icon name={icon} /> {label} {cost}
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

function NetworkUsage({ id, state, data }) {
  const [usage, setUsage] = useState<{ amount: number; cost: number } | null>(
    null,
  );
  useEffect(() => {
    if (data == null || state != "running" || data.lastStartTimestamp == null) {
      return;
    }
    (async () => {
      try {
        const opts = {
          id,
          start: data.lastStartTimestamp,
          end: new Date(),
        };
        setUsage(await getNetworkUsage(opts));
      } catch (err) {
        console.log("error getting network usage -- ", err);
      }
    })();
  }, []);
  if (usage == null) {
    return null;
  }
  return (
    <div>
      <Icon name="network-wired" /> Network egress since start:{" "}
      {human_readable_size(usage.amount * 2 ** 30)}, Cost:{" "}
      {currency(usage.cost)}
    </div>
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

function Body({ account_id, editable }) {
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
  } else {
    return null;
  }
}
