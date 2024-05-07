import { Select } from "antd";
import { useEffect, useState } from "react";
import { getTemplates } from "./api";
import type { ConfigurationTemplate } from "@cocalc/util/compute/templates";
import type { HyperstackConfiguration } from "@cocalc/util/db-schema/compute-servers";
import { CLOUDS_BY_NAME } from "@cocalc/util/compute/cloud/clouds";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { currency } from "@cocalc/util/misc";
import HyperstackSpecs from "@cocalc/frontend/compute/cloud/hyperstack/specs";
import GoogleCloudSpecs from "@cocalc/frontend/compute/cloud/google-cloud/specs";
import { RenderImage } from "./images";

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
  const [templates, setTemplates] = useState<ConfigurationTemplate[] | null>(
    null,
  );
  const [options, setOptions] = useState<any[]>([]);
  const [value, setValue0] = useState<number | undefined>(defaultId);
  const setValue = (n: number) => {
    setValue0(n);
    setId(n);
  };

  useEffect(() => {
    (async () => {
      const { templates, data } = await getTemplates();
      if (templates == null) {
        setTemplates(null);
        setOptions([]);
        return;
      }
      setTemplates(templates);
      setOptions(
        templates.map((template) => {
          return {
            value: template.id,
            label: <TemplateLabel template={template} data={data} />,
          };
        }),
      );
    })();
  }, []);

  if (templates == null || options.length == 0) {
    // not loaded or no configured templates right now.
    return null;
  }

  return (
    <div style={{ maxWidth: "1200px", margin: "15px auto", ...style }}>
      <Select
        defaultOpen={defaultOpen}
        placement={placement}
        getPopupContainer={getPopupContainer}
        disabled={disabled}
        value={value}
        onChange={setValue}
        options={options}
        style={{
          width: "100%",
          height: "86px",
        }}
        placeholder={
          <div style={{ fontSize: "13pt" }}>
            Select a compute server, then modify it to fit your needs...
          </div>
        }
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
        padding: "10px 0",
        overflow: "auto",
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
          whiteSpace: "pre-wrap",
          lineHeight: "normal",
          marginTop: "5px",
          textAlign: "center",
          overflow: "auto",
          maxHeight: "2.4em",
        }}
      >
        {specs}
      </div>
    </div>
  );
}
