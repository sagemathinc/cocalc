/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { React, CSS } from "../../app-framework";
import { Descriptions, Progress } from "antd";
import { Tip, TimeElapsed } from "../../r_misc";
import { CGroupInfo, DUState } from "./types";
import { warning_color } from "./utils";

export const CodeWhite: React.FC = ({ children }) => (
  <code style={{ color: "white" }}>{children}</code>
);

const CGroupTip: React.FC<{
  children;
  cg_info: CGroupInfo;
  disk_usage: DUState;
  type: "mem" | "disk" | "cpu";
}> = ({ children, type, cg_info, disk_usage }) => {
  function render_text(): JSX.Element {
    switch (type) {
      case "mem":
        return (
          <span>
            Current memory usage of the project's container:{" "}
            <CodeWhite>{cg_info.mem_rss.toFixed(0)}MiB</CodeWhite> of a maximum
            of <CodeWhite>{cg_info.mem_tot.toFixed(0)}MiB</CodeWhite>. This
            might diverge from the processes individual usages and this value
            also includes the in-memory <CodeWhite>/tmp</CodeWhite> directory.
            The remaining free memory is usually shared with other projects and
            hence you might not be able to attain it.
          </span>
        );
      case "disk":
        return (
          <span>
            Currently, the files stored in this project use{" "}
            <CodeWhite>{disk_usage.usage.toFixed(0)}MiB</CodeWhite> of a maximum
            of <CodeWhite>{disk_usage.total.toFixed(0)}MiB</CodeWhite>. Please
            be aware that a project will not work properly if that limit is
            reached.
          </span>
        );
      case "cpu":
        return (
          <span>
            This shows your current CPU usage. Right now, this project is using{" "}
            <CodeWhite>{cg_info.cpu_usage_rate.toFixed(2)}secs</CodeWhite> CPU
            time per second with a limit of{" "}
            <CodeWhite>{cg_info.cpu_usage_limit.toFixed(2)}secs</CodeWhite>.
            Since this project shares the CPU power of the underlying node with
            other projects, you might not be able to fully attain the limit.
          </span>
        );
    }
  }
  return (
    <Tip placement={"bottom"} title={render_text()}>
      {children}
    </Tip>
  );
};

export const CGroupFC: React.FC<{
  info;
  cg_info: CGroupInfo;
  disk_usage: DUState;
  pt_stats;
  start_ts;
}> = ({ info, cg_info, disk_usage, pt_stats, start_ts }) => {
  if (info?.cgroup == null) return null;
  const format = (val) => `${val.toFixed(0)}%`;
  const row1: CSS = { fontWeight: "bold", fontSize: "110%" };
  return (
    <Descriptions bordered={true} column={3} size={"middle"}>
      <Descriptions.Item label="Processes">
        <span style={row1}>{pt_stats.nprocs}</span>
      </Descriptions.Item>
      <Descriptions.Item label="Threads">
        <span style={row1}>{pt_stats.threads}</span>
      </Descriptions.Item>
      <Descriptions.Item label="Uptime">
        <span style={row1}>
          {start_ts != null ? <TimeElapsed start_ts={start_ts} /> : "?"}
        </span>{" "}
      </Descriptions.Item>

      <Descriptions.Item label="Memory">
        <CGroupTip type={"mem"} cg_info={cg_info} disk_usage={disk_usage}>
          <Progress
            steps={20}
            percent={cg_info.mem_pct}
            strokeColor={warning_color(cg_info.mem_pct)}
            format={format}
          />
        </CGroupTip>
      </Descriptions.Item>
      <Descriptions.Item label="CPU">
        <CGroupTip type={"cpu"} cg_info={cg_info} disk_usage={disk_usage}>
          <Progress
            steps={20}
            percent={cg_info.cpu_pct}
            strokeColor={warning_color(cg_info.cpu_pct)}
            format={format}
          />
        </CGroupTip>
      </Descriptions.Item>
      <Descriptions.Item label="Disk">
        <CGroupTip type={"disk"} cg_info={cg_info} disk_usage={disk_usage}>
          <Progress
            steps={20}
            percent={disk_usage.pct}
            strokeColor={warning_color(disk_usage.pct)}
            format={format}
          />
        </CGroupTip>
      </Descriptions.Item>
    </Descriptions>
  );
};
