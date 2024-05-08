import { Select, Spin, Tag, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { getTemplates } from "@cocalc/frontend/compute/api";
import type { ConfigurationTemplate } from "@cocalc/util/compute/templates";
import type { HyperstackConfiguration } from "@cocalc/util/db-schema/compute-servers";
import { CLOUDS_BY_NAME } from "@cocalc/util/compute/cloud/clouds";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { currency, search_match } from "@cocalc/util/misc";
import HyperstackSpecs from "@cocalc/frontend/compute/cloud/hyperstack/specs";
import GoogleCloudSpecs from "@cocalc/frontend/compute/cloud/google-cloud/specs";
import { RenderImage } from "@cocalc/frontend/compute/images";
import { filterOption } from "@cocalc/frontend/compute/util";
import DisplayCloud from "./display-cloud";

const { CheckableTag } = Tag;

const TAGS = {
  Python: {
    search: ({ configuration }) =>
      configuration.image.toLowerCase().includes("python"),
    desc: "with a Python oriented image",
  },
  Julia: {
    search: ({ configuration }) =>
      configuration.image.toLowerCase().includes("julia"),
    desc: "with a Julia oriented image",
  },
  R: {
    search: ({ configuration }) =>
      configuration.image.toLowerCase().includes("rstat"),
    desc: "with an R Statistics oriented image",
  },
  GPU: { search: ["gpu"], desc: "that have a GPU", group: 0 },
  "CPU Only": { search: ["cpu only"], desc: "that have no GPU", group: 0 },
  Google: {
    label: <DisplayCloud cloud="google-cloud" height={14} />,
    search: ["google"],
    group: 1,
    desc: "in Google Cloud",
  },
  Hyperstack: {
    label: <DisplayCloud cloud="hyperstack" height={14} />,
    search: ["hyperstack"],
    group: 1,
    desc: "in Hyperstack Cloud",
  },
} as const;

export default function PublicTemplates({
  style,
  setId,
  defaultId,
  disabled,
  defaultOpen,
  placement,
  getPopupContainer,
}: {
  style?;
  setId: (number) => void;
  defaultId?: number;
  disabled?: boolean;
  defaultOpen?: boolean;
  placement?;
  getPopupContainer?;
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [templates, setTemplates] = useState<
    (ConfigurationTemplate | { search: string })[] | null
  >(null);
  const [options, setOptions] = useState<any[]>([]);
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [selectOpen, setSelectOpen] = useState<boolean>(!!defaultOpen);
  const [value, setValue0] = useState<number | undefined>(defaultId);
  const setValue = (n: number) => {
    setValue0(n);
    setId(n);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { templates, data } = await getTemplates();
        if (templates == null || templates.length == 0) {
          setTemplates(null);
          setOptions([]);
          return;
        }
        setTemplates(templates);
        let x = templates.map((template) => {
          return {
            template,
            value: template.id,
            label: <TemplateLabel template={template} data={data} />,
            search: JSON.stringify(template),
          };
        });
        if (filterTags.size > 0) {
          for (const tag of filterTags) {
            const f = TAGS[tag].search;
            if (typeof f == "function") {
              x = x.filter(({ template }) => f(template));
            } else {
              x = x.filter(({ search }) => search_match(search, f));
            }
          }
        }
        setOptions(x);
      } finally {
        setLoading(false);
      }
    })();
  }, [filterTags]);

  if (loading) {
    return (
      <div style={{ maxWidth: "1200px", margin: "15px auto", ...style }}>
        Loading Templates... <Spin />
      </div>
    );
  }

  if (templates == null || templates?.length == 0) {
    // not loaded or no configured templates right now.
    return null;
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "15px auto", ...style }}>
      <div
        style={{
          textAlign: "center",
          marginBottom: "5px",
          fontWeight: "normal",
        }}
      >
        <Tooltip title="Click a filter to show only matching templates">
          <b
            style={{
              marginRight: "10px",
              fontWeight: "bold",
              fontSize: "12px",
            }}
          >
            Filters
          </b>
        </Tooltip>
        {Object.keys(TAGS).map((name) => (
          <Tooltip
            key={name}
            title={
              TAGS[name].tip ?? <>Only show templates {TAGS[name].desc}.</>
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
                setSelectOpen(checked);
              }}
            >
              {TAGS[name].label ?? name}
            </CheckableTag>
          </Tooltip>
        ))}
      </div>
      <Select
        allowClear
        open={selectOpen}
        defaultOpen={defaultOpen}
        placement={placement}
        getPopupContainer={getPopupContainer}
        disabled={disabled}
        value={value}
        onChange={setValue}
        options={options}
        style={{
          width: "100%",
          height: "auto",
        }}
        placeholder={
          <div>Select a compute server template, then modify it...</div>
        }
        showSearch
        optionFilterProp="children"
        filterOption={filterOption}
        onDropdownVisibleChange={setSelectOpen}
      />
    </div>
  );
}

function TemplateLabel({ template, data }) {
  const { title, color, cloud, cost_per_hour } = template;
  const cost = (
    <div style={{ fontSize: "13pt" }}>
      {currency(cost_per_hour.running)}/hour
    </div>
  );
  let specs;
  if (template.cloud == "hyperstack") {
    specs = (
      <HyperstackSpecs
        {...(template.configuration as HyperstackConfiguration)}
        priceData={data.hyperstackPriceData}
      />
    );
  } else if (template.cloud == "google-cloud") {
    specs = (
      <GoogleCloudSpecs
        configuration={template.configuration}
        priceData={data.googleCloudPriceData}
        IMAGES={data.images}
      />
    );
  } else {
    specs = null;
  }
  return (
    <div
      style={{
        lineHeight: "normal",
        borderWidth: "0.5px 10px",
        borderStyle: "solid",
        borderColor: color,
        borderRadius: "5px",
        padding: "10px",
        overflow: "auto",
        margin: "5px 10px",
      }}
    >
      <div style={{ display: "flex", margin: "0 15px" }}>
        <div style={{ flex: 1, textAlign: "center" }}>{cost}</div>
        <div
          style={{
            flex: 1,
            background: color ?? "#fff",
            color: avatar_fontcolor(color ?? "#fff"),
            padding: "2.5px 5px",
            overflow: "auto",
          }}
        >
          {title}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ float: "right" }}>
            <RenderImage
              configuration={template.configuration}
              IMAGES={data.images}
            />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ width: "120px", float: "right" }}>
            <img src={CLOUDS_BY_NAME[cloud]?.image} alt={cloud} />
          </div>
        </div>
      </div>
      <div
        style={{
          whiteSpace: "nowrap",
          lineHeight: "normal",
          marginTop: "5px",
          textAlign: "center",
          overflow: "auto",
          maxHeight: "1.2em",
          textOverflow: "ellipsis",
          color: "#666",
        }}
      >
        {specs}
      </div>
    </div>
  );
}
