import { Select, Spin, Tag, Tooltip } from "antd";
import { useEffect, useState } from "react";
import { getTemplates } from "@cocalc/frontend/compute/api";
import type { ConfigurationTemplate } from "@cocalc/util/compute/templates";
import type { HyperstackConfiguration } from "@cocalc/util/db-schema/compute-servers";
import { CLOUDS_BY_NAME } from "@cocalc/util/compute/cloud/clouds";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { cmp, currency, search_match } from "@cocalc/util/misc";
import HyperstackSpecs from "@cocalc/frontend/compute/cloud/hyperstack/specs";
import GoogleCloudSpecs from "@cocalc/frontend/compute/cloud/google-cloud/specs";
import { RenderImage } from "@cocalc/frontend/compute/images";
import { filterOption } from "@cocalc/frontend/compute/util";
import DisplayCloud from "./display-cloud";
import { Icon } from "@cocalc/frontend/components/icon";

const { CheckableTag } = Tag;

const TAGS = {
  GPU: {
    label: (
      <>
        <Icon name="gpu" /> GPU
      </>
    ),
    search: hasGPU,
    desc: "that have a GPU",
    group: 0,
  },
  H100: {
    label: (
      <>
        <Icon name="nvidia" /> H100
      </>
    ),
    search: (template) =>
      template.configuration.flavor_name?.toLowerCase().includes("h100"),
    desc: "that have a high end NVIDIA H100 GPU",
    group: 0,
  },
  A100: {
    label: (
      <>
        <Icon name="nvidia" /> A100
      </>
    ),
    search: (template) =>
      template.configuration.flavor_name?.toLowerCase().includes("a100") ||
      template.configuration.acceleratorType?.toLowerCase().includes("a100"),
    desc: "that have a high end NVIDIA A100 GPU",
    group: 0,
  },
  L40: {
    label: (
      <>
        <Icon name="nvidia" /> L40
      </>
    ),
    search: (template) =>
      template.configuration.flavor_name?.toLowerCase().includes("l40"),
    desc: "that have a midrange NVIDIA L40 GPU",
    group: 0,
  },
  RTX: {
    label: (
      <>
        <Icon name="nvidia" /> RTX
      </>
    ),
    search: (template) =>
      template.configuration.flavor_name?.toLowerCase().includes("rtx"),
    desc: "that have a midrange NVIDIA RTX-4000/5000/6000 GPU",
    group: 0,
  },

  L4: {
    label: (
      <>
        <Icon name="nvidia" /> L4
      </>
    ),
    search: (template) =>
      template.configuration.acceleratorType
        ?.toLowerCase()
        .includes("nvidia-l4"),
    desc: "that have a midrange NVIDIA L4 GPU",
    group: 0,
  },
  T4: {
    label: (
      <>
        <Icon name="nvidia" /> T4
      </>
    ),
    search: (template) =>
      template.configuration.acceleratorType
        ?.toLowerCase()
        .includes("tesla-t4"),
    desc: "that have a budget NVIDIA T4 GPU",
    group: 0,
  },
  CPU: {
    label: (
      <>
        <Icon name="microchip" /> CPU
      </>
    ),
    search: (template) => !hasGPU(template),
    desc: "that have no GPU's",
    group: 0,
  },
  Python: {
    label: (
      <>
        <Icon name="python" /> Python
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return (
        im.includes("python") || im.includes("anaconda") || im.includes("colab")
      );
    },
    desc: "with a Python oriented image",
    group: 1,
  },
  SageMath: {
    label: (
      <>
        <Icon name="sagemath" /> Sage
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return im.includes("sage") || im.includes("anaconda");
    },
    desc: "with a Julia oriented image",
    group: 1,
  },
  Julia: {
    label: (
      <>
        <Icon name="julia" /> Julia
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return im.includes("julia") || im.includes("anaconda");
    },
    desc: "with a Julia oriented image",
    group: 1,
  },
  R: {
    label: (
      <>
        <Icon name="r" /> R
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return im.includes("rstat") || im.includes("colab");
    },
    desc: "with an R Statistics oriented image",
    group: 1,
  },
  PyTorch: {
    label: (
      <>
        <Icon name="pytorch" /> PyTorch
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return (
        im.includes("torch") || im.includes("colab") || im.includes("conda")
      );
    },
    desc: "with a PyTorch capable image",
    group: 1,
  },
  Tensorflow: {
    label: (
      <>
        <Icon name="tensorflow" /> Tensorflow
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return (
        im.includes("tensorflow") ||
        im.includes("colab") ||
        im.includes("conda")
      );
    },
    desc: "with a Tensorflow oriented image",
    group: 1,
  },
  HPC: {
    label: (
      <>
        <Icon name="cube" /> HPC/Fortran
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return im == "hpc";
    },
    desc: "with an HPC/Fortran oriented image",
    group: 1,
  },
  Ollama: {
    label: (
      <>
        <Icon name="magic" /> Ollama
      </>
    ),
    search: ({ configuration }) => {
      const im = configuration.image.toLowerCase();
      return im.includes("openwebui");
    },
    desc: "with an Open WebUI / Ollama AI oriented image",
    group: 1,
  },
  Google: {
    label: <DisplayCloud cloud="google-cloud" height={18} />,
    search: ({ configuration }) => configuration.cloud == "google-cloud",
    group: 2,
    desc: "in Google Cloud",
  },
  Hyperstack: {
    label: <DisplayCloud cloud="hyperstack" height={18} />,
    search: ({ configuration }) => configuration.cloud == "hyperstack",
    group: 2,
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
  const [data, setData] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [visibleTags, setVisibleTags] = useState<Set<string>>(new Set());
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
          setData(null);
          setOptions([]);
          return;
        }
        setTemplates(templates);
        setData(data);
        const options = getOptions(templates, data);
        const tags = new Set<string>();
        for (const tag in TAGS) {
          if (matchingOptions(options, tag).length > 0) {
            tags.add(tag);
          }
        }
        setVisibleTags(tags);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (templates == null) {
      return;
    }
    let options = getOptions(templates, data);
    if (filterTags.size > 0) {
      for (const tag of filterTags) {
        options = matchingOptions(options, tag);
      }
      // we also sort by price when there is a filter (otherwise not)
      options.sort((a, b) =>
        cmp(a.template.cost_per_hour.running, b.template.cost_per_hour.running),
      );
    }
    setOptions(options);
  }, [filterTags, templates, data]);

  if (loading) {
    return (
      <div style={{ maxWidth: "1200px", margin: "15px auto", ...style }}>
        Loading Templates... <Spin delay={3000} />
      </div>
    );
  }

  if (templates == null || templates?.length == 0) {
    // not loaded or no configured templates right now.
    return null;
  }

  let group = 0;

  return (
    <div style={{ maxWidth: "1200px", margin: "15px auto", ...style }}>
      <div style={{ display: "flex" }}>
        <div
          style={{
            fontWeight: "bold",
            fontSize: "13pt",
            flex: 0.1,
            color: "#666",
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
            whiteSpace: "nowrap",
            paddingLeft: "15px",
          }}
        >
          Templates:
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            marginBottom: "5px",
            fontWeight: "normal",
            border: "1px solid lightgrey",
            borderRadius: "5px",
            marginLeft: "15px",
            background: "#fffeee",
            padding: "10px",
          }}
        >
          {Object.keys(TAGS)
            .filter((tag) => visibleTags.has(tag))
            .map((name) => {
              const t = (
                <Tooltip
                  mouseEnterDelay={1}
                  key={name}
                  title={
                    TAGS[name].tip ?? (
                      <>Only show templates {TAGS[name].desc}.</>
                    )
                  }
                >
                  {TAGS[name].group != group && <br />}
                  <CheckableTag
                    key={name}
                    style={{ cursor: "pointer", fontSize: "12pt" }}
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
                      setSelectOpen(v.length > 0);
                    }}
                  >
                    {TAGS[name].label ?? name}
                  </CheckableTag>
                </Tooltip>
              );
              group = TAGS[name].group;
              return t;
            })}
        </div>
        <div style={{ flex: 0.1 }}></div>
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
          <div style={{ color: "#666" }}>
            Use filters above or type here to find a template, then modify it...
          </div>
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

function hasGPU(template) {
  if (template.configuration.cloud == "hyperstack") {
    return !template.configuration.flavor_name.includes("cpu");
  } else if (template.configuration.cloud == "google-cloud") {
    return !!template.configuration.acceleratorCount;
  } else {
    return JSON.stringify(template).includes("gpu");
  }
}

function getOptions(templates, data) {
  return templates.map((template) => {
    return {
      template,
      value: template.id,
      label: <TemplateLabel template={template} data={data} />,
      search: JSON.stringify(template).toLowerCase(),
    };
  });
}

function matchingOptions(options, tag) {
  const f = TAGS[tag]?.search;
  if (!f) {
    return options;
  }
  if (typeof f == "function") {
    return options.filter(({ template }) => f(template));
  } else {
    return options.filter(({ search }) => search_match(search, f));
  }
}
