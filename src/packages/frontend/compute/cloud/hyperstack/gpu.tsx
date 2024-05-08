/*
NOT USED RIGHT NOW -- It's in compeition with machine-types.tsx
but that made more progress and is perhaps better overall, with
a filter, than this.
*/

import { Select } from "antd";
import { getModelLinks } from "./util";
import { useMemo } from "react";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { r_join } from "@cocalc/frontend/components/r_join";
import { filterOption } from "@cocalc/frontend/compute/util";
import { markup } from "@cocalc/util/compute/cloud/hyperstack/pricing";
import {
  DEFAULT_FLAVOR,
  DEFAULT_REGION,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import {
  bestCount,
  getModelOptions,
  getCountOptions,
  parseFlavor,
  encodeFlavor,
} from "./flavor";
import { capitalize, currency, plural } from "@cocalc/util/misc";
import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";
import { toGPU } from "./util";

export default function GPU({
  priceData,
  setConfig,
  configuration,
  disabled,
  state,
}) {
  const region_name = configuration.region_name ?? DEFAULT_REGION;
  const flavor_name = configuration.flavor_name ?? DEFAULT_FLAVOR;

  // Links is cosmetic to give an overview for users of what range of GPU models
  // are available.
  const links = useMemo(
    () => (priceData == null ? null : getModelLinks(priceData)),
    [priceData],
  );

  const modelOptions = useMemo(() => {
    if (priceData == null) {
      return null;
    }
    return getModelOptions(priceData).map(
      ({ region, model, available, cost_per_hour, gpu }) => {
        const disabled =
          (state != "deprovisioned" && region != region_name) || available == 0;
        const i = model.indexOf("-");
        const display = model.slice(i + 1);
        const gpuSpec = GPU_SPECS[toGPU(gpu)];
        return {
          disabled,
          label: (
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1.25 }}>NVIDIA {display}</div>
              <div style={{ flex: 1.25 }}>
                ~{currency(markup({ cost: cost_per_hour, priceData }))}/hour per
                GPU
              </div>
              <div style={{ flex: 1 }}>
                {gpuSpec != null && <>GPU RAM: {gpuSpec.memory} GB</>}
              </div>
              <div style={{ flex: 0.75 }}>
                {capitalize(region.toLowerCase().split("-")[0])} 🍃
              </div>
            </div>
          ),
          value: `${region}|${model}`,
          search: `${display} ${region.toLowerCase()} ram:${gpuSpec?.memory}`,
        };
      },
    );
  }, [priceData, configuration.region_name]);

  const countOptions = useMemo(() => {
    if (priceData == null) {
      return null;
    }
    return getCountOptions({
      flavor_name: configuration.flavor_name,
      priceData,
      region_name,
    }).map(({ count, available = 0, cost_per_hour, gpu, quantity }) => {
      const gpuSpec = GPU_SPECS[toGPU(gpu)];
      return {
        value: count,
        label: (
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1 }}>× {count} </div>
            <div style={{ flex: 1 }}>
              {currency(markup({ cost: cost_per_hour, priceData }))}/hour
            </div>
            <div style={{ flex: 1 }}>
              {gpuSpec?.memory != null && (
                <>GPU RAM: {quantity * gpuSpec.memory} GB</>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {available} {plural(available, "GPU")} available
            </div>
          </div>
        ),
        search: `${count} available:${available} ram:${
          quantity * (gpuSpec?.memory ?? 0)
        }`,
        disabled: !available,
      };
    });
  }, [priceData, configuration.region_name, configuration.flavor_name]);

  if (priceData == null || links == null || modelOptions == null) {
    return null;
  }

  const head = (
    <div style={{ color: "#666", marginBottom: "5px" }}>
      <b>
        <Icon name="cube" /> NVIDIA GPU:{" "}
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
      </b>
      <br />
      {state == "running"
        ? "You can only change the GPU model or quantity when the compute server is off or deprovisioned."
        : "Configure your server by selecting your GPU and quantity here, or select a machine type below."}
      {state == "off"
        ? " You can only change the region if your compute server is deprovisioned."
        : ""}
      <div style={{ marginTop: "10px" }}>
        <Select
          disabled={disabled}
          style={{ width: "100%" }}
          options={modelOptions as any}
          value={`${region_name}|${parseFlavor(flavor_name).model}`}
          onChange={(value) => {
            const [region, model] = value.split("|");
            setConfig({
              region_name: region,
              flavor_name: encodeFlavor({
                model,
                count: bestCount({
                  model,
                  region,
                  count: parseFlavor(flavor_name).count,
                  priceData,
                }),
              }),
            });
          }}
          showSearch
          optionFilterProp="children"
          filterOption={filterOption}
        />
        <div style={{ display: "flex", marginTop: "10px" }}>
          <div
            style={{
              marginRight: "30px",
              display: "flex",
              alignItems: "center",
              fontSize: "11pt",
            }}
          >
            Number of GPUs
          </div>
          <div style={{ flex: 1 }}>
            <Select
              disabled={disabled}
              style={{ width: "100%" }}
              options={countOptions as any}
              value={parseFlavor(flavor_name).count}
              onChange={(count) => {
                setConfig({
                  flavor_name: encodeFlavor({
                    ...parseFlavor(flavor_name),
                    count,
                  }),
                });
              }}
              showSearch
              optionFilterProp="children"
              filterOption={filterOption}
            />
          </div>
        </div>
      </div>
    </div>
  );
  return head;
}


