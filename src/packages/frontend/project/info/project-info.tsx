/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare let DEBUG;

import { Alert } from "antd";
import {
  React,
  Rendered,
  redux,
  useActions,
  useIsMountedRef,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ProjectInfo as WSProjectInfo } from "@cocalc/frontend/project/websocket/project-info";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  Process,
  ProjectInfo as ProjectInfoType,
} from "@cocalc/util/types/project-info/types";
import { cgroup_stats } from "@cocalc/comm/project-status/utils";
import { unreachable } from "@cocalc/util/misc";
import { CoCalcFile, render_cocalc_btn } from "./components";
import { Flyout } from "./flyout";
import { Full } from "./full";
import { CGroupInfo, DUState, PTStats, ProcessRow } from "./types";
import { grid_warning, linearList, process_tree, sum_children } from "./utils";

// DEV: DEBUG is true, add some generic static values about CGroups, such that these elements show up in the UI
const DEV = DEBUG
  ? {
      cgroup: {
        mem_stat: {
          hierarchical_memory_limit: 1000,
          total_rss: 550,
        },
        cpu_usage: 12, // seconds
        cpu_usage_rate: 0.8, // seconds / second
        oom_kills: 1,
        cpu_cores_limit: 1,
      } as ProjectInfoType["cgroup"],
    }
  : undefined;

interface Props {
  project_id: string;
  mode?: "flyout" | "full";
  wrap?: Function;
}

const gc_info_init: CGroupInfo = {
  mem_rss: NaN,
  mem_tot: NaN,
  cpu_pct: NaN, // 0 to 100
  mem_pct: NaN,
  cpu_usage_rate: NaN,
  cpu_usage_limit: NaN,
} as const;

const du_init: DUState = {
  pct: NaN, // 0 to 100
  usage: NaN,
  total: NaN,
} as const;

const pt_stats_init = {
  threads: 0,
  nprocs: 0,
  sum_cpu_time: 0,
  sum_cpu_pct: 0,
  sum_memory: 0,
} as const;

