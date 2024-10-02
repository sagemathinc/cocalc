/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Chat Editor Actions
*/

import {
  Actions as CodeEditorActions,
  CodeEditorState,
} from "../code-editor/actions";
import { FrameTree } from "../frame-tree/types";
import { ChatActions } from "@cocalc/frontend/chat/actions";
import { ChatStore } from "@cocalc/frontend/chat/store";
import { redux_name } from "@cocalc/frontend/app-framework";
import { aux_file } from "@cocalc/util/misc";

interface ChatEditorState extends CodeEditorState {
  // nothing yet
}

export class Actions extends CodeEditorActions<ChatEditorState> {
  protected doctype: string = "syncdb";
  protected primary_keys = ["date", "sender_id", "event"];
  // used only for drafts, since store lots of versions as user types:
  protected string_cols = ["input"];
  chatActions: { [frameId: string]: ChatActions } = {};
  chatStore: ChatStore;
  auxPath: string;

  _init2(): void {
    this.auxPath = aux_file(this.path, "tasks");
    this.chatStore = this.redux.createStore(
      redux_name(this.project_id, this.auxPath),
      ChatStore,
    );
  }

  getChatActions(frameId?): ChatActions | undefined {
    if (frameId == null) {
      for (const actions of Object.values(this.chatActions)) {
        return actions;
      }
      return undefined;
    }
    if (this.chatActions[frameId] != null) {
      return this.chatActions[frameId];
    }
    const syncdb = this._syncstring;
    const auxPath = this.auxPath + frameId;
    const reduxName = redux_name(this.project_id, auxPath);
    const actions = this.redux.createActions(reduxName, ChatActions);

    const init = () => {
      actions.set_syncdb(syncdb, this.chatStore);
      actions.init_from_syncdb();
      syncdb.on("change", actions.syncdb_change.bind(actions));
      syncdb.on("has-uncommitted-changes", (val) =>
        actions.setState({ has_uncommitted_changes: val }),
      );
      syncdb.on("has-unsaved-changes", (val) =>
        actions.setState({ has_unsaved_changes: val }),
      );
    };
    if (syncdb.get_state() != "ready") {
      syncdb.once("ready", init);
    } else {
      init();
    }

    this.chatActions[frameId] = actions;
    return actions;
  }

  undo() {
    this.getChatActions()?.undo();
  }
  redo() {
    this.getChatActions()?.redo();
  }

  help() {
    this.getChatActions()?.help();
  }

  close_frame(frameId: string): void {
    super.close_frame(frameId); // actually closes the frame itself
    // now clean up if it is a chat frame:
    if (this.chatActions[frameId] != null) {
      this.closeChatFrame(frameId);
    }
  }

  closeChatFrame(frameId: string): void {
    const actions = this.chatActions[frameId];
    if (actions == null) {
      return;
    }
    delete this.chatActions[frameId];
    const name = actions.name;
    this.redux.removeActions(name);
    actions.close();
  }

  close(): void {
    if (this._state == "closed") {
      return;
    }
    for (const frameId in this.chatActions) {
      this.closeChatFrame(frameId);
    }
    this.redux.removeStore(this.chatStore.name);
    super.close();
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: "chatroom" };
  }

  async export_to_markdown(): Promise<void> {
    try {
      await this.getChatActions()?.export_to_markdown();
    } catch (error) {
      this.set_error(`${error}`);
    }
  }
}
