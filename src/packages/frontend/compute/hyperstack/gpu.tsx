import { Select } from "antd";
import { getModelLinks } from "./util";
import { useMemo } from "react";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { r_join } from "@cocalc/frontend/components/r_join";
import { filterOption } from "@cocalc/frontend/compute/google-cloud-config";
import {
  DEFAULT_FLAVOR,
  DEFAULT_REGION,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import {
  getModelOptions,
  getCountOptions,
  parseFlavor,
  encodeFlavor,
} from "./flavor";
import { currency } from "@cocalc/util/misc";

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
    return getModelOptions(priceData)
      .filter((x) => x.available > 0 || state != "deprovisioned")
      .map(({ region, model, available, cost_per_hour }) => {
        const disabled =
          (state != "deprovisioned" && region != region_name) || available == 0;
        const i = model.indexOf("-");
        const display = model.slice(i + 1);
        return {
          disabled,
          label: (
            <div style={{ display: "flex" }}>
              <div style={{ flex: 1 }}>NVIDIA {display}</div>
              <div style={{ flex: 1 }}>
                {currency(cost_per_hour)}/hour per GPU
              </div>
              <div style={{ flex: 1 }}>{available} GPUs available</div>
              <div style={{ flex: 1 }}>{region.toLowerCase()} 🍃</div>
            </div>
          ),
          value: `${region}|${model}`,
          search: display,
        };
      });
  }, [priceData, configuration.region_name]);

  const countOptions = useMemo(() => {
    if (priceData == null) {
      return null;
    }
    return getCountOptions({
      flavor_name: configuration.flavor_name,
      priceData,
      region_name,
    }).map(({ count }) => {
      return { value: count, label: count, search: count };
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
            return url ? <A href={url}>{name}</A> : name;
          }),
        )}
      </b>
      <br />
      Servers are equipped with at least one NVIDIA GPU:
      <Select
        disabled={disabled}
        style={{ width: "100%", marginTop: "5px" }}
        options={modelOptions as any}
        value={`${region_name}|${parseFlavor(flavor_name).model}`}
        onChange={(value) => {
          const [region, model] = value.split("|");
          setConfig({
            region_name: region,
            flavor_name: encodeFlavor({
              model,
              count: parseFlavor(flavor_name).count,
            }),
          });
        }}
        showSearch
        optionFilterProp="children"
        filterOption={filterOption}
      />
      <Select
        disabled={disabled}
        style={{ width: "100%", marginTop: "5px" }}
        options={countOptions as any}
        value={parseFlavor(flavor_name).count}
        onChange={(count) => {
          setConfig({
            flavor_name: encodeFlavor({ ...parseFlavor(flavor_name), count }),
          });
        }}
        showSearch
        optionFilterProp="children"
        filterOption={filterOption}
      />
    </div>
  );
  return head;
}

/*
      <Select
        style={{ marginLeft: "15px", width: "75px" }}
        disabled={disabled || (state ?? "deprovisioned") != "deprovisioned"}
        options={[]}
        value={flavorToCount(configuration.flavor_name)}
        onChange={(count) => {
          setConfig({
            flavor_name: changeFlavorCount(configuration.flavor_name, count),
          });
        }}
      />*/
