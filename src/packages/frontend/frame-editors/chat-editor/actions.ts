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
import {
  getInitialState,
  ChatState,
  ChatStore,
} from "@cocalc/frontend/chat/store";
import { handleSyncDBChange, initFromSyncDB } from "@cocalc/frontend/chat/sync";
import { redux_name } from "@cocalc/frontend/app-framework";
import { aux_file } from "@cocalc/util/misc";
import type { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { delay } from "awaiting";
import { getSearchData } from "@cocalc/frontend/chat/filter-messages";
import { ChatMessageCache } from "@cocalc/frontend/chat/message-cache";

const FRAME_TYPE = "chatroom";

type ChatEditorState = CodeEditorState & ChatState;

export class Actions extends CodeEditorActions<ChatEditorState> {
  protected doctype: string = "immer";
  protected primary_keys = ["date", "sender_id", "event"];
  // used only for drafts, since store lots of versions as user types:
  protected string_cols = ["input"];
  private chatActions: { [frameId: string]: ChatActions } = {};
  private auxPath: string;
  private messageCache?: ChatMessageCache;

  _init2(): void {
    this.auxPath = aux_file(this.path, "tasks");
    const store = this.store;
    this.setState({
      ...getInitialState(),
      project_id: this.project_id,
      path: this.path,
    });
    const syncdb = this._syncstring;
    // Single shared message cache for all chat frames attached to this syncdoc.
    this.messageCache = new ChatMessageCache(syncdb);
    syncdb.once("ready", () => {
      initFromSyncDB({ syncdb, store });
    });
    syncdb.on("change", (changes) => {
      handleSyncDBChange({ store, syncdb, changes });
    });
  }

  foldAIThreads(id: string) {
    this.chatActions[id]?.foldAllThreads(true);
  }

  foldAllThreads(id: string) {
    this.chatActions[id]?.foldAllThreads(false);
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

    if (this._get_frame_type(frameId) != FRAME_TYPE) {
      // if frame is not of type FRAME_TYPE, no chat actions are defined
      return;
    }

    const syncdb = this._syncstring;
    const auxPath = this.auxPath + frameId;
    const reduxName = redux_name(this.project_id, auxPath);
    const actions = this.redux.createActions(reduxName, ChatActions);
    if (!this.messageCache) {
      this.messageCache = new ChatMessageCache(syncdb);
    }
    // our store is not exactly a ChatStore but it's close enough
    actions.set_syncdb(syncdb, this.store as ChatStore, this.messageCache);
    actions.frameId = frameId;
    actions.frameTreeActions = this as any;
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
    actions.dispose?.();
    delete this.chatActions[frameId];
    const name = actions.name;
    this.redux.removeActions(name);
  }

  close(): void {
    if (this._state == "closed") {
      return;
    }
    for (const frameId in this.chatActions) {
      this.closeChatFrame(frameId);
    }
    this.messageCache?.dispose?.();
    this.messageCache = undefined;
    super.close();
  }

  _raw_default_frame_tree(): FrameTree {
    return { type: FRAME_TYPE };
  }

  async export_to_markdown(): Promise<void> {
    try {
      await this.getChatActions()?.export_to_markdown();
    } catch (error) {
      this.set_error(`${error}`);
    }
  }

  scrollToBottom = (frameId) => {
    this.getChatActions(frameId)?.scrollToIndex(-1);
  };

  scrollToTop = (frameId) => {
    this.getChatActions(frameId)?.scrollToIndex(0);
  };

  async gotoFragment(fragmentId: FragmentId) {
    const { chat } = fragmentId as any;
    if (!chat) {
      return;
    }
    const frameId = await this.waitUntilFrameReady({
      type: FRAME_TYPE,
    });
    if (!frameId) {
      return;
    }
    for (const d of [1, 10, 50, 500, 1000]) {
      const actions = this.getChatActions(frameId);
      actions?.scrollToDate(chat);
      await delay(d);
    }
  }

  getSearchIndexData = () => {
    const messages = this.store?.get("messages");
    if (messages == null) {
      return {};
    }
    const data: { [id: string]: string } = {};
    const data0 = getSearchData({ messages, threads: false });
    for (const id in data0) {
      data[id] = data0[id]?.content;
    }
    return { data, fragmentKey: "chat" };
  };
}
