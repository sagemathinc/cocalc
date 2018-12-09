/*
Lean Editor Actions
*/

// This should be longer than the time between keystrokes, but
// small enough that it feels fast/responsive.
const DEBOUNCE_MS = 750;

import { debounce } from "underscore";

import { List } from "immutable";

import { Store } from "../../app-framework";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";

import { project_api } from "../generic/client";
import { capitalize } from "smc-util/misc2";

import { Channel } from "smc-webapp/project/websocket/types";

import { Task, Message, Completion } from "./types";

import { update_gutters } from "./gutters";

interface LeanEditorState extends CodeEditorState {
  info: any;
  messages: Message[];
  tasks: Task[];
  sync: { hash: number; time: number }; // hash is the hash of last version sync'd to lean, and time is *when*
  syncstring_hash: number; // hash of actual syncstring in client
}

export class Actions extends BaseActions<LeanEditorState> {
  private channel: Channel;
  public store: Store<LeanEditorState>;
  private gutter_last: { synced: boolean; messages: any; tasks: any };
  private debounced_process_data_queue: Function;
  private debounced_update_info: Function;
  private debounced_update_gutters: Function;
  private debounced_update_status_bar: Function;
  private data_queue: any[];

  async _init2(): Promise<void> {
    this.data_queue = [];

    this.debounced_process_data_queue = debounce(() => {
      this.process_data_queue();
    }, DEBOUNCE_MS);

    this.debounced_update_info = debounce(() => {
      this.update_info();
    }, DEBOUNCE_MS);
    this.debounced_update_gutters = debounce(() => {
      this.update_gutters();
    }, DEBOUNCE_MS);
    this.debounced_update_status_bar = debounce(() => {
      this.update_status_bar();
    }, DEBOUNCE_MS);

    this.setState({
      messages: [],
      tasks: [],
      sync: { hash: 0, time: 0 },
      syncstring_hash: 0,
      info: {}
    });
    this.gutter_last = { synced: false, messages: List(), tasks: List() };
    if (!this.is_public) {
      this._syncstring.on("change", () => {
        this.setState({
          syncstring_hash: this._syncstring.hash_of_live_version()
        });
        this.debounced_update_gutters();
        this.debounced_update_status_bar();
        this.debounced_update_info();
      });
      try {
        await this._init_channel();
      } catch (err) {
        this.set_error(
          // TODO: should retry instead (?)
          err +
            " -- you might need to refresh your browser or close and open this file."
        );
      }
    } else {
      this._init_value();
    }
  }

  async _init_channel(): Promise<void> {
    if (this._state === "closed") return;
    const api = await project_api(this.project_id);
    this.channel = await api.lean_channel(this.path);
    const channel: any = this.channel;
    if (this._syncstring != null) {
      this._syncstring.touch(); // so the backend project will "care" about this file.
    }
    channel.on("close", () => {
      channel.removeAllListeners();
      channel.conn.once("open", async () => {
        await this._init_channel();
      });
    });
    channel.on("data", x => {
      if (typeof x === "object") {
        this.handle_data_from_channel(x);
      }
    });
  }

  handle_data_from_channel(x: object): void {
    this.data_queue.push(x);
    this.debounced_process_data_queue();
  }

  process_data_queue(): void {
      // Can easily happen when closing, due to debounce.
    if (this._state === "closed") return;
    if (this.data_queue.length === 0) {
      return;
    }
    for (let x of this.data_queue) {
      if (x.messages !== undefined) {
        this.setState({ messages: x.messages });
      }
      if (x.tasks !== undefined) {
        this.setState({ tasks: x.tasks });
      }
      if (x.sync !== undefined) {
        this.setState({ sync: x.sync });
      }
    }
    this.data_queue = [];
    this.update_gutters();
    this.update_status_bar();
  }

  async restart(): Promise<void> {
    this.set_status("Restarting LEAN ...");
    // Using hash: -1 as a signal for restarting -- yes, that's ugly
    this.setState({
      sync: { hash: -1, time: 0 }
    });
    const api = await project_api(this.project_id);
    try {
      await api.lean({ cmd: "restart" });
      await this.update_info();
    } catch (err) {
      this.set_error(`Error restarting LEAN: ${err}`);
    } finally {
      this.set_status("");
    }
  }

  close(): void {
    if (this.channel !== undefined) {
      this.channel.end();
      delete this.channel;
    }
    super.close();
  }

