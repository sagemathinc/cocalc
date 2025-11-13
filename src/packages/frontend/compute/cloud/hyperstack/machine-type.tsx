import { useMemo, useState } from "react";
import {
  capitalize,
  commas,
  currency,
  field_cmp,
  plural,
  search_match,
} from "@cocalc/util/misc";
import {
  markup,
  PurchaseOption,
  optionKey,
} from "@cocalc/util/compute/cloud/hyperstack/pricing";
import {
  Alert,
  Button,
  Checkbox,
  Tag,
  Popconfirm,
  Select,
  Tooltip,
} from "antd";
const { CheckableTag } = Tag;
import { GPU_SPECS } from "@cocalc/util/compute/gpu-specs";
import { getModelLinks, toGPU } from "./util";
import { filterOption } from "@cocalc/frontend/compute/util";
import { DEFAULT_REGION } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { humanFlavor } from "@cocalc/util/compute/cloud/hyperstack/flavor";
import { r_join } from "@cocalc/frontend/components/r_join";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import { availableClouds } from "@cocalc/frontend/compute/config";
import { DEFAULT_GPU_CONFIG as DEFAULT_GOOGLE_GPU_CONFIG } from "@cocalc/frontend/compute/google-cloud-config";

const TAGS = {
  H100: { search: ["h100"], desc: "an H100 GPU", group: 0 },
  A100: { search: ["a100"], desc: "an A100 GPU", group: 0 },
  L40: { search: ["l40"], desc: "an L40 GPU", group: 0 },
  "RTX-A6000": { search: ["rtx-a6000"], desc: "an RTX-A6000 GPU", group: 0 },
  // it seems like a4000 and a5000's are just gone from hyperstack now.
  //"RTX-A5000": { search: ["rtx-a5000"], desc: "an RTX-A5000 GPU", group: 0 },
  //"RTX-A4000": { search: ["rtx-a4000"], desc: "an RTX-A4000 GPU", group: 0 },
  //"1 × GPU": { search: ["quantity:1"], desc: "only one GPU", group: 1 },
  "CPU Only": { search: ["cpu only"], desc: "no GPUs", group: 0 },
  Canada: {
    search: ["canada"],
    desc: "in Canada",
    group: 2,
    tip: "🇨🇦 Only show servers in Canada.",
  },
  Norway: {
    search: ["norway"],
    desc: "in Norway",
    group: 2,
    tip: "🇳🇴 Only show servers in Norway.",
  },
};

