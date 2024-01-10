import type {
  State,
  Configuration,
  Images,
} from "@cocalc/util/db-schema/compute-servers";
import { Alert, Select, Spin } from "antd";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Icon, Markdown } from "@cocalc/frontend/components";
import { A } from "@cocalc/frontend/components/A";
import { field_cmp } from "@cocalc/util/misc";
import { useImages } from "./images-hook";

function getOptions({
  IMAGES,
  tested,
  gpu,
}: {
  IMAGES: Images;
  tested: boolean;
  gpu?: boolean;
}) {
  const options: {
    key: string;
    priority: number;
    value: string;
    search: string;
    label: JSX.Element;
  }[] = [];
  for (const name in IMAGES) {
    const image = IMAGES[name];
    let { label, icon, versions, priority = 0 } = image;
    if (image.system || image.disabled) {
      continue;
    }
    if (gpu != null && gpu != image.gpu) {
      continue;
    }
    if (tested) {
      // restrict to only tested versions.
      versions = versions.filter((x) => x.tested);
    }
    if (versions.length == 0) {
      // no available versions, so no point in showing this option
      continue;
    }
    options.push({
      key: name,
      value: name,
      priority,
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
    });
  }
  options.sort(field_cmp("priority")).reverse();
  return options;
}

interface Props {
  setConfig;
  configuration: Configuration;
  disabled?: boolean;
  state?: State;
  style?: CSSProperties;
  gpu: boolean; // if explicitly set, only gpu images shown when gpu true, and only non-gpu when false.
  tested: boolean; // if false show dangerous untested images
}

export default function SelectImage({
  setConfig,
  configuration,
  disabled,
  state = "deprovisioned",
  style,
  gpu,
  tested,
}: Props) {
  const { IMAGES, ImagesError } = useImages();
  const [value, setValue] = useState<string | undefined>(configuration.image);
  useEffect(() => {
    setValue(configuration.image);
  }, [configuration.image]);
  // [ ] TODO: MAYBE we should allow gpu/non-gpu options in all cases, but just suggest one or the other?
  const options = useMemo(() => {
    if (IMAGES == null || typeof IMAGES == "string") {
      return [];
    }
    return getOptions({ IMAGES, gpu, tested });
  }, [IMAGES, gpu, tested]);

  if (IMAGES == null) {
    return <Spin />;
  }
  if (typeof IMAGES == "string") {
    return ImagesError;
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
  const { IMAGES, ImagesError } = useImages();
  if (IMAGES == null) {
    return <Spin />;
  }
  if (typeof IMAGES == "string") {
    return ImagesError;
  }
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

export function DisplayImage({
  configuration,
}: {
  configuration: { image: string };
}) {
  const { IMAGES, ImagesError } = useImages();
  if (IMAGES == null) {
    return <Spin />;
  }
  if (typeof IMAGES == "string") {
    return ImagesError;
  }
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

export function ImageDescription({
  configuration,
}: {
  configuration: { image: string };
}) {
  const { IMAGES, ImagesError } = useImages();
  if (IMAGES == null) {
    return <Spin />;
  }
  if (typeof IMAGES == "string") {
    return ImagesError;
  }
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
