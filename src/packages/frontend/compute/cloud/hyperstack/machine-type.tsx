import { useMemo } from "react";
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
import { Select } from "antd";
import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";
import { toGPU } from "./util";
import { filterOption } from "@cocalc/frontend/compute/google-cloud-config";

export default function MachineType({
  disabled,
  setConfig,
  configuration,
  state,
  priceData,
}) {
  const value0 = `${configuration.region_name}|${configuration.flavor_name}`;
  const options = useMemo(() => {
    if (priceData == null) {
      return null;
    }
    return (
      Object.values(priceData.options)
        //.filter((x: PurchaseOption) => (x.available ?? 0) > 0)
        .sort(field_cmp("cost_per_hour"))
        .map((x: PurchaseOption) => {
          const value = `${x.region_name}|${x.flavor_name}`;
          const gpu = toGPU(x.gpu);
          const gpuSpec = GPU_SPECS[gpu];
          return {
            disabled: !x.available,
            search: `ram:${
              x.gpu_count * (gpuSpec?.memory ?? 0)
            } ${x.region_name.toLowerCase()} cpu:${x.cpu} cpus:${x.cpu} ram:${
              x.ram
            } disk:${x.ephemeral} ephemeral:${
              x.ephemeral
            } gpu:${x.gpu.toLowerCase()} ${gpu} cores:${
              x.gpu_count * (gpuSpec?.cuda_cores ?? 0)
            } available:${x.available}`,
            label: (
              <div>
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
                    {x.gpu_count} × {gpu.replace("-PCIe", "")}
                  </div>
                  <div style={{ flex: 1 }}>
                    {currency(markup({ cost: x.cost_per_hour, priceData }))}
                    /hour
                  </div>
                  <div style={{ flex: 1 }}>
                    {gpuSpec?.memory != null && (
                      <>GPU RAM: {x.gpu_count * gpuSpec.memory} GB</>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    {x.available ?? 0} {plural(x.available ?? 0, "GPU")} available in{" "}
                    {capitalize(x.region_name.toLowerCase().split("-")[0])} 🍃
                  </div>
                </div>
                {value != value0 && (
                  <div
                    style={{
                      display: "flex",
                      minWidth: "700px",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      CUDA cores:{" "}
                      {gpuSpec.cuda_cores
                        ? commas(x.gpu_count * gpuSpec.cuda_cores)
                        : "-"}
                    </div>
                    <div style={{ flex: 1 }}>vCPUs: {x.cpu}</div>
                    <div style={{ flex: 1 }}>CPU RAM: {x.ram} GB</div>
                    <div style={{ flex: 1 }}>
                      Ephemeral Disk: {commas(x.ephemeral)} GB
                    </div>
                  </div>
                )}
              </div>
            ),
            value,
            x,
          };
        })
    );
  }, [priceData, value0]);

  if (options == null) {
    return null;
  }

  return (
    <div style={{ color: "#666" }}>
      You can alternatively configure your server by machine type, which
      provides more information about total RAM and cores.
      <Select
        disabled={disabled || (state ?? "deprovisioned") != "deprovisioned"}
        style={{ width: "100%", margin: "10px 0" }}
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
    </div>
  );
}