function getLabel(x: PurchaseOption, priceData) {
  const cpuOnly = !x.gpu_count;
  const gpu = toGPU(x.gpu);
  const gpuSpec = GPU_SPECS[gpu];
  return (
    <div style={{ lineHeight: "20px", marginLeft: "10px" }}>
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
            fontWeight: "bold",
            fontSize: "11pt",
          }}
        >
          {cpuOnly ? (
            `CPU Only`
          ) : (
            <>
              {x.gpu_count} ×{" "}
              {gpu
                .replace("-PCIe", "")
                .replace("-", " - ")
                .replace("GB", " GB")}{" "}
              GPU
            </>
          )}
        </div>
        <div
          style={{
            flex: 1,
          }}
        >
          <div
            style={{
              fontSize: "13pt",
              position: "absolute",
              top: "12px",
            }}
          >
            {currency(markup({ cost: x.cost_per_hour, priceData }))}
            /hour
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {gpuSpec != null && (
            <>
              {gpuSpec?.memory != null && (
                <>{x.gpu_count * gpuSpec.memory} GB GPU RAM</>
              )}
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {x.cpu} {plural(x.cpu, "vCPU")}, {commas(x.ram)} GB RAM
        </div>
      </div>
      <div
        style={{
          display: "flex",
          minWidth: "700px",
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1 }}>
          {!cpuOnly && <>{x.available ?? 0} available in</>}{" "}
          {capitalize(x.region_name.toLowerCase().split("-")[0])} 🍃
        </div>
        <div style={{ flex: 1, color: "#888" }}>
          {/* humanFlavor(x.flavor_name) */}
        </div>
        <div style={{ flex: 1 }}>
          {gpuSpec != null && gpuSpec.cuda_cores > 0 && (
            <>
              {commas(x.gpu_count * gpuSpec.cuda_cores)}
              {" CUDA cores"}
            </>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {(x.ephemeral ?? 0) > 0 && (
            <Tooltip
              title={`The ephemeral disk is mounted at /ephemeral, and is deleted when the compute server is shutdown or rebooted.  Part of this disk is also used for caching.`}
            >
              {commas(x.ephemeral)} GB Ephemeral Disk
            </Tooltip>
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
  setCloud,
}) {
  const [selectOpen, setSelectOpen] = useState<boolean>(false);
  const [showUnavailable, setShowUnavailable] = useState<boolean>(false);
  //   const [showCpuOnly, setShowCpuOnly] = useState<boolean>(
  //     humanFlavor(configuration.flavor_name).includes("cpu"),
  //   );
  const showCpuOnly = true;
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());

  // Links is cosmetic to give an overview for users of what range of GPU models
  // are available.
  const links = useMemo(
    () => (priceData == null ? null : getModelLinks(priceData)),
    [priceData],
  );

  const region_name = configuration.region_name ?? DEFAULT_REGION;
  const value0 = optionKey(configuration);
  const options = useMemo(() => {
    if (priceData == null) {
      return null;
    }
    let opts = Object.values(priceData.options)
      //.filter((x: PurchaseOption) => (x.available ?? 0) > 0)
      .sort(field_cmp("cost_per_hour"))
      .filter((x: PurchaseOption) => {
        if (x.flavor_name == "s") {
          // the "s" flavor is totally broken, so filter it out.
          return false;
        }
        if (!x.gpu_count && !showCpuOnly) {
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
        const search = `ram:${
          x.gpu_count * (gpuSpec?.memory ?? 0)
        } ${x.region_name.toLowerCase()} cpu:${x.cpu} cpus:${x.cpu} ram:${
          x.ram
        } disk:${x.ephemeral} ephemeral:${
          x.ephemeral
        } gpu:${x.gpu.toLowerCase()} ${gpu} cores:${
          x.gpu_count * (gpuSpec?.cuda_cores ?? 0)
        } available:${x.available} ${humanFlavor(x.flavor_name)} ${
          cpuOnly ? "cpu only" : ""
        } quantity:${x.gpu_count}`;
        return {
          disabled,
          search,
          label: getLabel(x, priceData),
          value,
          x,
        };
      });
    if (filterTags.size > 0) {
      for (const tag of filterTags) {
        const f = TAGS[tag].search;
        opts = opts.filter(({ search }) => search_match(search, f));
      }
    }
    return opts;
  }, [priceData, value0, showUnavailable, showCpuOnly, filterTags]);

  if (options == null) {
    return null;
  }

  return (
    <div style={{ color: "#666" }}>
      {(state == "off" || state == "deprovisioned") && (
        <div style={{ float: "right", display: "flex", marginLeft: "15px" }}>
          <Tooltip
            title={
              <>
                Includes servers that are not currently available
                {state != "deprovisioned" ? " or in a different region" : ""}.
              </>
            }
          >
            <Checkbox
              style={{ float: "right" }}
              checked={showUnavailable}
              onChange={() => {
                setShowUnavailable(!showUnavailable);
                setSelectOpen(true);
              }}
            >
              Include Unavailable
            </Checkbox>
          </Tooltip>
          {/*  <Tooltip title="Include CPU only machine types.">
            <Checkbox
              style={{ float: "right" }}
              checked={showCpuOnly}
              onChange={() => {setShowCpuOnly(!showCpuOnly); setSelectOpen(true);}}
            >
              Include CPU Only
            </Checkbox>
          </Tooltip> */}
        </div>
      )}
      {state == "running"
        ? "You can only change the machine type when the compute server is off or deprovisioned."
        : "The machine type determines the GPU, RAM, and ephemeral disk size."}
      <div style={{ textAlign: "center", marginTop: "5px" }}>
        <Tooltip title="Click a filter to show only matching machines">
          <b style={{ marginRight: "10px" }}>Filters</b>
        </Tooltip>
        {Object.keys(TAGS)
          .filter((name) => {
            if (name == "CPU Only") {
              return showCpuOnly;
            } else return true;
          })
          .map((name) => (
            <Tooltip
              key={name}
              title={
                TAGS[name].tip ?? <>Only show servers with {TAGS[name].desc}.</>
              }
            >
              <CheckableTag
                key={name}
                style={{ cursor: "pointer" }}
                checked={filterTags.has(name)}
                onChange={(checked) => {
                  let v = Array.from(filterTags);
                  if (checked) {
                    v.push(name);
                    v = v.filter(
                      (x) => x == name || TAGS[x].group != TAGS[name].group,
                    );
                  } else {
                    v = v.filter((x) => x != name);
                  }
                  setFilterTags(new Set(v));
                  setSelectOpen(true);
                }}
              >
                {name}
              </CheckableTag>
            </Tooltip>
          ))}
      </div>
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
        onDropdownVisibleChange={setSelectOpen}
        open={selectOpen}
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
      {setCloud != null &&
        availableClouds().includes("google-cloud") &&
        (state ?? "deprovisioned") == "deprovisioned" && (
          <Alert
            showIcon
            style={{ margin: "5px 0" }}
            type="info"
            description={
              <div>
                Google Cloud offers highly discounted spot NVIDIA A100, L4, and
                T4 GPUs.{" "}
                <Popconfirm
                  title="Switch to Google Cloud"
                  description={
                    <div style={{ maxWidth: "450px" }}>
                      This will change the cloud for this compute server to
                      Google Cloud, and reset its configuration. Your compute
                      server is not storing any data so this is safe.
                    </div>
                  }
                  onConfirm={() => {
                    setCloud("google-cloud");
                    setConfig(DEFAULT_GOOGLE_GPU_CONFIG);
                  }}
                  okText="Switch to Google Cloud"
                  cancelText="Cancel"
                >
                  <Button type="link">Switch...</Button>
                </Popconfirm>
              </div>
            }
          />
        )}
    </div>
  );
}
