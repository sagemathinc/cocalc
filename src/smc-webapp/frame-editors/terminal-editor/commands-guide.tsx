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
} from "../../app-framework";
// import { delay } from "awaiting";
import { Map } from "immutable";
// import { Icon, Loading } from "../../r_misc";
import { Button } from "../../antd-bootstrap";

import { TerminalActions } from "./actions";

interface Props {
  font_size: number;
  project_id: string;
  actions: TerminalActions;
  local_view_state: Map<string, any>;
}

//function is_equal(prev, next) {
//  return prev.font_size == next.font_size;
//}

export const CommandsGuide: React.FC<Props> = React.memo((props) => {
  const { font_size, actions, local_view_state, project_id } = props;
  console.log("local_view_state", local_view_state.toJS());
  console.log("font_size", font_size, " -- ", actions);

  const project_actions = useActions({ project_id });
  const directory_listings = useTypedRedux(
    { project_id },
    "directory_listings"
  );
  const [terminal_id, set_terminal_id] = useState<string | undefined>();
  const [cwd, set_cwd] = useState<string | undefined>();
  const [listing, set_listing] = useState<any | undefined>();

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
    }
  }, [directory_listings, cwd, terminal_id]);

  function render_files() {
    return (
      <p>
        cwd:<code>{cwd}</code>
        <br />
        <pre>{JSON.stringify(listing ?? {}, null, 2)}</pre>
      </p>
    );
  }

  function render_btn() {
    return (
      <>
        <Button onClick={() => actions.run_command("ls")}>Listing</Button>
        <Button onClick={() => actions.run_command("ls -la")}>
          Long full listing
        </Button>
        <Button onClick={() => actions.run_command("date")}>Date</Button>
        <br />
        {render_files()}
      </>
    );
  }

  return (
    <>
      <div>Terminal Commands</div>

      {render_btn()}
    </>
  );
}); //, is_equal);
