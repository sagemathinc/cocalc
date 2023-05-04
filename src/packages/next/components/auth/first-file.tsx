import {  useMemo } from "react";
import { FileTypeSelector } from "@cocalc/frontend/project/new/file-type-selector";
import { Input } from "antd";
import { filename_extension } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  tags: Set<string>;
  path: string;
  setPath: (path: string) => void;
  style;
}

export default function FirstFile({ path, setPath, style, tags }: Props) {
  const { availableFeatures, disabledFeatures } = useMemo(() => {
    return {
      availableFeatures: {
        jupyter_notebook:
          tags.has("ipynb") ||
          tags.has("py") ||
          tags.has("sage") ||
          tags.has("R") ||
          tags.has("jl") ||
          tags.has("m"),
        sage: tags.has("sage"),
        rmd: tags.has("R"),
        latex: tags.has("tex"),
        x11: tags.has("term") || tags.has("c"),
      },
      disabledFeatures: {
        servers: true,
        timers: true,
        linux: !tags.has("term") && !tags.has("c"),
        md: !tags.has("md") && !tags.has("board"),
        course: !tags.has("course"),
        chat: !tags.has("sage-chat"),
      },
    };
  }, [tags]);


  return (
    <div
      style={{
        ...style,
        marginTop: "10px",
        background: "white",
        borderRadius: "5px",
        padding: "10px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Icon name="plus-circle" /> Create New File
      </div>
      <div style={{ margin: "10px 0" }}>
        <Input
          autoFocus
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      </div>
      <FileTypeSelector
        create_file={(ext) => {
          const cur = filename_extension(path);
          if (cur) {
            setPath(path.slice(0, -cur.length) + ext);
          } else {
            setPath(path + "." + ext);
          }
        }}
        availableFeatures={availableFeatures}
        disabledFeatures={disabledFeatures}
      />
    </div>
  );
}