export const ProjectInfo: React.FC<Props> = React.memo(
  ({ mode = "full", wrap }: Props) => {
    const isMountedRef = useIsMountedRef();
    const { project_id } = useProjectContext();
    const project_actions = useActions({ project_id });
    const [idle_timeout, set_idle_timeout] = useState<number>(30 * 60);
    const show_explanation =
      useTypedRedux({ project_id }, "show_project_info_explanation") ?? false;
    // this is @cocalc/conn/project-status/types::ProjectStatus
    const project_status = useTypedRedux({ project_id }, "status");
    const project_map = useTypedRedux("projects", "project_map");
    const [project, set_project] = useState(project_map?.get(project_id));
    const [project_state, set_project_state] = useState<string | undefined>();
    const [start_ts, set_start_ts] = useState<number | undefined>(undefined);
    const [info, set_info] = useState<ProjectInfoType | undefined>(undefined);
    const [ptree, set_ptree] = useState<ProcessRow[] | undefined>(undefined);
    const [pt_stats, set_pt_stats] = useState<PTStats>(pt_stats_init);
    // sync-object sending us the real-time data about the project
    const [sync, set_sync] = useState<WSProjectInfo | null>(null);
    const syncRef = useRef<WSProjectInfo | null>(null);
    const [status, set_status] = useState<string>("initializing…");
    const [loading, set_loading] = useState<boolean>(true);
    const [disconnected, set_disconnected] = useState<boolean>(true);
    const [selected, set_selected] = useState<number[]>([]);
    const [expanded, set_expanded] = useState<React.ReactText[]>([]);
    const [have_children, set_have_children] = useState<string[]>([]);
    const [cg_info, set_cg_info] = useState<CGroupInfo>(gc_info_init);
    const [disk_usage, set_disk_usage] = useState<DUState>(du_init);
    const [error, set_error] = useState<JSX.Element | null>(null);
    const [modal, set_modal] = useState<string | Process | undefined>(
      undefined,
    );
    const [show_long_loading, set_show_long_loading] = useState(false);

    React.useMemo(() => {
      if (project_map == null) return;
      set_project(project_map.get(project_id));
    }, [project_map]);

    React.useEffect(() => {
      if (project == null) return;
      const next_start_ts = project.getIn(["status", "start_ts"]) as any;
      if (next_start_ts != start_ts) {
        set_start_ts(next_start_ts);
      }
      const next_state = project.getIn(["state", "state"]) as any;
      if (next_state != project_state) {
        set_project_state(next_state);
      }
    }, [project]);

    React.useEffect(() => {
      syncRef.current = sync;
    }, [sync]);

    React.useEffect(() => {
      set_disconnected(sync == null);
    }, [sync]);

    // used in render_not_loading_info()
    React.useEffect(() => {
      const timer = setTimeout(() => set_show_long_loading(true), 30000);
      return () => clearTimeout(timer);
    }, []);

    async function connect() {
      set_status("connecting…");
      try {
        // the synctable for the project info
        const info_sync = webapp_client.project_client.project_info(project_id);

        // this might fail if the project is not updated
        if (!isMountedRef.current) return;

        const update = () => {
          if (!isMountedRef.current) return;
          const data = info_sync.get();
          if (data != null) {
            set_info({ ...data.toJS(), ...DEV } as ProjectInfoType);
          }
        };

        info_sync.once("change", function () {
          if (!isMountedRef.current) return;
          set_loading(false);
          set_status("receiving…");
        });

        info_sync.on("change", update);
        info_sync.once("ready", update);

        set_sync(info_sync);
      } catch (err) {
        set_error(
          <>
            <strong>Project information setup problem:</strong> {`${err}`}
          </>,
        );
        return;
      }
    }

    // once when mounted
    function get_idle_timeout() {
      const ito = redux.getStore("projects").get_idle_timeout(project_id);
      set_idle_timeout(ito);
    }

    // each time the project state changes (including when mounted) we connect/reconnect
    React.useEffect(() => {
      if (project_state !== "running") return;
      try {
        connect();
        get_idle_timeout();
        return () => {
          if (isMountedRef.current) {
            set_status("closing connection");
          }
          if (syncRef.current != null) {
            syncRef.current.close();
          }
        };
      } catch (err) {
        if (isMountedRef.current) {
          set_status(`ERROR: ${err}`);
        }
      }
    }, [project_state]);

    function update_top(info: ProjectInfoType) {
      // this shouldn't be the case, but somehow I saw this happening once
      // the ProjectInfoType type is updated to refrect this edge case and here we bail out
      // and wait for the next update of "info" to get all processes…
      if (info.processes == null) return;
      switch (mode) {
        case "full":
          const pchildren: string[] = [];
          const pt_stats = { ...pt_stats_init };
          const new_ptree =
            process_tree(info.processes, 1, pchildren, pt_stats) ?? [];
          sum_children(new_ptree);
          set_ptree(new_ptree);
          set_pt_stats(pt_stats);
          set_have_children(pchildren);
          break;
        case "flyout":
          // flyout does not nest children, not enogh space
          set_ptree(linearList(info.processes));
          break;
        default:
          unreachable(mode);
      }
    }

    // when "info" changes, we compute a few derived values and the data for the process table
    React.useEffect(() => {
      if (info == null) return;
      update_top(info);
      const cg = info.cgroup;
      const du = info.disk_usage;

      if (cg != null && du?.tmp != null) {
        const { mem_rss, mem_tot, mem_pct, cpu_pct } = cgroup_stats(cg, du.tmp);
        set_cg_info({
          mem_rss,
          mem_tot,
          mem_pct,
          cpu_pct,
          cpu_usage_rate: cg.cpu_usage_rate,
          cpu_usage_limit: cg.cpu_cores_limit,
        });
      }

      if (du?.project != null) {
        const p = du.project;
        // usage could be higher than available, i.e. when quotas aren't quick enough
        // or it has been changed at a later point in time
        const total = p.usage + p.available;
        const pct = 100 * Math.min(1, p.usage / total);
        set_disk_usage({ pct, usage: p.usage, total });
      }
    }, [info]);

    function select_proc(pids: number[]) {
      set_selected(pids);
    }

    function val_max_value(
      index: "cpu_pct" | "cpu_tot" | "mem" | "pid",
    ): number {
      switch (index) {
        case "pid":
          // largest pid number in linux 64 bit
          return 2 ** 22 + 1;
        case "cpu_pct":
          // the cgroup cpu limit could be less than 1, but we want to alert about
          // processes using 100% cpu, even if there is much more headroom.
          const avail_cores = Math.min(1, info?.cgroup?.cpu_cores_limit ?? 1);
          return 100 * avail_cores;
        case "cpu_tot":
          return idle_timeout;
        case "mem":
          const hml = info?.cgroup?.mem_stat.hierarchical_memory_limit;
          if (hml != null) {
            // 50% of max memory
            return hml / 2;
          } else {
            return 1000; // 1 gb
          }
        default:
          unreachable(index);
          return 0;
      }
    }

    function any_alerts(): boolean {
      return project_status?.get("alerts").size > 0;
    }

    function render_disconnected() {
      if (!disconnected) return;
      return <Alert type={"warning"} message={"Warning: disconnected …"} />;
    }

    // if collapsed, we sum up the values of the children
    // to avoid misunderstandings due to data not being shown…
    function onCellProps(
      index: "cpu_pct" | "cpu_tot" | "mem",
      to_str?: (val) => Rendered,
    ) {
      const cell_val = (val, proc): number => {
        // we have to check for length==0, because initally rows are all expanded but
        // onExpandedRowsChange isn't triggered
        if (
          expanded.length == 0 ||
          expanded.includes(proc.key) ||
          !have_children.includes(proc.key)
        ) {
          return val;
        } else {
          const cs = proc.chldsum;
          return val + (cs != null ? cs[index] : 0);
        }
      };

      const max_val = val_max_value(index);

      if (to_str == null) {
        return (proc: ProcessRow) => {
          const val = proc[index];
          const display_val = cell_val(val, proc);
          return {
            style: grid_warning(display_val, max_val),
          };
        };
      } else {
        return (val, proc: ProcessRow) => {
          const display_val = cell_val(val, proc);
          return to_str(display_val);
        };
      }
    }

    function render_cocalc({ cocalc }: ProcessRow) {
      if (cocalc == null) return;
      switch (cocalc.type) {
        case "project":
          return render_cocalc_btn({
            title: "Project",
            onClick: () => set_modal("project"),
          });

        case "sshd":
          return render_cocalc_btn({
            title: "SSH",
            onClick: () => set_modal("ssh"),
          });

        case "terminal":
          return (
            <CoCalcFile
              icon={"terminal"}
              path={cocalc.path}
              project_actions={project_actions}
            />
          );

        case "jupyter":
          return (
            <CoCalcFile
              icon={"ipynb"}
              path={cocalc.path}
              project_actions={project_actions}
            />
          );

        case "x11":
          return (
            <CoCalcFile
              icon={"window-restore"}
              path={cocalc.path}
              project_actions={project_actions}
            />
          );

        default:
          unreachable(cocalc);
      }
    }

    switch (mode) {
      case "flyout":
        return (
          <Flyout
            wrap={wrap}
            error={error}
            cg_info={cg_info}
            disconnected={disconnected}
            disk_usage={disk_usage}
            info={info}
            loading={loading}
            modal={modal}
            project_actions={project_actions}
            project_state={project_state}
            project_status={project_status}
            pt_stats={pt_stats}
            ptree={ptree}
            select_proc={select_proc}
            selected={selected}
            set_modal={set_modal}
            set_selected={set_selected}
            show_explanation={show_explanation}
            show_long_loading={show_long_loading}
            start_ts={start_ts}
            status={status}
            sync={sync}
            render_disconnected={render_disconnected}
            render_cocalc={render_cocalc}
            onCellProps={onCellProps}
          />
        );
      case "full":
        return (
          <Full
            any_alerts={any_alerts}
            cg_info={cg_info}
            disconnected={disconnected}
            disk_usage={disk_usage}
            error={error}
            info={info}
            loading={loading}
            modal={modal}
            project_actions={project_actions}
            project_id={project_id}
            project_state={project_state}
            project_status={project_status}
            pt_stats={pt_stats}
            ptree={ptree}
            select_proc={select_proc}
            selected={selected}
            set_expanded={set_expanded}
            set_modal={set_modal}
            set_selected={set_selected}
            show_explanation={show_explanation}
            show_long_loading={show_long_loading}
            start_ts={start_ts}
            status={status}
            sync={sync}
            render_disconnected={render_disconnected}
            render_cocalc={render_cocalc}
            onCellProps={onCellProps}
          />
        );
    }
  },
);
