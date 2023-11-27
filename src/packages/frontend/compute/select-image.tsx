import { IMAGES } from "@cocalc/util/db-schema/compute-servers";
import type {
  ImageName,
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Select } from "antd";
import { CSSProperties, useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { A } from "@cocalc/frontend/components/A";

// TODO: just putting a quick version here -- will redo.
const OPTIONS = Object.keys(IMAGES).map((value) => {
  const { label, icon, versions } = IMAGES[value];
  return {
    key: value,
    value,
    label: (
      <div style={{ fontSize: "12pt" }}>
        <div style={{ float: "right" }}>
          {versions[versions.length - 1]?.label}
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
  // colab special case.
  if (gpu != null) {
    options = OPTIONS.filter(
      (x) => x.value == "colab" || gpu == IMAGES[x.value].gpu,
    );
  } else {
    options = OPTIONS;
  }
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
      />
    </div>
  );
}

export function ImageLinks({ image }) {
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
      }}
    >
      <A style={{ flex: 1 }} href={data.url}>
        <Icon name="external-link" /> {data.label}
      </A>
      <A style={{ flex: 1 }} href={data.source}>
        <Icon name="github" /> Source
      </A>
      <A style={{ flex: 1 }} href={`https://hub.docker.com/r/${data.docker}`}>
        <Icon name="docker" /> dockerhub
      </A>
    </div>
  );
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
