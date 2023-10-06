/*
Dropdown on frame title bar for running that Jupyter notebook or terminal on a compute server.
*/

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Select, Tooltip } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { cmp } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { capitalize } from "@cocalc/util/misc";

interface Props {
  project_id: string;
  path: string;
  frame_id: string;
  style?: CSSProperties;
}

export default function SelectComputeServer({
  project_id,
  path,
  frame_id,
  style,
}: Props) {
  console.log({ path, frame_id });
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const computeServers = useTypedRedux(
    { project_id },
    "compute_servers",
  )?.toJS();
  const computeServerAssociations = useMemo(() => {
    return webapp_client.project_client.computeServers(project_id);
  }, [project_id]);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const handleChange = async () => {
      try {
        const id = await computeServerAssociations.getServerIdForPath(path);
        if (id) {
          setValue(`${id}`);
        } else {
          setValue(null);
        }
      } catch (err) {
        console.log(err);
      }
    };
    computeServerAssociations.on("change", handleChange);
    (async () => {
      try {
        setLoading(true);
        await handleChange();
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      computeServerAssociations.removeListener("change", handleChange);
    };
  }, [project_id]);

  const options = useMemo(() => {
    const options: {
      value: string;
      sort: string;
      label: ReactNode;
      state: string;
    }[] = [];
    for (const id in computeServers) {
      const server = computeServers[id];
      if (server.deleted) continue;
      const { color, title, state } = server;
      const { icon } = STATE_INFO[state ?? "off"] ?? {};
      const label = (
        <div
          style={{
            backgroundColor: color,
            color: "white",
            overflow: "hidden",
            padding: "0 5px",
          }}
        >
          {icon && (
            <Tooltip title={capitalize(state)}>
              <Icon name={icon} style={{ marginRight: "5px" }} />
            </Tooltip>
          )}
          {title}
        </div>
      );
      options.push({ value: id, sort: title.toLowerCase(), state, label });
    }
    options.sort((a, b) => {
      if (a.state == "running" && b.state != "running") {
        return -1;
      }
      if (b.state == "running" && a.state != "running") {
        return 1;
      }
      return cmp(a.sort, b.sort);
    });
    options.unshift({
      value: "0",
      sort: "project",
      state: "",
      label: "Run in this project",
    });
    return options;
  }, [computeServers]);

  return (
    <Tooltip
      placement={"right"}
      title={`Run ${
        path.endsWith("ipynb") ? "Jupyter notebook" : "terminal"
      } in this project or on a powerful dedicated compute server`}
    >
      <Select
        bordered={false}
        disabled={loading}
        placeholder={<Icon style={{color:"#666"}} name="server" />}
        open={open}
        onSelect={(id) => {
          setValue(id);
          const idNum = Number(id ?? "0");
          if (idNum) {
            computeServerAssociations.connectComputeServerToPath({
              id: idNum,
              path,
            });
          } else {
            computeServerAssociations.disconnectComputeServer({ path });
          }
        }}
        onClear={() => {
          setValue(null);
        }}
        value={value}
        onDropdownVisibleChange={setOpen}
        style={{
          ...style,
          width: open ? "300px" : "64px",
          background: value ? computeServers[value]?.color : undefined,
          color: "white", // todo
        }}
        options={options}
      />
    </Tooltip>
  );
}
