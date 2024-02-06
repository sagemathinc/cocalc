/*
Dropdown on frame title bar for running that Jupyter notebook or terminal on a compute server.
*/

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Select, Spin, Tooltip } from "antd";
import { useTypedRedux, redux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { Icon, VisibleMDLG } from "@cocalc/frontend/components";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { capitalize } from "@cocalc/util/misc";
import { DisplayImage } from "./select-image";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

export const PROJECT_COLOR = "#f4f5c4";

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
  noLabel?: boolean;
}

export default function SelectServer({
  project_id,
  value: value0,
  setValue: setValue0,
  disabled,
  size,
  style,
  noLabel,
}: Props) {
  const account_id = useTypedRedux("account", "account_id");
  const [value, setValue1] = useState<number | null | undefined>(
    value0 == 0 ? null : value0,
  );
  const setValue = (value) => {
    setValue0(value ?? 0);
    setValue1(value);
  };
  useEffect(() => {
    if (value0 != null) {
      setValue1(value0);
    }
  }, [value0]);

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

  const computeServers = useTypedRedux(
    { project_id },
    "compute_servers",
  )?.toJS();

  const options = useMemo(() => {
    if (computeServers == null) return [];
    const options: Option[] = [];
    for (const id in computeServers) {
      const server = computeServers[id];
      if (server.deleted) continue;
      const { color, title, state, configuration, position, account_id } =
        server;
      const { icon } = STATE_INFO[state ?? "off"] ?? {};
      let body;
      if (open) {
        body = (
          <div style={{ display: "flex" }}>
            <div
              style={{
                textOverflow: "ellipsis",
                overflow: "hidden",
              }}
            >
              {title}
            </div>
            <div style={{ flex: 1, minWidth: "5px" }} />
            <div>Id: {id}</div>
          </div>
        );
      } else if (!noLabel) {
        body = (
          <div
            style={{
              textOverflow: "ellipsis",
              overflow: "hidden",
              display: "flex",
            }}
          >
            <VisibleMDLG>
              {title}
              <div style={{ flex: 1, minWidth: "5px" }} />
              <div>Id: {id}</div>
            </VisibleMDLG>
          </div>
        );
      } else {
        body = <div>Id: {id}</div>;
      }
      const label = (
        <div
          style={{
            backgroundColor: value != Number(id) ? color : undefined,
            color: avatar_fontcolor(color),
            overflow: "hidden",
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
            {body}
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
                  color: avatar_fontcolor(PROJECT_COLOR),
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

  if (computeServers == null) {
    return <Spin delay={1000} />;
  }

  return (
    <Tooltip title="Compute server where this runs">
      <Select
        disabled={disabled}
        allowClear
        size={size}
        bordered={false}
        placeholder={
          <span style={{ color: "#333" }}>
            <Icon name="server" style={{ fontSize: "13pt" }} />{" "}
            {!noLabel || open ? <VisibleMDLG>Server</VisibleMDLG> : undefined}
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
        value={value == "0" || value == null ? null : `${value}`}
        onDropdownVisibleChange={setOpen}
        style={{
          width: getWidth(open, value, size),
          background: computeServers[value ?? ""]?.color ?? PROJECT_COLOR,
          ...style,
        }}
        options={options}
        suffixIcon={null}
      />
    </Tooltip>
  );
}

function getWidth(open, value, size) {
  if (!open && (value == "0" || !value)) {
    return undefined;
  }
  if (open) {
    return "300px";
  }
  return "120px";
}
