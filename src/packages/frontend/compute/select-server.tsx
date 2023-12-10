/*
Dropdown on frame title bar for running that Jupyter notebook or terminal on a compute server.
*/

import type { CSSProperties, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { Select, Tooltip } from "antd";
import { useTypedRedux, redux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { capitalize } from "@cocalc/util/misc";
import { DisplayImage } from "./select-image";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

export const PROJECT_COLOR = "#f6ffed";

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
  value: number | undefined;
  setValue: (number) => void;
  disabled?: boolean;
  size?;
  style?: CSSProperties;
}

export default function SelectServer({
  project_id,
  value,
  setValue,
  disabled,
  size,
  style,
}: Props) {
  const account_id = useTypedRedux("account", "account_id");

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
          {value != Number(id) && (
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
        label: <div style={{ fontSize: "12pt" }}>The Project</div>,
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
                {value != 0 ? (
                  <div>
                    <div>
                      <Icon name="edit" /> Project
                    </div>
                    <div style={{ marginLeft: "15px" }}>
                      <Icon name="users" /> Default shared resources
                    </div>
                  </div>
                ) : (
                  <div>
                    <Icon name="edit" /> Project
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
    if (v.length == 1) {
      // only option is the project
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
                  const actions = redux.getProjectActions(project_id);
                  if (actions != null) {
                    actions.setState({ create_compute_server: true });
                    actions.set_active_tab("servers", {
                      change_history: true,
                    });
                  }
                }}
              >
                <Icon name="plus-circle" /> New Compute Server...
              </div>
            ),
          },
        ],
      });
    }

    return v;
  }, [computeServers]);

  return (
    <Select
      disabled={disabled}
      allowClear
      size={size}
      bordered={false}
      placeholder={
        <span style={{ color: "#666" }}>
          <Icon style={{ marginRight: "5px", color: "#666" }} name="servers" />{" "}
          Server...
        </span>
      }
      open={open}
      onSelect={(id) => {
        if (id == "create") return;
        setValue(Number(id ?? "0"));
      }}
      onClear={() => {
        setValue(undefined);
      }}
      value={value != null ? `${value}` : undefined}
      onDropdownVisibleChange={setOpen}
      style={{
        width: getWidth(open, value, size),
        ...style,
      }}
      options={options}
    />
  );
}

function getWidth(open, value, size) {
  if (size == "small") {
    return open ? "250px" : value ? "130px" : "120px";
  } else {
    return open ? "300px" : value ? "175px" : "120px";
  }
}
