import DiskGeneric from "@cocalc/frontend/compute/cloud/common/disk";
import { getMinDiskSizeGb } from "@cocalc/util/db-schema/compute-servers";
import { commas, currency } from "@cocalc/util/misc";
import { computeVolumeCost } from "@cocalc/util/compute/cloud/hyperstack/compute-cost";

export default function Disk(props) {
  const cost_per_hour =
    props.priceData != null ? computeVolumeCost(props) : null;
  return (
    <div>
      <DiskGeneric
        {...props}
        noType
        minSizeGb={getMinDiskSizeGb(props)}
        maxSizeGb={1048576}
      />
      {cost_per_hour != null && (
        <div>
          <b>Total Cost for {commas(props.configuration.diskSizeGb)}GB:</b>{" "}
          {currency(cost_per_hour)}/hour or {currency(cost_per_hour * 730)}/month.
        </div>
      )}
    </div>
  );
}
