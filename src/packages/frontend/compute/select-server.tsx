/*
Dropdown on frame title bar for running that Jupyter notebook or terminal on a compute server.
*/

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Modal, Select, Tooltip } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { cmp } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { capitalize } from "@cocalc/util/misc";
import { DisplayImage } from "./select-image";
import { delay } from "awaiting";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

interface Props {
  project_id: string;
  path: string;
  frame_id: string;
  style?: CSSProperties;
  actions?;
  type: "terminal" | "jupyter_cell_notebook";
}

export default function SelectComputeServer({
  project_id,
  path,
  frame_id,
  actions,
  style,
  type,
}: Props) {
  const getPath = (path) => {
    if (actions != null && type == "terminal") {
      return actions.terminals.get(frame_id)?.term_path;
    }
    return path;
  };
  const [confirmSwitch, setConfirmSwitch] = useState<boolean>(false);
  const [idNum, setIdNum] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const computeServers = useTypedRedux(
    { project_id },
    "compute_servers",
  )?.toJS() ?? [];
  const computeServerAssociations = useMemo(() => {
    return webapp_client.project_client.computeServers(project_id);
  }, [project_id]);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const handleChange = async () => {
      try {
        let p = getPath(path);
        if (p == null) {
          // have to wait for terminal state to be initialized, which
          // happens in next render loop:
          await delay(1);
          p = getPath(path);
          if (p == null) {
            // still nothing -- that's weird
            return;
          }
        }
        const id = await computeServerAssociations.getServerIdForPath(p);
        setValue(id == null ? null : `${id}`);
      } catch (err) {
        console.warn(err);
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
  }, [project_id, path, type]);

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
      const { color, title, state, configuration } = server;
      const { icon } = STATE_INFO[state ?? "off"] ?? {};
      const label = (
        <div
          style={{
            backgroundColor: color,
            color: avatar_fontcolor(color),
            overflow: "hidden",
            padding: "0 5px",
          }}
        >
          <div style={{ width: "100%", display: "flex" }}>
            {icon && (
              <Tooltip title={capitalize(state)}>
                <div>
                  <Icon name={icon} style={{ marginRight: "5px" }} />
                </div>
              </Tooltip>
            )}
            <div style={{ textOverflow: "ellipsis", overflow: "hidden" }}>
              {title}
            </div>
            <div style={{ flex: 1, minWidth: "5px" }} />
            <div>Id: {id}</div>
          </div>
          <div style={{ marginLeft: "20px" }}>
            <DisplayImage configuration={configuration} />
          </div>
        </div>
      );
      options.push({ value: id, sort: title.toLowerCase(), state, label });
    }
    const running = options
      .filter((a) => a.state == "running")
      .sort((a, b) => cmp(a.sort, b.sort));
    const stopped = options
      .filter(
        (a) =>
          a.state == "stopped" ||
          a.state == "stopping" ||
          a.state == "suspending" ||
          a.state == "suspended",
      )
      .sort((a, b) => cmp(a.sort, b.sort));
    const deprovisioned = options
      .filter((a) => a.state == "deprovisioned")
      .sort((a, b) => cmp(a.sort, b.sort));
    return [
      {
        label: <div style={{ fontSize: "12pt" }}>The Project</div>,
        options: [
          {
            value: "0",
            sort: "project",
            state: "",
            label: (
              <div>
                <Icon name="edit" />{" "}
                {value
                  ? "Run in the Project"
                  : "Currently Running in this Project"}
              </div>
            ),
          },
        ],
      },
      {
        label: (
          <div style={{ fontSize: "12pt" }}>
            Running Compute Servers {running.length == 0 ? "(none)" : ""}
          </div>
        ),
        options: running,
      },
      {
        label: (
          <div style={{ fontSize: "12pt" }}>
            Stopped Compute Servers {stopped.length == 0 ? "(none)" : ""}
          </div>
        ),
        options: stopped,
      },
      {
        label: (
          <div style={{ fontSize: "12pt" }}>
            Deprovisioned Compute Servers{" "}
            {deprovisioned.length == 0 ? "(none)" : ""}
          </div>
        ),
        options: deprovisioned,
      },
    ];
  }, [computeServers]);

  return (
    <>
      <Select
        allowClear
        bordered={false}
        disabled={loading}
        placeholder={
          <span style={{ color: "white" }}>
            <Icon style={{ color: "white", marginRight: "5px" }} name="edit" />{" "}
            Server
          </span>
        }
        open={open}
        onSelect={(id) => {
          setIdNum(Number(id ?? "0"));
          setConfirmSwitch(true);
        }}
        onClear={() => {
          setValue(null);
          computeServerAssociations.disconnectComputeServer({
            path: getPath(path),
          });
        }}
        value={value}
        onDropdownVisibleChange={setOpen}
        style={{
          ...style,
          width: open ? "300px" : value ? "175px" : "110px",
          background: value ? computeServers[value]?.color : "#4096ff",
        }}
        options={options}
      />
      <Modal
        maskStyle={{ background: computeServers[idNum]?.color, opacity: 0.5 }}
        title={
          idNum == 0 ? (
            <>Run in this Project?</>
          ) : (
            <>Run on the compute server "{computeServers[idNum]?.title}"?</>
          )
        }
        open={confirmSwitch}
        onCancel={() => setConfirmSwitch(false)}
        onOk={() => {
          setConfirmSwitch(false);
          if (idNum) {
            setValue(`${idNum}`);
            computeServerAssociations.connectComputeServerToPath({
              id: idNum,
              path: getPath(path),
            });
          } else {
            setValue(null);
            computeServerAssociations.disconnectComputeServer({
              path: getPath(path),
            });
          }
        }}
      >
        {idNum == 0 ? (
          <div>
            Do you want to run this in the project? Variables and other state
            will be lost.
          </div>
        ) : (
          <div>
            Do you want to run this on the compute server "
            {computeServers[idNum]?.title}"? Variables and other state will be
            lost.
          </div>
        )}
      </Modal>
    </>
  );
}
