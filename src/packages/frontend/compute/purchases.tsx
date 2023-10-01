import type {
  ComputeServer,
  ComputeServerNetworkUsage,
} from "@cocalc/util/db-schema/purchases";
import Description from "./description";
import State, { DisplayNetworkUsage } from "./state";

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
      Compute Server with Id={id} that {period_end ? "was" : "is"}{" "}
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
}: {
  description: ComputeServerNetworkUsage;
}) {
  const { amount, compute_server_id: id } = description;

  return (
    <div>
      <DisplayNetworkUsage
        amount={amount}
        style={{ display: "inline-block" }}
      />{" "}
      by compute server with Id={id}
    </div>
  );
}
