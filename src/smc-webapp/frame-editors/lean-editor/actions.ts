/*
Lean Editor Actions
*/

import { List } from "immutable";

import { Store } from "../../app-framework";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";

import { project_api } from "../generic/client";
import { capitalize } from "../generic/misc";

import { Channel } from "smc-webapp/project/websocket/types";

import { Task, Message, Completion } from "./types";

import { update_gutters } from "./gutters";

interface LeanEditorState extends CodeEditorState {
  messages: Message[];
  tasks: Task[];
  sync: { hash: number; time: number }; // hash is the hash of last version sync'd to lean, and time is *when*
  syncstring_hash: number; // hash of actual syncstring in client
}

export class Actions extends BaseActions<LeanEditorState> {
  private channel: Channel;
  public store: Store<LeanEditorState>;
  private gutter_last: { synced: boolean; messages: any; tasks: any };

  async _init2(): Promise<void> {
    this.setState({
      messages: [],
      tasks: [],
      sync: { hash: 0, time: 0 },
      syncstring_hash: 0
    });
    this.gutter_last = { synced: false, messages: List(), tasks: List() };
    if (!this.is_public) {
      this._syncstring.on("change", () => {
        this.setState({
          syncstring_hash: this._syncstring.hash_of_live_version()
        });
        this.update_gutters();
        this.update_status_bar();
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
    const api = await project_api(this.project_id);
    this.channel = await api.lean_channel(this.path);
    const channel: any = this.channel;
    channel.on("close", () => {
      channel.conn.once("open", () => {
        channel.connect();
      });
    });
    channel.on("data", x => {
      //console.log(this.path, "channel got: ", JSON.stringify(x).slice(0,70));
      if (typeof x === "object") {
        if (x.messages !== undefined) {
          this.setState({ messages: x.messages });
        }
        if (x.tasks !== undefined) {
          this.setState({ tasks: x.tasks });
        }
        if (x.sync !== undefined) {
          this.setState({ sync: x.sync });
        }
        this.update_gutters();
        this.update_status_bar();
      }
    });
  }

  close(): void {
    if (this.channel !== undefined) {
      this.channel.end();
      delete this.channel;
    }
    super.close();
  }

  update_status_bar = (): void => {
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
    this.clear_gutter("Codemirror-lean-info");
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
          gutter_id: "Codemirror-lean-info"
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
          type: "lean-cm"
        },
        second: {
          type: "lean-info"
        }
      };
    }
  }

  // Use the backend LEAN server via the api to complete
  // at the given position.
  async complete(line: number, column: number): Promise<Completion[]> {
    if (!await this.ensure_latest_changes_are_saved()) {
      return [];
    }

    this.set_status("Complete...");
    try {
      const api = await project_api(this.project_id);
      const resp = await api.lean({
        path: this.path,
        cmd: "complete",
        line: line + 1, // codemirror is 0 based but lean is 1-based.
        column
      });
      if (resp.completions != null) {
        return resp.completions;
      } else {
        return [];
      }
    } catch (err) {
      err = err.toString();
      if (err === "timeout") {
        // user likely doesn't care about error report if this is the reason.
        return [];
      }
      this.set_error(`Error getting completions -- ${err}`);
      return [];
    } finally {
      this.set_status("");
    }
  }
}