  update_status_bar = (): void => {
      // Can easily happen when closing, due to debounce.
    if (this._state === "closed") return;
    const synced =
      this.store.getIn(["sync", "hash"]) == this.store.get("syncstring_hash");
    const tasks = this.store.unsafe_getIn(["tasks"]);
    let status = "";
    if (!synced) {
      status += "Syncing... ";
    }
    if (tasks.size > 0) {
      const task = tasks.get(0).toJS();
      status += `${capitalize(task.desc)}. Processing lines ${task.pos_line}-${
        task.end_pos_line
      }...`;
    }
    //console.log("update_status_bar", status);
    this.set_status(status);
  };

  update_gutters = (): void => {
      // Can easily happen when closing, due to debounce.
    if (this._state === "closed") return;
    const synced =
      this.store.getIn(["sync", "hash"]) == this.store.get("syncstring_hash");
    const messages = this.store.unsafe_getIn(["messages"]);
    const tasks = this.store.unsafe_getIn(["tasks"]);
    const last = this.gutter_last;
    if (
      synced === last.synced &&
      messages === last.messages &&
      tasks === last.tasks
    ) {
      return;
    }
    this.gutter_last = { synced, messages, tasks };
    this.clear_gutter("Codemirror-lean-messages");
    const cm = this._get_cm();
    if (cm === undefined) {
      return; // satisfy typescript
    }
    update_gutters({
      cm,
      synced,
      messages,
      tasks,
      set_gutter: (line, component) => {
        this.set_gutter_marker({
          line,
          component,
          gutter_id: "Codemirror-lean-messages"
        });
      }
    });
  };

  _raw_default_frame_tree(): FrameTree {
    if (this.is_public) {
      return { type: "cm" };
    } else {
      return {
        direction: "col",
        type: "node",
        first: {
          type: "cm-lean"
        },
        second: {
          direction: "row",
          type: "node",
          first: {
            type: "lean-messages"
          },
          second: {
            type: "lean-info"
          }
        }
      };
    }
  }

  // uses API to get running version of LEAN server.
  // I'm just implementing this now; not needed yet.
  async version(): Promise<string> {
    const api = await project_api(this.project_id);
    return await api.lean({ cmd: "version" });
  }

  // Use the backend LEAN server via the api to complete
  // at the given position.
  async complete(line: number, column: number): Promise<Completion[]> {
    if (!(await this.ensure_latest_changes_are_saved())) {
      return [];
    }

    this.set_status(`Completing at line ${line + 1}...`);
    try {
      const api = await project_api(this.project_id);
      return await api.lean({
        path: this.path,
        cmd: "complete",
        line: line + 1, // codemirror is 0 based but lean is 1-based.
        column
      });
    } catch (err) {
      err = err.toString();
      if (err === "timeout" || err === "Error: interrupted") {
        // user likely doesn't care about error report if this is the reason.
        return [];
      }
      this.set_error(`Error getting completions on line ${line + 1} -- ${err}`);
      return [];
    } finally {
      this.set_status("");
    }
  }

  // Use the backend LEAN server via the api to get info
  // at the given position.
  async info(line: number, column: number): Promise<any> {
    if (!(await this.ensure_latest_changes_are_saved())) {
      return;
    }

    this.set_status(`Get info about line ${line + 1}...`);
    try {
      const api = await project_api(this.project_id);
      return await api.lean({
        path: this.path,
        cmd: "info",
        line: line + 1, // codemirror is 0 based but lean is 1-based.
        column
      });
    } catch (err) {
      err = err.toString();
      if (
        err === "timeout" ||
        err === "Error: interrupted" ||
        err === "Error: unknown exception"
      ) {
        // user likely doesn't care about error report if this is the reason.
        return;
      }
      this.set_error(`Error getting info about line ${line + 1} -- ${err}`);
      return;
    } finally {
      this.set_status("");
    }
  }

  async update_info(): Promise<void> {
    // Can easily happen when closing, due to debounce.
    if (this._state === "closed") return;
    const cm = this._recent_cm();
    if (cm == null) {
      // e.g., maybe no editor
      this.setState({ info: {} });
      return;
    }
    const cur = cm.getDoc().getCursor();
    if (cur == null) {
      this.setState({ info: {} });
      return;
    }
    const info = await this.info(cur.line, cur.ch);
    if (info != null) {
      this.setState({ info });
    }
  }

  handle_cursor_move(_): void {
    this.debounced_update_info();
  }

  public async close_and_halt(_: string): Promise<void> {
    this.set_status("Killing LEAN server...");
    const api = await project_api(this.project_id);
    try {
      await api.lean({ cmd: "kill" });
    } catch (err) {
      this.set_error(`Error killing LEAN server: ${err}`);
    } finally {
      this.set_status("");
    }
    // and close this window
    const project_actions = this._get_project_actions();
    project_actions.close_tab(this.path);
  }
}
