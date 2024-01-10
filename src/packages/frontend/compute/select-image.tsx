import { IMAGES } from "@cocalc/util/db-schema/compute-servers";
import type {
  ImageName,
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Alert, Select } from "antd";
import { CSSProperties, useEffect, useState } from "react";
import { Icon, Markdown } from "@cocalc/frontend/components";
import { A } from "@cocalc/frontend/components/A";

// TODO: just putting a quick version here -- will redo.
const OPTIONS = Object.keys(IMAGES)
  .filter((value) => !IMAGES[value].system && !IMAGES[value].disabled)
  .map((value) => {
    const { label, icon, versions } = IMAGES[value];
    return {
      key: value,
      value,
      search: label?.toLowerCase() ?? "",
      label: (
        <div style={{ fontSize: "12pt" }}>
          <div style={{ float: "right" }}>
            {versions[versions.length - 1]?.label ??
              versions[versions.length - 1]?.tag}
          </div>
          <Icon name={icon} style={{ marginRight: "5px" }} /> {label}
        </div>
      ),
    };
  });

interface Props {
  setConfig;
  configuration: Configuration;
  disabled?: boolean;
  state?: State;
  style?: CSSProperties;
  gpu: boolean; // if explicitly set, only gpu images shown when gpu true, and only non-gpu when false.
}

export default function SelectImage({
  setConfig,
  configuration,
  disabled,
  state = "deprovisioned",
  style,
  gpu,
}: Props) {
  const [value, setValue] = useState<ImageName | undefined>(
    configuration.image,
  );
  useEffect(() => {
    setValue(configuration.image);
  }, [configuration.image]);
  let options;
  // [ ] TODO: we should allow gpu/non-gpu options in all cases, but just suggest one or the other.
  if (gpu != null) {
    options = OPTIONS.filter((x) => gpu == IMAGES[x.value].gpu);
  } else {
    options = OPTIONS;
  }
  const filterOption = (input: string, option?: { search: string }) =>
    (option?.search ?? "").includes(input.toLowerCase());

  return (
    <div>
      <Select
        size="large"
        disabled={disabled || state != "deprovisioned"}
        placeholder="Select compute server image..."
        defaultOpen={!value && state == "deprovisioned"}
        value={value}
        style={style}
        options={options}
        onChange={(val) => {
          setValue(val);
          setConfig({ image: val });
        }}
        showSearch
        filterOption={filterOption}
      />
    </div>
  );
}

export function ImageLinks({ image, style }: { image; style? }) {
  const data = IMAGES[image];
  if (data == null) {
    return null;
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: "10px",
        height: "90px", // so not squished vertically
        ...style,
      }}
    >
      <A style={{ flex: 1 }} href={data.url}>
        <Icon name="external-link" /> {data.label}
      </A>
      <A style={{ flex: 1 }} href={data.source}>
        <Icon name="github" /> Source
      </A>
      <A style={{ flex: 1 }} href={packageNameToUrl(data.package)}>
        <Icon name="docker" /> dockerhub
      </A>
    </div>
  );
}

// this is a heuristic but is probably right in many cases, and
// right now the only case is n<=1, where it is right.
function packageNameToUrl(name: string): string {
  const n = name.split("/").length - 1;
  if (n <= 1) {
    return `https://hub.docker.com/r/${name}`;
  } else {
    // e.g., us-docker.pkg.dev/colab-images/public/runtime
    return `https://${name}`;
  }
}

export function DisplayImage({ configuration }) {
  const { image } = configuration ?? {};
  if (image == null) return null;
  const data = IMAGES[image];
  if (data == null) {
    return <span>{image}</span>;
  }
  return (
    <span>
      <Icon name={data.icon} style={{ marginRight: "5px" }} /> {data.label}
    </span>
  );
}

export function ImageDescription({ configuration }) {
  return (
    <Alert
      style={{ padding: "7.5px 15px", marginTop: "10px" }}
      type="info"
      description={
        <Markdown
          value={IMAGES[configuration?.image ?? ""]?.description ?? ""}
        />
      }
    />
  );
}
