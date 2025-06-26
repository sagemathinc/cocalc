/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Show the last latex build log, i.e., output from last time we ran the LaTeX build process.
*/

import Ansi from "@cocalc/frontend/components/ansi-to-react";
import { Button, Flex, Tooltip } from "antd";
import { Fragment, useState } from "react";

import { AntdTabItem, Tab, Tabs } from "@cocalc/frontend/antd-bootstrap";
import { CSS, React, Rendered, useRedux } from "@cocalc/frontend/app-framework";
import { Icon, r_join } from "@cocalc/frontend/components";
import Stopwatch from "@cocalc/frontend/editors/stopwatch/stopwatch";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split, tail, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import {
  ExecuteCodeOutput,
  ExecuteCodeOutputAsync,
} from "@cocalc/util/types/execute-code";
import { Actions } from "./actions";
import { BuildCommand } from "./build-command";
import { use_build_logs } from "./hooks";
import { BUILD_SPECS, BuildLog, BuildLogs, BuildSpecName } from "./types";

// after that many seconds, warn visibly about a long running task and e.g. highlight the stop button
const WARN_LONG_RUNNING_S = 15;

interface Props {
  name: string;
  actions: Actions;
  path: string;
  font_size: number;
  status: string;
}

export const Build: React.FC<Props> = React.memo((props) => {
  const { name, actions, path, font_size: font_size_orig, status } = props;

  const font_size = 0.8 * font_size_orig;
  const build_logs: BuildLogs = use_build_logs(name);
  //const job_infos: JobInfos = use_job_infos(name);
  const build_command = useRedux([name, "build_command"]);
  const build_command_hardcoded =
    useRedux([name, "build_command_hardcoded"]) ?? false;
  const knitr: boolean = useRedux([name, "knitr"]);
  const [active_tab, set_active_tab] = useState<string>(
    BUILD_SPECS.latex.label,
  );
  const [error_tab, set_error_tab] = useState<string | null>(null);

  let no_errors = true;

  const logStyle: CSS = {
    fontFamily: "monospace",
    whiteSpace: "pre-line",
    color: COLORS.GRAY_D,
    background: COLORS.GRAY_LLL,
    width: "100%",
    padding: "5px",
    fontSize: `${font_size}px`,
    overflowY: "auto",
    margin: "0",
  } as const;

  function render_tab_item(
    title: string,
    value: string,
    error?: boolean,
    job_info_str?: string,
  ): AntdTabItem {
    const err_style = error ? { background: COLORS.ATND_BG_RED_L } : undefined;
    const tab_button = <div style={err_style}>{title}</div>;
    return Tab({
      key: title,
      eventKey: title,
      title: tab_button,
      style: { ...logStyle, display: active_tab === title ? "block" : "none" },
      children: (
        <>
          {job_info_str ? (
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "10px",
                borderBottom: "1px solid black",
              }}
            >
              {job_info_str}
            </div>
          ) : undefined}
          <Ansi>{value}</Ansi>
        </>
      ),
    });
  }

  function getResourceUsage(
    stats: ExecuteCodeOutputAsync["stats"] | undefined,
    type: "peak" | "last",
  ): string {
    if (!Array.isArray(stats) || stats.length === 0) {
      return "";
    }

    switch (type) {
      // This is after the job finished. We return the CPU time used and max memory.
      case "peak": {
        const max_mem = stats.reduce((cur, val) => {
          return val.mem_rss > cur ? val.mem_rss : cur;
        }, 0);
        // if there is no data (too many processes, etc.) then it is 0.
        //  That information is misleading and we ignore it
        if (max_mem > 0) {
          return ` Peak memory usage: ${max_mem.toFixed(0)} MB.`;
        }
        break;
      }

      // This is while the log updates come in: last known CPU in % and memory usage.
      case "last": {
        const { mem_rss, cpu_pct } = stats.slice(-1)[0];
        if (mem_rss > 0 || cpu_pct > 0) {
          return ` Resource usage: ${mem_rss.toFixed(
            0,
          )} MB memory and ${cpu_pct.toFixed(0)}% CPU.`;
        }
        break;
      }
      default:
        unreachable(type);
    }
    return "";
  }

  function render_log(stage: BuildSpecName): AntdTabItem | undefined {
    if (build_logs == null) return;
    const x: BuildLog | undefined = build_logs.get(stage)?.toJS();
    // const y: ExecOutput | undefined = job_infos.get(stage)?.toJS();

    if (!x) return;
    const value = x.stdout ?? "" + x.stderr ?? "";
    if (!value) return;
    // const time: number | undefined = x.get("time");
    // const time_str = time ? `(${(time / 1000).toFixed(1)} seconds)` : "";
    let job_info_str = "";
    // if (y != null && y.type === "async") {
    if (x.type === "async") {
      const { elapsed_s, stats } = x; // y
      if (typeof elapsed_s === "number" && elapsed_s > 0) {
        job_info_str = `Build time: ${elapsed_s.toFixed(1)} seconds.`;
      }
      job_info_str += getResourceUsage(stats, "peak");
    }
    const title = BUILD_SPECS[stage].label;
    // highlights tab, if there is at least one parsed error
    const error =
      ((build_logs.getIn([stage, "parse", "errors"]) as any)?.size ?? 0) > 0;
    // also show the problematic log to the user
    if (error) {
      no_errors = false;
      if (error_tab == null) {
        set_active_tab(title);
        set_error_tab(title);
      }
    }
    return render_tab_item(title, value, error, job_info_str);
  }

  function render_clean(): AntdTabItem | undefined {
    const value = build_logs?.getIn(["clean", "output"]) as any;
    if (!value) return;
    const title = "Clean Auxiliary Files";
    return render_tab_item(title, value);
  }

  function render_logs(): Rendered {
    if (status) return;

    const items: AntdTabItem[] = [];

    let log: BuildSpecName;
    for (log in BUILD_SPECS) {
      if (log === "clean" || log === "build") continue; // skip these
      const item = render_log(log);
      if (item) items.push(item);
    }
    const clean = render_clean();
    if (clean) items.push(clean);

    // check if active_tab is in the list of items.key
    if (items.length > 0) {
      if (!items.some((item) => item.key === active_tab)) {
        set_active_tab(items[0].key);
      }
    }

    return (
      <Tabs
        activeKey={active_tab}
        onSelect={set_active_tab}
        tabPosition={"left"}
        size={"small"}
        style={{ height: "100%", overflowY: "hidden" }}
        items={items}
      />
    );
  }

  function render_build_command(): Rendered {
    return (
      <BuildCommand
        font_size={font_size}
        filename={path_split(path).tail}
        actions={actions}
        build_command={build_command}
        knitr={knitr}
        build_command_hardcoded={build_command_hardcoded}
      />
    );
  }

  // usually, one job is running at a time
  function render_jobs(): Rendered {
    if (!build_logs) return;
    const infos: React.JSX.Element[] = [];
    let isLongRunning = false;
    let logTail = "";
    build_logs.forEach((infoI, key) => {
      const info: ExecuteCodeOutput = infoI?.toJS();
      if (!info || info.type !== "async" || info.status !== "running") return;
      const stats_str = getResourceUsage(info.stats, "last");
      const start = info.start;
      logTail = tail(info.stdout ?? "" + info.stderr ?? "", 6);
      isLongRunning ||=
        typeof start === "number" &&
        webapp_client.server_time() - start > WARN_LONG_RUNNING_S * 1000;
      const { label } = BUILD_SPECS[key];
      infos.push(
        <Fragment key={key}>
          {label}{" "}
          {start != null ? (
            <Stopwatch
              compact
              state="running"
              time={start}
              noLabel
              noDelete
              noButtons
            />
          ) : undefined}{" "}
          {stats_str}
        </Fragment>,
      );
    });

    if (infos.length === 0) return;

    return (
      <>
        <div
          style={{
            margin: "10px",
            justifyContent: "center",
            alignItems: "center",
            display: "flex",
            gap: "5px",
          }}
        >
          <Flex flex={1} style={{ gap: "5px" }}>
            Active: {r_join(infos)}...
          </Flex>
          <Flex flex={0}>
            <Tooltip title={"Stop building the document."}>
              <Button
                size="small"
                onClick={() => actions.stop_build()}
                icon={<Icon name={"stop"} />}
                type={isLongRunning ? "primary" : undefined}
              >
                Stop
              </Button>
            </Tooltip>
          </Flex>
        </div>
        <div style={logStyle}>
          <div
            style={{
              fontWeight: "bold",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {status}
            {"\n"}
          </div>
          {logTail}
        </div>
      </>
    );
  }

  // if all errors are fixed, clear the state remembering we had an active error tab
  const logs = render_logs();
  if (no_errors && error_tab != null) set_error_tab(null);

  return (
    <div
      className={"smc-vfill cocalc-latex-build-content"}
      style={{
        overflow: "hidden",
        padding: "5px 0 0 5px",
        fontSize: `${font_size}px`,
      }}
    >
      {render_build_command()}
      {render_jobs()}
      {logs}
    </div>
  );
});
