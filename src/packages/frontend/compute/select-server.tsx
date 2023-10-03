import type { CSSProperties, ReactNode } from "react";
import { useMemo, useState } from "react";
import { Select } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";

interface Props {
  project_id: string;
  path: string;
  style?: CSSProperties;
}

export default function SelectComputeServer({ project_id, style }: Props) {
  const [value, setValue] = useState<string | null>(null);
  const [color, setColor] = useState<string | undefined>(undefined);
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
        <div
          style={{
            backgroundColor: color,
            color: "white",
            overflow: "hidden",
            padding: "0 5px",
          }}
        >
          <Icon name="server" style={{ marginRight: "5px" }} />
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
      bordered={false}
      allowClear
      placeholder="Compute..."
      open={open}
      onSelect={(id) => {
        setValue(id);
        setColor(computeServers[id]?.color);
      }}
      onClear={() => {
        setValue(null);
        setColor(undefined);
      }}
      value={value}
      onDropdownVisibleChange={setOpen}
      style={{
        ...style,
        width: open ? "300px" : "125px",
        background: !open ? color : undefined,
        color: "white", // todo
      }}
      options={options}
    />
  );
}
