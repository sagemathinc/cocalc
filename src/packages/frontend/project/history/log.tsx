/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";
import { search_split, search_match } from "@cocalc/util/misc";
import {
  React,
  redux,
  TypedMap,
  Rendered,
  useActions,
  useEffect,
  useForceUpdate,
  useState,
  useRef,
  useTypedRedux,
} from "../../app-framework";
import { Button } from "../../antd-bootstrap";
import { Icon, Loading } from "../../components";
import { LogSearch } from "./search";
import { LogEntry } from "./log-entry";
import { EventRecord, to_search_string } from "./types";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

interface Props {
  project_id: string;
}

export const ProjectLog: React.FC<Props> = ({ project_id }) => {
  const project_log = useTypedRedux({ project_id }, "project_log");
  const project_log_all = useTypedRedux({ project_id }, "project_log_all");
  const search = useTypedRedux({ project_id }, "search") ?? "";
  const user_map = useTypedRedux("users", "user_map");
  const actions = useActions({ project_id });
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const state = useRef<{
    log?: List<TypedMap<EventRecord>>;
    search_cache: { [key: string]: string };
    loading_table?: boolean;
    next_cursor_pos?: number;
  }>({ search_cache: {} });
  const [cursor_index, set_cursor_index] = useState<number>(0);
  const force_update = useForceUpdate();
  useEffect(() => {
    delete state.current.log;
    force_update();
  }, [project_log, project_log_all, search]);

  function get_log(): List<TypedMap<EventRecord>> {
    if (state.current.log != null) {
      return state.current.log;
    }
    const log = project_log_all ?? project_log;
    if (log == null) {
      state.current.log = List();
      return state.current.log;
    }

    let log_seq = log.valueSeq().toList();
    if (search) {
      if (state.current.search_cache == undefined) {
        state.current.search_cache = {};
      }
      const terms = search_split(search.toLowerCase());
      const names = {};
      const match = (z: TypedMap<EventRecord>): boolean => {
        let s: string = state.current.search_cache[z.get("id")];
        if (s == undefined) {
          const account_id = z.get("account_id");
          if (names[account_id] == null) {
            names[account_id] = (
              redux.getStore("users").get_name(account_id) ?? ""
            ).toLowerCase();
          }
          s = names[account_id];
          const event = z.get("event");
          if (event != undefined) {
            s += " " + to_search_string(event.toJS());
          }
          state.current.search_cache[z.get("id")] = s;
        }
        return search_match(s, terms);
      };
      log_seq = log_seq.filter(match);
    }
    log_seq = log_seq.sort((a, b) => {
      // time might not be defined at all -- see https://github.com/sagemathinc/cocalc/issues/4271
      // In this case we don't really care what happens with this log
      // entry, only that we don't completely crash cocalc!
      const t0 = b.get("time");
      if (!t0) {
        return -1; // push to the past -- otherwise it would be annoyingly in your face all the time.
      }
      const t1 = a.get("time");
      if (!t1) {
        return 1; // push to the past
      }
      return t0.valueOf() - t1.valueOf();
    });
    state.current.log = log_seq;
    return state.current.log;
  }

  function move_cursor_to(cursor_index): void {
    if (cursor_index < 0 || cursor_index >= get_log().size) {
      return;
    }
    set_cursor_index(cursor_index);
    virtuosoRef.current?.scrollIntoView({ index: cursor_index });
  }

  function increment_cursor(): void {
    move_cursor_to(cursor_index + 1);
  }

  function decrement_cursor(): void {
    move_cursor_to(cursor_index - 1);
  }

  function reset_cursor(): void {
    move_cursor_to(0);
  }

  function load_all(): void {
    state.current.next_cursor_pos = get_log().size - 1;
    state.current.loading_table = false;
    actions?.project_log_load_all();
  }

  function render_load_all_button(): Rendered {
    if (project_log_all != undefined) {
      return;
    }
    return (
      <div style={{ textAlign: "center", padding:'15px' }}>
        <Button
          bsStyle={"info"}
          onClick={load_all}
          disabled={project_log_all != undefined}
        >
          Load older log entries
        </Button>
      </div>
    );
  }

  function row_renderer(index): Rendered {
    const log = get_log();
    if (index === log.size) {
      return render_load_all_button();
    }
    const x = log.get(index);
    if (x == undefined) {
      return;
    }
    return (
      <LogEntry
        id={x.get("id")}
        cursor={cursor_index === index}
        time={x.get("time")}
        event={x.get("event").toJS()}
        account_id={x.get("account_id")}
        user_map={user_map}
        backgroundStyle={
          index % 2 === 0 ? { backgroundColor: "#eee" } : undefined
        }
        project_id={project_id}
      />
    );
  }

  function render_log_entries(): JSX.Element {
    if (state.current.next_cursor_pos) {
      delete state.current.next_cursor_pos;
    }
    return (
      <Virtuoso
        ref={virtuosoRef}
        totalCount={get_log().size + 1}
        itemContent={row_renderer}
      />
    );
  }

  function render_log_panel(): JSX.Element {
    return (
      <div
        className="smc-vfill"
        style={{ border: "1px solid #ccc", borderRadius: "3px" }}
      >
        {render_log_entries()}
      </div>
    );
  }

  function render_body(): JSX.Element {
    if (!project_log && !project_log_all) {
      if (!state.current.loading_table) {
        state.current.loading_table = true;
        // The project log not yet loaded, so kick off the load.
        // This is safe to call multiple times and is done so that the
        // changefeed for the project log is only setup if the user actually
        // looks at the project log at least once.
        redux.getProjectStore(project_id).init_table("project_log");
      }
      return <Loading theme={"medium"} />;
    }
    state.current.loading_table = false;
    return render_log_panel();
  }

  function render_search(): JSX.Element | void {
    if (actions == null) return;
    return (
      <LogSearch
        actions={actions}
        search={search}
        selected={get_log().get(cursor_index)}
        increment_cursor={(): void => {
          increment_cursor();
        }}
        decrement_cursor={(): void => {
          decrement_cursor();
        }}
        reset_cursor={(): void => {
          reset_cursor();
        }}
      />
    );
  }

  return (
    <div style={{ padding: "15px" }} className={"smc-vfill"}>
      <h1 style={{ marginTop: "0px" }}>
        <Icon name="history" /> Project activity log
      </h1>
      {render_search()}
      {render_body()}
    </div>
  );
};
