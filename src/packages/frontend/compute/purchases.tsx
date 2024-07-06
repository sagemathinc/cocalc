import type {
  ComputeServer,
  ComputeServerNetworkUsage,
  ComputeServerStorage,
} from "@cocalc/util/db-schema/purchases";
import Description from "./description";
import State, { DisplayNetworkUsage } from "./state";
import InlineComputeServer from "./inline";
import Cost from "@cocalc/frontend/purchases/pay-as-you-go/cost";
import InlineCloudFilesystem from "./cloud-filesystem/inline";
import { WhenKnown } from "@cocalc/frontend/compute/state";

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
        period_end={period_end}
        cost={description.cost}
      />{" "}
      Network used by <InlineComputeServer id={id} />.{" "}
      {period_end == null && (
        <div>
          <Cost service="compute-server-network-usage" inline /> Usage is
          updated hourly.
        </div>
      )}
    </div>
  );
}

export function ComputeServerStorageDescription({
  description,
  period_end,
}: {
  description: ComputeServerStorage;
  period_end?: Date;
}) {
  const { cloud_filesystem_id } = description;

  return (
    <div>
      Cloud Storage used by{" "}
      <InlineCloudFilesystem
        cloud_filesystem_id={cloud_filesystem_id}
        showProject
      />
      . {period_end == null && <Cost service="compute-server-storage" inline />}{" "}
      {description.cost == null && <WhenKnown period_end={period_end} />}
    </div>
  );
}
