import type {
  Configuration,
  Images,
} from "@cocalc/util/db-schema/compute-servers";
import { Button, Radio, Spin, Tooltip } from "antd";
import { useEffect, useMemo, useState } from "react";
import { A, Icon } from "@cocalc/frontend/components";
import { forceRefreshImages } from "./images-hook";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  setConfig;
  configuration: Configuration;
  disabled?: boolean;
  image: string;
  IMAGES: Images;
  style?;
}

export default function SelectVersion({
  setConfig: setConfig0,
  configuration,
  disabled,
  image,
  IMAGES,
  style,
}: Props) {
  const setConfig = (obj) => {
    // because we can't use null as a value for radio buttons...
    for (const k in obj) {
      if (!obj[k]) {
        obj[k] = null;
      }
    }
    setConfig0(obj);
  };
  const [tag, setTag] = useState<string>(configuration.tag ?? "");
  const [tag_filesystem, set_tag_filesystem] = useState<string>(
    configuration.tag_filesystem ?? "",
  );
  const [tag_cocalc, set_tag_cocalc] = useState<string>(
    configuration.tag_cocalc ?? "",
  );

  useEffect(() => {
    setTag(configuration.tag ?? "");
  }, [configuration.tag]);

  useEffect(() => {
    set_tag_filesystem(configuration.tag_filesystem ?? "");
  }, [configuration.tag_filesystem]);

  useEffect(() => {
    set_tag_cocalc(configuration.tag_cocalc ?? "");
  }, [configuration.tag_cocalc]);

  // [ ] TODO: MAYBE we should allow gpu/non-gpu options in all cases, but just suggest one or the other?
  const options = useMemo(() => {
    return [
      {
        label: (
          <Tooltip title="Use newest available tested image.">Default</Tooltip>
        ) as any,
        value: "",
        key: "default",
      },
    ].concat((IMAGES[image]?.versions ?? []).map(toOption));
  }, [IMAGES, image]);

  const fsOptions = useMemo(() => {
    return [
      {
        label: (
          <Tooltip title="Use newest available tested filesystem image.">
            Default
          </Tooltip>
        ) as any,
        value: "",
        key: "default",
      },
    ].concat((IMAGES["filesystem"]?.versions ?? []).map(toOption));
  }, [IMAGES, image]);

  const cocalcOptions = useMemo(() => {
    return (
      IMAGES["cocalc"]?.versions ?? [{ tag: "test" }, { tag: "latest" }]
    ).map(toOption);
  }, [IMAGES, image]);

  // TODO: it would be better to have tagUrl or something like that below...

  return (
    <div style={style}>
      <RefreshImagesButton size={"small"} style={{ float: "right" }} />
      <SelectTag
        style={{ marginBottom: "5px" }}
        label={
          <A
            href={
              IMAGES[image]?.url ??
              IMAGES[image]?.source ??
              "https://github.com/sagemathinc/cocalc-compute-docker"
            }
          >
            {IMAGES[image]?.label ?? image}
          </A>
        }
        disabled={disabled}
        tag={tag}
        options={options}
        setTag={(tag) => {
          setTag(tag);
          setConfig({ tag });
        }}
      />
      <SelectTag
        style={{ marginBottom: "5px" }}
        label={
          <A
            href={
              IMAGES["filesystem"]?.url ??
              IMAGES["filesystem"]?.source ??
              "https://github.com/sagemathinc/cocalc-compute-docker/tree/main/src/filesystem"
            }
          >
            Filesystem
          </A>
        }
        disabled={disabled}
        tag={tag_filesystem}
        options={fsOptions}
        setTag={(tag) => {
          set_tag_filesystem(tag);
          setConfig({ tag_filesystem: tag });
        }}
      />
      <SelectTag
        style={undefined}
        label={
          <A
            href={
              IMAGES["cocalc"]?.url ??
              IMAGES["cocalc"]?.source ??
              "https://www.npmjs.com/package/@cocalc/compute-server"
            }
          >
            CoCalc
          </A>
        }
        disabled={disabled}
        tag={tag_cocalc}
        options={cocalcOptions}
        setTag={(tag) => {
          set_tag_cocalc(tag);
          setConfig({ tag_cocalc: tag });
        }}
      />
    </div>
  );
}

function toOption(x: {
  label?: string;
  tag: string;
  description?: string;
  tested?: boolean;
  version?: string;
}) {
  return {
    label: (
      <Tooltip
        title={
          <>
            {x.tag ?? x.label ?? ""} {x.description ?? ""}
          </>
        }
      >
        {x.label ?? x.tag}
        {!x.tested ? " (untested)" : ""}
      </Tooltip>
    ),
    value: x.tag,
    key: x.tag,
  };
}

function SelectTag({ disabled, tag, setTag, options, label, style }) {
  return (
    <div style={{ display: "flex", ...style }}>
      <div
        style={{
          width: "100px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}{" "}
      </div>
      <Radio.Group
        size="small"
        disabled={disabled}
        options={options}
        onChange={({ target: { value } }) => setTag(value)}
        value={tag}
        optionType="button"
        buttonStyle="solid"
      />
    </div>
  );
}

export function RefreshImagesButton({ size, style }: { size?; style? }) {
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  return (
    <div style={style}>
      <Button
        size={size}
        onClick={async () => {
          try {
            setError("");
            setRefreshing(true);
            await forceRefreshImages();
          } catch (err) {
            setError(`${err}`);
          } finally {
            setRefreshing(false);
          }
        }}
        disabled={refreshing}
      >
        <Icon name="refresh" /> Refresh{refreshing ? "ing..." : ""} Images
        {refreshing && <Spin style={{ marginLeft: "10px" }} />}
      </Button>
      <ShowError error={error} setError={setError} />
    </div>
  );
}
