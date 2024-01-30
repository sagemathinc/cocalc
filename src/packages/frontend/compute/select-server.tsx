/*
Dropdown on frame title bar for running that Jupyter notebook or terminal on a compute server.
*/

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Select, Tooltip } from "antd";
import { useTypedRedux, redux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { cmp } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { capitalize } from "@cocalc/util/misc";
import { DisplayImage } from "./select-image";
import { delay } from "awaiting";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

const PROJECT_COLOR = "#f4f5c4";

interface Option {
  position?: number;
  value: string;
  sort: string;
  label: ReactNode;
  state: string;
  account_id?: string;
}

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
  const account_id = useTypedRedux("account", "account_id");
  const getPath = (path) => {
    if (actions != null && type == "terminal") {
      return actions.terminals.get(frame_id)?.term_path;
    }
    return path;
  };
  const [confirmSwitch, setConfirmSwitch] = useState<boolean>(false);
  const [idNum, setIdNum] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // see https://github.com/sagemathinc/cocalc/issues/7083 and https://github.com/sagemathinc/cocalc/pull/7086
  // The component doesn't mount/remount, and the problem is
  // not solved by moving open state elsewhere.  Instead, we just
  // use a hack and don't close it within a half second of opening
  // it; there is something funny with focus going on
  // that breaks this select, and this works around it. I don't think this is
  // a great solution, but it is easy to understand, self contained, and unlikely
  // to cause great harm.
  const lastOpenRef = useRef<number>(0);
  const [open, setOpen0] = useState<boolean>(false);
  const setOpen = (open) => {
    const now = Date.now();
    if (now - lastOpenRef.current < 500) {
      return;
    }
    lastOpenRef.current = now;
    setOpen0(open);
  };

  const computeServers =
    useTypedRedux({ project_id }, "compute_servers")?.toJS() ?? [];
  const computeServerAssociations = useMemo(() => {
    return webapp_client.project_client.computeServers(project_id);
  }, [project_id]);
  const [value, setValue] = useState<string | null>(null);

  const okButtonRef = useRef();
  useEffect(() => {
    if (confirmSwitch && okButtonRef.current) {
      // @ts-ignore
      setTimeout(() => okButtonRef.current.focus(), 1);
    }
  }, [confirmSwitch]);

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
        if (type == "jupyter_cell_notebook" && actions != null) {
          actions.jupyter_actions.setState({ requestedComputeServerId: id });
          if (
            actions.jupyter_actions.store?.get("kernel_error") &&
            id != actions.jupyter_actions.getComputeServerId()
          ) {
            // show a warning about the kernel being killed isn't useful and
            // is just redundant when actively switching.
            actions.jupyter_actions.setState({ kernel_error: "" });
          }
        } else if (type == "terminal") {
          const terminalRequestedComputeServerIds =
            actions.store.get("terminalRequestedComputeServerIds")?.toJS() ??
            {};
          terminalRequestedComputeServerIds[p] = id;
          actions.setState({ terminalRequestedComputeServerIds });
        }
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
    const options: Option[] = [];
    for (const id in computeServers) {
      const server = computeServers[id];
      if (server.deleted) continue;
      const { color, title, state, configuration, position, account_id } =
        server;
      const { icon } = STATE_INFO[state ?? "off"] ?? {};
      const label = (
        <div
          style={{
            backgroundColor: color,
            color: avatar_fontcolor(color),
            overflow: "hidden",
            padding: "0 5px",
            borderRadius: "3px",
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
          {value != `${id}` && (
            <div style={{ marginLeft: "20px" }}>
              <DisplayImage configuration={configuration} />
            </div>
          )}
        </div>
      );
      options.push({
        value: id,
        sort: title?.toLowerCase() ?? "",
        state,
        label,
        position,
        account_id,
      });
    }
    const running: Option[] = [];
    const stopped: Option[] = [];
    const other: Option[] = [];
    options.sort((a, b) => -cmp(a.position ?? a.value, b.position ?? b.value));

    for (const x of options) {
      if (x.state == "running" || x.state == "starting") {
        running.push(x);
      } else if (x.state?.includes("stop") || x.state?.includes("suspend")) {
        if (account_id == x.account_id) {
          stopped.push(x);
        }
      } else {
        if (account_id == x.account_id) {
          other.push(x);
        }
      }
    }
    const v: { label: JSX.Element; options: Option[] }[] = [
      {
        label: (
          <div style={{ fontSize: "12pt" }}>
            <Icon name="servers" /> Where to run this{" "}
            {type == "terminal" ? "Terminal" : "Notebook"}
          </div>
        ),
        options: [
          {
            value: "0",
            sort: "project",
            state: "",
            label: (
              <div
                style={{
                  background: PROJECT_COLOR,
                  padding: "0 5px",
                  borderRadius: "3px",
                }}
              >
                {value ? (
                  <div>
                    <div>
                      <Icon name="edit" /> Run in this Project?
                    </div>
                    <div style={{ marginLeft: "15px" }}>(the default)</div>
                  </div>
                ) : (
                  <div>
                    <Icon name="edit" /> Currently Running in this Project
                  </div>
                )}
              </div>
            ),
          },
        ],
      },
    ];
    if (running.length > 0) {
      v.push({
        label: (
          <div style={{ fontSize: "12pt" }}>
            Active Compute Servers {running.length == 0 ? "(none)" : ""}
          </div>
        ),
        options: running,
      });
    }
    if (stopped.length > 0) {
      v.push({
        label: (
          <div style={{ fontSize: "12pt" }}>
            Stopped Compute Servers {stopped.length == 0 ? "(none)" : ""}
          </div>
        ),
        options: stopped,
      });
    }
    if (other.length > 0) {
      v.push({
        label: (
          <div style={{ fontSize: "12pt" }}>
            Other Compute Servers {other.length == 0 ? "(none)" : ""}
          </div>
        ),
        options: other,
      });
    }
    // always have an option to create a new compute server!
    v.push({
      label: <div style={{ fontSize: "12pt" }}>Create Compute Server</div>,
      options: [
        {
          value: "create",
          sort: "create",
          state: "",
          label: (
            <div
              onClick={() => {
                redux.getProjectActions(project_id)?.set_active_tab("servers");
              }}
            >
              <Icon name="plus-circle" /> New Compute Server...
            </div>
          ),
        },
      ],
    });

    return v;
  }, [computeServers]);
  let width;
  if (open) {
    width = "300px";
  } else {
    if (value == "0" || !value) {
      width = undefined;
    } else {
      width = "120px";
    }
  }

  return (
    <Tooltip title="Compute server where this runs">
      <Select
        allowClear
        bordered={false}
        disabled={loading}
        placeholder={
          <>
            <Icon name="servers" /> {open ? "Compute Servers..." : undefined}
          </>
        }
        open={open}
        onSelect={(id) => {
          if (id == "create") return;
          setIdNum(Number(id ?? "0"));
          setConfirmSwitch(true);
        }}
        onClear={() => {
          setIdNum(0);
          setConfirmSwitch(true);
        }}
        suffixIcon={null}
        value={value == "0" || value == null ? null : value}
        onDropdownVisibleChange={setOpen}
        style={{
          ...style,
          borderRight: "1px solid #ccc",
          width,
          background: computeServers[value ?? ""]?.color ?? PROJECT_COLOR,
        }}
        options={options}
      />
      <Modal
        keyboard
        title={
          idNum == 0 ? (
            <>Run in this Project</>
          ) : (
            <>Run on the compute server "{computeServers[idNum]?.title}"?</>
          )
        }
        open={confirmSwitch}
        onCancel={() => setConfirmSwitch(false)}
        okText={
          idNum == 0
            ? "Run in Project"
            : `Run on ${computeServers[idNum]?.title}`
        }
        okButtonProps={{
          // @ts-ignore
          ref: okButtonRef,
          style: computeServers[idNum]
            ? {
                background: computeServers[idNum].color,
                color: avatar_fontcolor(computeServers[idNum].color),
              }
            : undefined,
        }}
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
    </Tooltip>
  );
}
