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

import { Task, Message } from "./types";

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

  _init2(): void {
    this.setState({
      messages: [],
      tasks: [],
      sync: { hash: 0, time: 0 },
      syncstring_hash: 0
    });
    this.gutter_last = { synced: false, messages: List(), tasks: List() };
    if (!this.is_public) {
      this._init_channel();
      this._syncstring.on("change", () => {
        this.setState({
          syncstring_hash: this._syncstring.hash_of_live_version()
        });
        this.update_gutters();
        this.update_status_bar();
      });
    } else {
      this._init_value();
    }
  }

  async _init_channel(): Promise<void> {
    const channel: any = (this.channel = await (await project_api(
      this.project_id
    )).lean(this.path));
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

  /*
  // overload the base class so we can handle symbols.
  set_syncstring_to_codemirror(id?: string): void {
    const cm = this._get_cm(id);
    if (!cm) {
      return;
    }
    const value : string = cm.getValue();
    console.log("value=", value);
    const value2 = substitute_symbols(value);
    if (value2 !== value) {
      cm.setValueNoJump(value2);
    }
    this.set_syncstring(value2);
  }
  */

}
