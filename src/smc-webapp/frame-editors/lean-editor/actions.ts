/*
Lean Editor Actions
*/

import { Store } from "../../app-framework";

import {
  Actions as BaseActions,
  CodeEditorState
} from "../code-editor/actions";

import { FrameTree } from "../frame-tree/types";

import { project_api } from "../generic/client";

import { Channel } from "smc-webapp/project/websocket/types";

import { Task, Message } from "./types";

import { update_gutters } from "./gutters";
console.log(update_gutters);

interface LeanEditorState extends CodeEditorState {
  messages: Message[];
  tasks: Task[];
  sync: { hash: number; time: number }; // hash is the hash of last version sync'd to lean, and time is *when*
  syncstring_hash: number; // hash of actual syncstring in client
}

export class Actions extends BaseActions<LeanEditorState> {
  private channel: Channel;
  public store: Store<LeanEditorState>;

  _init2(): void {
    this.setState({
      messages: [],
      tasks: [],
      sync: { hash: 0, time: 0 },
      syncstring_hash: 0
    });
    if (!this.is_public) {
      this._init_channel();
      this._syncstring.on("change", () => {
        this.setState({
          syncstring_hash: this._syncstring.hash_of_live_version()
        });
      });
    } else {
      this._init_value();
    }
  }

  async _init_channel(): Promise<void> {
    this.channel = await (await project_api(this.project_id)).lean(this.path);
    this.channel.on("data", x => {
      console.log(this.path, "channel got: ", JSON.stringify(x));
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
      }
    });
  }

  update_gutters = (): void => {
    this.clear_gutter("Codemirror-lean-info")
    update_gutters({
      messages: this.store.unsafe_getIn(["messages"]),
      tasks: this.store.unsafe_getIn(["tasks"]),
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
}
