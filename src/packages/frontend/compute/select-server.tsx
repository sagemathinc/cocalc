import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Select } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";

interface Props {
  project_id: string;
  path: string;
  style?: CSSProperties;
}

export default function SelectComputeServer({
  project_id,
  style,
}: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean>(false);
  const computeServers = useTypedRedux(
    { project_id },
    "compute_servers",
  )?.toJS();

  const options = useMemo(() => {
    const options: { value: string; title: string; label: ReactNode }[] = [];
    for (const id in computeServers) {
      const server = computeServers[id];
      if (server.deleted) continue;
      const { color, title } = server;
      const label = (
        <div style={{ display: "flex" }}>
          <div
            style={{
              backgroundColor: color,
              display: "inline-block",
              width: "20px",
              marginRight: "5px",
            }}
          ></div>
          {title}
        </div>
      );
      options.push({ value: id, title, label });
    }
    options.sort((a, b) => cmp(a.title, b.title));
    return options;
  }, [computeServers]);

  return (
    <Select
      allowClear
      placeholder="Compute..."
      open={open}
      onSelect={setValue}
      onClear={() => setValue(null)}
      value={value}
      onDropdownVisibleChange={setOpen}
      style={{ ...style, width: open ? "300px" : "125px" }}
      options={options}
    />
  );
}
