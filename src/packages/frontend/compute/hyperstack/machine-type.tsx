import { useMemo } from "react";
import { capitalize, commas, currency, field_cmp } from "@cocalc/util/misc";
import {
  markup,
  PurchaseOption,
} from "@cocalc/util/compute/cloud/hyperstack/pricing";
import { Select } from "antd";
import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";
import { toGPU } from "./util";

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
    return Object.values(priceData.options)
      .filter((x: PurchaseOption) => (x.available ?? 0) > 0)
      .sort(field_cmp("cost_per_hour"))
      .map((x: PurchaseOption) => {
        const value = `${x.region_name}|${x.flavor_name}`;
        const gpu = toGPU(x.gpu);
        const gpuSpec = GPU_SPECS[gpu];
        return {
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
                  {currency(markup({ cost: x.cost_per_hour, priceData }))}/hour
                </div>
                <div style={{ flex: 1 }}>
                  {gpuSpec?.memory != null && (
                    <>
                      <b style={{ color: "#666" }}>GPU RAM:</b>{" "}
                      {x.gpu_count * gpuSpec.memory} GB
                    </>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  {capitalize(x.region_name.toLowerCase().split("-")[0])} 🍃 (
                  {x.available} available)
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
                    <b style={{ color: "#666" }}>CUDA cores:</b>{" "}
                    {gpuSpec.cuda_cores
                      ? commas(x.gpu_count * gpuSpec.cuda_cores)
                      : "-"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: "#666" }}>vCPUs:</b> {x.cpu}
                  </div>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: "#666" }}>CPU RAM:</b> {x.ram} GB
                  </div>
                  <div style={{ flex: 1 }}>
                    <b style={{ color: "#666" }}> Ephemeral SSD:</b>{" "}
                    {commas(x.ephemeral)} GB
                  </div>
                </div>
              )}
            </div>
          ),
          value,
          x,
        };
      });
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
        options={options}
        onChange={(value) => {
          const [region_name, flavor_name] = value.split("|");
          setConfig({ region_name, flavor_name });
        }}
      />
    </div>
  );
}
