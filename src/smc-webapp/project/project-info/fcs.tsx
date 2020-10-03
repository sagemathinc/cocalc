/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { React, CSS, useWindowDimensions } from "../../app-framework";
import { Descriptions, Progress, Button } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import { Tip, TimeElapsed, Icon } from "../../r_misc";
import { CGroupInfo, DUState } from "./types";
import { warning_color, filename } from "./utils";

export const CodeWhite: React.FC = ({ children }) => (
  <code style={{ color: "white" }}>{children}</code>
);

export const LabelQuestionmark: React.FC<{ text: string; style?: CSS }> = ({
  text,
  style,
}) => {
  const s: CSS = { ...style, ...{ whiteSpace: "nowrap" } };
  return (
    <span style={s}>
      {text} <QuestionCircleOutlined />
    </span>
  );
};

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
            The remaining free memory is usually shared with other projects on
            the underlying machine and hence you might not be able to fully
            attain it.
          </span>
        );
      case "disk":
        return (
          <span>
            Currently, the files stored in this project use{" "}
            <CodeWhite>{disk_usage.usage.toFixed(0)}MiB</CodeWhite> of a maximum
            of <CodeWhite>{disk_usage.total.toFixed(0)}MiB</CodeWhite>. Please
            be aware that a project might not work properly if that limit is
            reached.
          </span>
        );
      case "cpu":
        return (
          <span>
            This shows your current CPU usage. Right now, this project is using{" "}
            <CodeWhite>{cg_info.cpu_usage_rate.toFixed(2)}secs</CodeWhite> CPU
            time per second with a limit of{" "}
            <CodeWhite>{cg_info.cpu_usage_limit.toFixed(2)}secs/s</CodeWhite>.
            Since this project shares the CPU power of the underlying machine
            with other projects, you might not be able to fully attain the
            limit.
          </span>
        );
    }
  }
  return (
    <Tip
      placement={"bottom"}
      title={render_text()}
      trigger={["hover", "click"]}
    >
      {children}
    </Tip>
  );
};

const format = (val) => `${val.toFixed(0)}%`;
const prog_small = { format, size: "small" as "small" } as const;
const prog_medium = { format } as const;
const prog_large = { format, steps: 20 } as const;

function useProgressProps() {
  const [props, set_props] = React.useState<any>({});
  const { width } = useWindowDimensions();
  function set(prop) {
    if (prop != props) set_props(prop);
  }

  if (width > 1400) {
    set(prog_large);
  } else if (width > 1000) {
    set(prog_medium);
  } else {
    set(prog_small);
  }
  return props;
}

export const CGroupFC: React.FC<{
  info;
  cg_info: CGroupInfo;
  disk_usage: DUState;
  pt_stats;
  start_ts;
}> = ({ info, cg_info, disk_usage, pt_stats, start_ts }) => {
  const progprops = useProgressProps();
  if (info?.cgroup == null) return null;
  const row1: CSS = { fontWeight: "bold", fontSize: "110%" };
  const cpu_label = (
    <CGroupTip type={"cpu"} cg_info={cg_info} disk_usage={disk_usage}>
      <LabelQuestionmark text={"CPU"} />
    </CGroupTip>
  );
  const memory_label = (
    <CGroupTip type={"mem"} cg_info={cg_info} disk_usage={disk_usage}>
      <LabelQuestionmark text={"Memory"} />
    </CGroupTip>
  );
  const disk_label = (
    <CGroupTip type={"disk"} cg_info={cg_info} disk_usage={disk_usage}>
      <LabelQuestionmark text={"Disk"} />
    </CGroupTip>
  );
  return (
    <Descriptions bordered={true} column={3} size={"middle"}>
      <Descriptions.Item label={"Processes"}>
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

      <Descriptions.Item label={memory_label}>
        <CGroupTip type={"mem"} cg_info={cg_info} disk_usage={disk_usage}>
          <Progress
            percent={cg_info.mem_pct}
            strokeColor={warning_color(cg_info.mem_pct)}
            {...progprops}
          />
        </CGroupTip>
      </Descriptions.Item>
      <Descriptions.Item label={cpu_label}>
        <CGroupTip type={"cpu"} cg_info={cg_info} disk_usage={disk_usage}>
          <Progress
            percent={cg_info.cpu_pct}
            strokeColor={warning_color(cg_info.cpu_pct)}
            {...progprops}
          />
        </CGroupTip>
      </Descriptions.Item>
      <Descriptions.Item label={disk_label}>
        <CGroupTip type={"disk"} cg_info={cg_info} disk_usage={disk_usage}>
          <Progress
            percent={disk_usage.pct}
            strokeColor={warning_color(disk_usage.pct)}
            {...progprops}
          />
        </CGroupTip>
      </Descriptions.Item>
    </Descriptions>
  );
};

interface CoCalcFileProps {
  icon: string;
  path: string;
  project_actions;
}

export const CoCalcFile: React.FC<CoCalcFileProps> = (
  props: CoCalcFileProps
) => {
  const { icon, path, project_actions } = props;
  return (
    <Button
      shape="round"
      icon={<Icon name={icon} />}
      onClick={() =>
        project_actions?.open_file({
          path: path,
          foreground: true,
        })
      }
    >
      <Tip
        title={
          <span>
            Click to open <CodeWhite>{path}</CodeWhite>
          </span>
        }
        style={{ paddingLeft: "1rem" }}
      >
        {filename(path)}
      </Tip>
    </Button>
  );
};
