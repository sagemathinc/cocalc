/*
Dropdown on frame title bar for running that on a compute server.
*/

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Select, Spin, Tooltip } from "antd";
import { useTypedRedux, redux } from "@cocalc/frontend/app-framework";
import { cmp } from "@cocalc/util/misc";
import { Icon, isIconName, VisibleMDLG } from "@cocalc/frontend/components";
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
  setValue?: (number) => void;
  disabled?: boolean;
  size?;
  style?: CSSProperties;
  noLabel?: boolean;
  fullLabel?: boolean;
  title?: ReactNode;
}

export default function SelectServer({
  project_id,
  value: value0,
  setValue: setValue0,
  disabled,
  size,
  style,
  noLabel,
  fullLabel,
  title,
}: Props) {
  const account_id = useTypedRedux("account", "account_id");
  const [value, setValue1] = useState<number | null | undefined>(
    value0 == 0 ? null : value0,
  );
  const setValue = (value) => {
    setValue0?.(value ?? 0);
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
      const {
        color,
        title,
        state,
        configuration,
        position,
        account_id,
        project_specific_id,
      } = server;
      const { icon } = STATE_INFO[state ?? "off"] ?? {};
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
            {icon && isIconName(icon) && (
              <Tooltip title={capitalize(state)}>
                <div>
                  <Icon name={icon} style={{ marginRight: "5px" }} />
                </div>
              </Tooltip>
            )}
            {(open || !noLabel) && (
              <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {title}
              </div>
            )}
            {(open || !noLabel) && <div style={{ flex: 1, minWidth: "5px" }} />}
            <div style={{ marginRight: "15px" }}>Id: {project_specific_id}</div>
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
    const v: { label: React.JSX.Element; options: Option[] }[] = [
      {
        label: <div style={{ fontSize: "12pt" }}>Default</div>,
        options: [
          {
            value: "0",
            sort: "project",
            state: "",
            label: (
              <Tooltip
                mouseEnterDelay={1}
                title="The Home Base is the core of your project; it contains your primary files and has limited compute resources to work with them. You can upgrade it using a license.  For GPUs, high end CPUs, and root access use a compute server."
                placement="right"
              >
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
                        <Icon name="edit" /> Home Base
                      </div>
                      <div style={{ marginLeft: "15px" }}>
                        <Icon name="users" /> Standard image
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: "5px 15px" }}>
                      <Icon name="edit" /> Home Base
                    </div>
                  )}
                </div>
              </Tooltip>
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
                redux
                  .getProjectActions(project_id)
                  ?.createComputeServerDialog();
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

  if (computeServers == null) {
    return <Spin delay={1000} />;
  }

  const background = computeServers[value ?? ""]?.color ?? PROJECT_COLOR;

  return (
    <Tooltip
      mouseEnterDelay={0.9}
      title={
        title ??
        `This is open ${
          !value ? "in your home base" : `on compute server ${value}`
        }.`
      }
    >
      <Select
        disabled={disabled}
        allowClear
        size={size}
        variant={"borderless"}
        placeholder={
          <span style={{ color: avatar_fontcolor(background) }}>
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
        value={
          !(fullLabel || open) || value == 0 || value == null
            ? null
            : `${value}`
        }
        onDropdownVisibleChange={setOpen}
        style={{
          width: open ? "300px" : undefined,
          background,
          color: avatar_fontcolor(background),
          ...style,
        }}
        options={options}
        suffixIcon={null}
      />
    </Tooltip>
  );
}
