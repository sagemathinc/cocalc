import { useEffect, useState } from "react";
import type {
  ComputeServer,
  ComputeServerNetworkUsage,
} from "@cocalc/util/db-schema/purchases";
import Description from "./description";
import State, { DisplayNetworkUsage } from "./state";
import getTitle from "./get-title";
import { Spin } from "antd";
import { currency } from "@cocalc/util/misc";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

export function ComputeServerTitle({ compute_server_id }) {
  const [server, setServer] = useState<null | {
    title: string;
    color: string;
  }>(null);
  useEffect(() => {
    (async () => {
      try {
        setServer(await getTitle(compute_server_id));
      } catch (err) {
        console.warn(err);
        setServer({
          title: `Compute Server with Id=${compute_server_id}`,
          color: "#000",
        });
      }
    })();
  }, [compute_server_id]);

  if (server == null) {
    return <Spin />;
  }
  return (
    <span
      style={{
        backgroundColor: server.color,
        color: avatar_fontcolor(server.color),
        overflow: "hidden",
        padding: "0 5px",
        borderRadius: "3px",
      }}
    >
      Compute Server '{server.title}' (Id: {compute_server_id})
    </span>
  );
}

export function ComputeServerDescription({
  description,
  period_end,
}: {
  description: ComputeServer;
  period_end?: Date;
}) {
  const { state, configuration, compute_server_id: id } = description;

  return (
    <div>
      <ComputeServerTitle compute_server_id={id} /> that{" "}
      {period_end ? "was" : "is"}{" "}
      <State
        id={id}
        configuration={configuration}
        state={state}
        style={{ display: "inline-block" }}
      />
      .
      <Description configuration={configuration} state={state} short />
    </div>
  );
}

export function ComputeServerNetworkUsageDescription({
  description,
  period_end,
}: {
  description: ComputeServerNetworkUsage;
  period_end?: Date;
}) {
  const { amount, compute_server_id: id } = description;

  return (
    <div>
      <DisplayNetworkUsage
        amount={amount}
        style={{ display: "inline-block" }}
      />{" "}
      by <ComputeServerTitle compute_server_id={id} /> at a cost of{" "}
      {currency(description.cost)}
      {period_end == null ? " so far" : ""}.
      {period_end == null && (
        <div>
          NOTE: Updated hourly and not included in total until next day.
        </div>
      )}
    </div>
  );
}
