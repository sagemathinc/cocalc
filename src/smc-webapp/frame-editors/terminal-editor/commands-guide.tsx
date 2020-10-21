/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  useEffect,
  useState,
  useActions,
  useTypedRedux,
  TypedMap,
} from "../../app-framework";
import { Collapse, Descriptions } from "antd";
const { Panel } = Collapse;
// import { delay } from "awaiting";
import { Map, List } from "immutable";
// import { Icon, Loading } from "../../r_misc";
import { Button } from "../../antd-bootstrap";
import { plural, round1 } from "smc-util/misc";
import { TerminalActions } from "./actions";
import { DirectoryListingEntry } from "../../project/explorer/types";

interface Props {
  font_size: number;
  project_id: string;
  actions: TerminalActions;
  local_view_state: Map<string, any>;
}

const ListingStatsInit = {
  total: 0,
  num_files: 0,
  num_dirs: 0,
  size_mib: 0,
};

const info = "info";

//function is_equal(prev, next) {
//  return prev.font_size == next.font_size;
//}

export const CommandsGuide: React.FC<Props> = React.memo((props) => {
  const { font_size, actions, local_view_state, project_id } = props;
  console.log("font_size", font_size, " -- ", actions);

  const project_actions = useActions({ project_id });
  const directory_listings = useTypedRedux(
    { project_id },
    "directory_listings"
  );
  const [terminal_id, set_terminal_id] = useState<string | undefined>();
  const [cwd, set_cwd] = useState<string>(""); // default home directory
  const [listing, set_listing] = useState<
    List<TypedMap<DirectoryListingEntry>>
  >(List([])); // empty immutable js list
  const [listing_stats, set_listing_stats] = useState<typeof ListingStatsInit>(
    ListingStatsInit
  );
  useEffect(() => {
    const tid = actions._get_most_recent_active_frame_id_of_type("terminal");
    if (tid == null) return;
    if (terminal_id != tid) set_terminal_id(tid);
  }, [local_view_state]);

  function cwd2path(cwd: string): string {
    return cwd.charAt(0) === "/" ? ".smc/root" + cwd : cwd;
  }

  useEffect(() => {
    //const terminal = actions.get_terminal(tid);
    const next_cwd = local_view_state.getIn([
      "editor_state",
      terminal_id,
      "cwd",
    ]);
    if (next_cwd != null && cwd != next_cwd) {
      set_cwd(next_cwd);
      project_actions?.fetch_directory_listing({ path: cwd2path(next_cwd) });
    }
  }, [terminal_id, local_view_state]);

  useEffect(() => {
    if (cwd == null) return;
    const next_listing = directory_listings?.get(cwd2path(cwd));
    if (next_listing != null && next_listing != listing) {
      set_listing(next_listing);
      const nf = next_listing.count((val) => val.get("isdir"));
      const total = next_listing.size;
      const size =
        next_listing.reduce(
          (cur, val) => cur + (val.get("isdir") ? 0 : val.get("size")),
          0
        ) /
        (1024 * 1024);
      set_listing_stats({
        total,
        num_files: nf,
        num_dirs: total - nf,
        size_mib: size,
      });
    }
  }, [directory_listings, cwd, terminal_id]);

  function render_files() {
    return (
      <pre style={{ fontSize: "80%" }}>
        {JSON.stringify(listing ?? {}, null, 2)}
      </pre>
    );
  }

  function render_btn() {
    return (
      <div>
        <Button onClick={() => actions.run_command("ls")}>Listing</Button>
        <Button onClick={() => actions.run_command("ls -la")}>
          Long full listing
        </Button>
        <Button onClick={() => actions.run_command("date")}>Date</Button>
      </div>
    );
  }

  function render_info() {
    const dir = cwd.startsWith("/") ? cwd : cwd === "" ? "~" : `~/${cwd}`;
    return (
      <Descriptions size="small" bordered column={1}>
        <Descriptions.Item label="Directory">
          <code>{dir}</code>
        </Descriptions.Item>
        <Descriptions.Item label="Content">
          <code>{listing_stats.num_files}</code>{" "}
          {plural(listing_stats.num_files, "file")},{" "}
          <code>{listing_stats.num_dirs}</code>{" "}
          {plural(listing_stats.num_dirs, "directory", "directories")},{" "}
          <code>{round1(listing_stats.size_mib)}</code> MiB
        </Descriptions.Item>
      </Descriptions>
    );
  }

  function render_git() {
    return <p>Git</p>;
  }

  return (
    <Collapse defaultActiveKey={[info]}>
      <Panel header="General information" key={info}>
        {render_info()}
      </Panel>
      <Panel header="File commands" key="file-commands">
        {render_btn()}
      </Panel>
      <Panel header="Git" key="git">
        {render_git()}
      </Panel>
      <Panel header="Files" key="files">
        {render_files()}
      </Panel>
    </Collapse>
  );
}); //, is_equal);
