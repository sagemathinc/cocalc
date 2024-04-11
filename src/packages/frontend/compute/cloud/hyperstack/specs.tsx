import NVIDIA from "@cocalc/frontend/compute/nvidia";
import { capitalize, commas, plural } from "@cocalc/util/misc";
import { toGPU } from "./util";
import { humanFlavor } from "@cocalc/util/compute/cloud/hyperstack/flavor";
import { optionKey } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import { DEFAULT_DISK } from "@cocalc/util/compute/cloud/hyperstack/api-types";

export default function Specs({
  diskSizeGb,
  flavor_name,
  region_name,
  priceData,
}) {
  const data = priceData?.options[optionKey({ flavor_name, region_name })];

  if (data == null) {
    return (
      <div>
        {flavor_name} in {region_name}
      </div>
    );
  }
  return (
    <span>
      Standard {humanFlavor(flavor_name)} with{" "}
      {data.gpu ? (
        <>
          <NVIDIA gpu={toGPU(data.gpu)} count={data.gpu_count} />,{" "}
        </>
      ) : (
        ""
      )}
      {data.cpu} {plural(data.cpu, "vCPU")}, {commas(data.ram)}GB RAM,{" "}
      {commas(diskSizeGb ?? DEFAULT_DISK)}GB persistent SSD disk
      {data.ephemeral ? (
        <> and {commas(data.ephemeral)}GB ephemeral disk </>
      ) : undefined}{" "}
      in {capitalize(region_name.toLowerCase().split("-")[0])}.
    </span>
  );
}
