import { Button, Divider, Popover, Progress, Spin, Tooltip } from "antd";
import { CSSProperties, useEffect, useState } from "react";

import { A, Icon, isIconName, TimeAgo } from "@cocalc/frontend/components";
import { GoogleNetworkCost } from "@cocalc/frontend/purchases/pay-as-you-go/cost";
import { User } from "@cocalc/frontend/users";
import type {
  Configuration,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import {
  GOOGLE_COST_LAG_MS,
  STATE_INFO,
} from "@cocalc/util/db-schema/compute-servers";
import { currency, human_readable_size } from "@cocalc/util/misc";
import { useInterval } from "react-interval-hook";
import { getNetworkUsage, getServerState } from "./api";

interface Props {
  style?: CSSProperties;
  data?;
  state?: State;
  state_changed?: Date;
  id: number;
  editable?: boolean;
  account_id?: string;
  configuration: Configuration;
  cost_per_hour?: number;
  purchase_id?: number;
}

export default function State({
  id,
  data,
  style,
  state,
  state_changed,
  editable,
  account_id,
  configuration,
  purchase_id,
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

  return (
    <Popover
      mouseEnterDelay={0.5}
      title={
        <>
          {isIconName(icon) && <Icon name={icon} />} {label}
        </>
      }
      content={() => {
        return (
          <div style={{ maxWidth: "400px" }}>
            <Body
              account_id={account_id}
              editable={editable}
              controllable={configuration?.allowCollaboratorControl}
            />
            {editable && <NetworkUsage id={id} data={data} state={state} />}
            <div style={{ textAlign: "center", margin: "15px 0" }}>
              {refresh}
            </div>
            {editable && purchase_id && (
              <div>Current Purchase Id: {purchase_id} </div>
            )}
          </div>
        );
      }}
    >
      <div
        style={{ cursor: "pointer", display: "inline-block", ...style }}
        onClick={handleRefresh}
      >
        <span style={{ color }}>
          {isIconName(icon) && <Icon name={icon} />} {label}
        </span>
        {!stable && (
          <>
            <div style={{ display: "inline-block", width: "10px" }} />
            <Spin />
            {state_changed && (
              <div>
                <ProgressBarTimer
                  startTime={state_changed}
                  style={{ marginLeft: "10px" }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </Popover>
  );
}

export function WhenKnown({ period_end }) {
  let whenKnown;
  if (period_end) {
    const msAgo = Date.now() - period_end.valueOf();
    const howLong = Math.max(0, GOOGLE_COST_LAG_MS - msAgo);
    if (howLong == 0) {
      whenKnown = "soon";
    } else {
      whenKnown = (
        <>
          around <TimeAgo date={new Date(Date.now() + howLong)} />
        </>
      );
    }
  } else {
    whenKnown = "";
  }
  return (
    <span>{whenKnown ? <>The cost will be finalized {whenKnown}.</> : ""}</span>
  );
}

function NetworkUsageCostEstimate({ period_end }) {
  return (
    <>
      The{" "}
      <Tooltip title={<GoogleNetworkCost />}>
        <span>
          <A href="https://cloud.google.com/vpc/network-pricing">rate</A>
        </span>
      </Tooltip>{" "}
      depends on the destination. <WhenKnown period_end={period_end} />
    </>
  );
}

export function DisplayNetworkUsage({
  amount,
  cost,
  style,
  period_end,
}: {
  amount: number;
  cost?: number;
  style?;
  period_end?: Date;
}) {
  if (cost == null) {
  }
  return (
    <div style={style}>
      <Icon name="network-wired" /> {human_readable_size(amount * 2 ** 30)} of
      network data transfer out.{" "}
      {cost != null ? (
        <>Final Cost: {currency(cost)}</>
      ) : (
        <NetworkUsageCostEstimate period_end={period_end} />
      )}
    </div>
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
  return <DisplayNetworkUsage amount={usage.amount} cost={usage.cost} />;
}

export function ProgressBarTimer({
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

function Body({ account_id, editable, controllable }) {
  if (controllable && !editable) {
    return (
      <div>
        Workspace collaborators can change the state of this compute server.
      </div>
    );
  }
  if (!editable) {
    return (
      <div>
        Only the owner of the compute server can change its state.
        {account_id && (
          <>
            <Divider />
            <div style={{ textAlign: "center" }}>
              <User account_id={account_id} show_avatar />
            </div>
          </>
        )}
      </div>
    );
  }
  return null;
}
