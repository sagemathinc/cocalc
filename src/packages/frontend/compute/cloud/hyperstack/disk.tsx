import DiskGeneric from "@cocalc/frontend/compute/cloud/common/disk";
import { getMinDiskSizeGb } from "@cocalc/util/db-schema/compute-servers";
import { commas, currency, plural } from "@cocalc/util/misc";
import { computeDiskCost } from "@cocalc/util/compute/cloud/hyperstack/compute-cost";
import {
  markup,
  optionKey,
} from "@cocalc/util/compute/cloud/hyperstack/pricing";
import { Alert } from "antd";

export default function Disk(props) {
  if (props.priceData == null || props.IMAGES == null) {
    return null;
  }
  const cost_per_hour_data = markup({
    cost: computeDiskCost(props),
    priceData: props.priceData,
  });
  // this data can be null -- I saw this when a bunch of machine types ("flavors") disappeared...
  const data = props.priceData.options[optionKey(props.configuration)];
  const numTimes =
    props.data?.disks == null ? 0 : Math.max(props.data?.disks.length, 1) - 1;
  return (
    <div>
      <DiskGeneric
        {...props}
        disabled={numTimes >= 25}
        noType
        minSizeGb={getMinDiskSizeGb(props)}
        maxSizeGb={1048576}
        computeDiskCost={computeDiskCost}
        extraHelp={
          <>
            <p>
              This persistent disk is used to create a ZFS pool, with lz4
              compression enabled, which stores your data and any Docker images.
              Hyperstack does not support enlarging volumes, so when you enlarge
              this disk later, we instead add a new volume to this ZFS pool (up
              to a total of 26).
            </p>
            {(data?.ephemeral ?? 0) > 0 && (
              <p>
                Moreover, some of your{" "}
                {data.ephemeral ? `${data.ephemeral} GB` : ""} local SSD will be
                used for ZFS caching to make the persistent disk much faster.
                This dramatically increases iops and makes reading data
                repeatedly much more efficient.
              </p>
            )}
          </>
        }
        rate={
          <>{currency(props.priceData.ssd_cost_per_hour * 730)}/GB per month</>
        }
        beforeBody={
          numTimes >= 1 && props.state != "deprovisioned" ? (
            <Alert
              showIcon
              type="warning"
              style={{ float: "right", width: "400px" }}
              description={
                <>
                  You can enlarge your disk <b>at most 25 times</b>. You have
                  enlarged this disk {numTimes} {plural(numTimes, "time")}.
                </>
              }
            />
          ) : undefined
        }
      />
      {cost_per_hour_data != null && (
        <div>
          <b>
            Cost for{" "}
            {commas(props.configuration.diskSizeGb ?? getMinDiskSizeGb(props))}
            GB:
          </b>{" "}
          {currency(cost_per_hour_data)}/hour or{" "}
          {currency(cost_per_hour_data * 730)}
          /month when the server is provisioned.
        </div>
      )}
      {(data?.ephemeral ?? 0) > 0 && (
        <div>
          <b>Caching:</b> Some of your {data?.ephemeral} GB local SSD is used for
          caching to make the data disk much faster.
        </div>
      )}
    </div>
  );
}
