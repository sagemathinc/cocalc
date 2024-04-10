import DiskGeneric from "@cocalc/frontend/compute/cloud/common/disk";
import { getMinDiskSizeGb } from "@cocalc/util/db-schema/compute-servers";
import { commas, currency } from "@cocalc/util/misc";
import { computeVolumeCost } from "@cocalc/util/compute/cloud/hyperstack/compute-cost";
import { optionKey } from "@cocalc/util/compute/cloud/hyperstack/pricing";

export default function Disk(props) {
  if (props.priceData == null || props.IMAGES == null) {
    return null;
  }
  const cost_per_hour = computeVolumeCost(props);
  const data = props.priceData.options[optionKey(props.configuration)];
  return (
    <div>
      <DiskGeneric
        {...props}
        noType
        minSizeGb={getMinDiskSizeGb(props)}
        maxSizeGb={1048576}
        computeDiskCost={computeVolumeCost}
        extraHelp={
          <>
            <p>
              This persistent disk is used to create a ZFS pool, with lz4
              compression enabled, which stores your data and any Docker images.
              Hyperstack does not support enlarging volumes, so when you enlarge
              this disk later, we instead add a new volume to this ZFS pool (up
              to a total of 26).
            </p>
            {(data.ephemeral ?? 0) > 0 && (
              <p>
                Moreover, some of your {data.ephemeral}GB local SSD will be used
                for ZFS caching to make the persistent disk much faster. This
                massively increases iops and makes reading data repeatedly much
                more efficient.
              </p>
            )}
          </>
        }
      />
      {cost_per_hour != null && (
        <div>
          <b>Total Cost for {commas(props.configuration.diskSizeGb)}GB:</b>{" "}
          {currency(cost_per_hour)}/hour or {currency(cost_per_hour * 730)}
          /month.
        </div>
      )}
      {(data.ephemeral ?? 0) > 0 && (
        <div>
          <b>NOTE:</b> Some of your {data.ephemeral}GB local SSD is used for
          caching to make the persistent disk storage much faster.
        </div>
      )}
    </div>
  );
}
