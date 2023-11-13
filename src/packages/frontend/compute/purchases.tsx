import type {
  ComputeServer,
  ComputeServerNetworkUsage,
} from "@cocalc/util/db-schema/purchases";
import Description from "./description";
import State, { DisplayNetworkUsage } from "./state";
import { currency } from "@cocalc/util/misc";
import InlineComputeServer from "./inline";

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
      <InlineComputeServer id={id} /> that {period_end ? "was" : "is"}{" "}
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
      by <InlineComputeServer id={id} /> at a cost of {currency(description.cost)}
      {period_end == null ? " so far" : ""}.
      {period_end == null && (
        <div>
          NOTE: Updated hourly and not included in total until next day.
        </div>
      )}
    </div>
  );
}
