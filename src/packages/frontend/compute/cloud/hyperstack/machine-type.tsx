import { useMemo, useState } from "react";
import {
  capitalize,
  commas,
  currency,
  field_cmp,
  plural,
} from "@cocalc/util/misc";
import {
  markup,
  PurchaseOption,
} from "@cocalc/util/compute/cloud/hyperstack/pricing";
import { Checkbox, Select, Tooltip } from "antd";
import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";
import { getModelLinks, humanFlavor, toGPU } from "./util";
import { filterOption } from "@cocalc/frontend/compute/google-cloud-config";
import { DEFAULT_REGION } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { r_join } from "@cocalc/frontend/components/r_join";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";

function getLabel(x: PurchaseOption, priceData) {
  const cpuOnly = !x.gpu_count;
  const gpu = toGPU(x.gpu);
  const gpuSpec = GPU_SPECS[gpu];
  return (
    <div style={{ lineHeight: "20px" }}>
      <div
        style={{
          display: "flex",
          minWidth: "700px",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1 }}> {humanFlavor(x.flavor_name)}</div>
        <div style={{ flex: 1 }}>
          {currency(markup({ cost: x.cost_per_hour, priceData }))}
          /hour
        </div>
        <div style={{ flex: 1 }}>
          {x.cpu} {plural(x.cpu, "vCPU")}, {commas(x.ram)}GB RAM
        </div>
        <div style={{ flex: 1 }}>
          {!cpuOnly && (
            <>
              {x.available ?? 0} {plural(x.available ?? 0, "GPU")} in
            </>
          )}{" "}
          {capitalize(x.region_name.toLowerCase().split("-")[0])} 🍃
        </div>
      </div>
      <div
        style={{
          display: "flex",
          minWidth: "700px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
          }}
        >
          {cpuOnly ? (
            `CPU Only`
          ) : (
            <>
              {x.gpu_count} × {gpu.replace("-PCIe", "")}
            </>
          )}
        </div>{" "}
        <div style={{ flex: 1 }}>
          {gpuSpec != null && (
            <>
              CUDA cores:{" "}
              {gpuSpec.cuda_cores
                ? commas(x.gpu_count * gpuSpec.cuda_cores)
                : "-"}
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {gpuSpec != null && (
            <>
              {gpuSpec?.memory != null && (
                <>{x.gpu_count * gpuSpec.memory}GB GPU RAM</>
              )}
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {(x.ephemeral ?? 0) > 0 && (
            <>{commas(x.ephemeral)} GB Ephemeral Disk</>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MachineType({
  disabled,
  setConfig,
  configuration,
  priceData,
  state,
}) {
  const [showUnavailable, setShowUnavailable] = useState<boolean>(false);

  // Links is cosmetic to give an overview for users of what range of GPU models
  // are available.
  const links = useMemo(
    () => (priceData == null ? null : getModelLinks(priceData)),
    [priceData],
  );

  const region_name = configuration.region_name ?? DEFAULT_REGION;
  const value0 = `${configuration.region_name}|${configuration.flavor_name}`;
  const options = useMemo(() => {
    if (priceData == null) {
      return null;
    }
    console.log("updating options with ", { showUnavailable });
    return (
      Object.values(priceData.options)
        //.filter((x: PurchaseOption) => (x.available ?? 0) > 0)
        .sort(field_cmp("cost_per_hour"))
        .filter((x: PurchaseOption) => {
          if (x.flavor_name == "s") {
            // the "s" flavor is totally broken, so filter it out.
            return false;
          }
          if (
            !showUnavailable &&
            state != "deprovisioned" &&
            region_name != x.region_name
          ) {
            return false;
          }
          if (showUnavailable) {
            return true;
          } else {
            return !x.gpu_count || x.available;
          }
        })
        .map((x: PurchaseOption) => {
          const value = `${x.region_name}|${x.flavor_name}`;
          const cpuOnly = !x.gpu_count;
          const gpu = toGPU(x.gpu);
          const gpuSpec = GPU_SPECS[gpu];
          const disabled =
            !cpuOnly &&
            ((state != "deprovisioned" && region_name != x.region_name) ||
              !x.available);
          return {
            disabled,
            search: `ram:${
              x.gpu_count * (gpuSpec?.memory ?? 0)
            } ${x.region_name.toLowerCase()} cpu:${x.cpu} cpus:${x.cpu} ram:${
              x.ram
            } disk:${x.ephemeral} ephemeral:${
              x.ephemeral
            } gpu:${x.gpu.toLowerCase()} ${gpu} cores:${
              x.gpu_count * (gpuSpec?.cuda_cores ?? 0)
            } available:${x.available} ${humanFlavor(x.flavor_name)}`,
            label: getLabel(x, priceData),
            value,
            x,
          };
        })
    );
  }, [priceData, value0, showUnavailable]);

  if (options == null) {
    return null;
  }

  return (
    <div style={{ color: "#666" }}>
      <div>
        <Tooltip
          title={
            <>
              Show servers that are not available
              {state != "deprovisioned" ? " or in a different region" : ""}.
            </>
          }
        >
          <Checkbox
            style={{ float: "right" }}
            checked={showUnavailable}
            onChange={() => setShowUnavailable(!showUnavailable)}
          >
            Show All
          </Checkbox>
        </Tooltip>
        {state == "running"
          ? "You can change the type when the compute server is off or deprovisioned."
          : "Select the type of compute server, which determines the GPU, RAM, and fast ephemeral disk."}
        <Select
          disabled={disabled}
          style={{ width: "100%", height: "55px", margin: "10px 0" }}
          value={value0}
          options={options as any}
          onChange={(value) => {
            const [region_name, flavor_name] = value.split("|");
            setConfig({ region_name, flavor_name });
          }}
          showSearch
          optionFilterProp="children"
          filterOption={filterOption}
        />

        {links != null && (
          <div>
            <Icon name="external-link" /> Hyperstack NVIDIA GPUs:{" "}
            {r_join(
              links.map(({ name, url }) => {
                return url ? (
                  <A key={name} href={url}>
                    {name}
                  </A>
                ) : (
                  <span key={name}>{name}</span>
                );
              }),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
