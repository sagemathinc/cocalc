import { IMAGES } from "@cocalc/util/db-schema/compute-servers";
import type {
  ImageName,
  State,
  Configuration,
} from "@cocalc/util/db-schema/compute-servers";
import { Select } from "antd";
import { CSSProperties, useEffect, useState } from "react";

const OPTIONS = Object.keys(IMAGES).map((value) => {
  const { label } = IMAGES[value];
  return { key: value, value, label };
});

interface Props {
  setConfig;
  configuration: Configuration;
  disabled?: boolean;
  state?: State;
  style?: CSSProperties;
  gpu?: boolean; // if explicitly set, only gpu images shown when gpu true, and only non-gpu when false.
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
  if (gpu != null) {
    options = OPTIONS.filter((x) => gpu == IMAGES[x.value].gpu);
  } else {
    options = OPTIONS;
  }
  return (
    <Select
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
  );
}

export function DisplayImage({ configuration }) {
  const { image } = configuration ?? {};
  if (image == null) return null;
  const data = IMAGES[image];
  if (data == null) {
    return <span>{image}</span>;
  }
  return <span>{data.label}</span>;
}
