/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import {
  CSS,
  redux,
  useIsMountedRef,
  useRedux,
} from "@cocalc/frontend/app-framework";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { SyncDB } from "@cocalc/sync/editor/db";

interface Props {
  on_send: (value: string) => void;
  onChange: (string) => void;
  syncdb: SyncDB;
  date: number; // ms since epoch of when this message was first sent; set to 0 for editing new message. set to -time (negative time) to respond to message at time!
  input?: string;
  on_paste?: (e) => void;
  height?: string;
  submitMentionsRef?: any;
  font_size?: number;
  hideHelp?: boolean;
  style?: CSSProperties;
  cacheId?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  editBarStyle?: CSS;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function ChatInput({
  on_send,
  input: propsInput,
  onChange,
  height,
  submitMentionsRef,
  font_size,
  hideHelp,
  style,
  cacheId,
  onFocus,
  onBlur,
  syncdb,
  date,
  editBarStyle,
  placeholder,
  autoFocus,
}: Props) {
  const { project_id, path, actions } = useFrameContext();
  const fontSize = useRedux(["font_size"], project_id, path);
  if (font_size == null) {
    font_size = fontSize;
  }
  const sender_id = useMemo(
    () => redux.getStore("account").get_account_id(),
    []
  );

  const [input, setInput] = useState<string>(() => {
    const dbInput = syncdb
      .get_one({
        event: "draft",
        sender_id,
        date,
      })
      ?.get("input");
    // take version from syncdb if it is there; otherwise, version from input prop.
    // the db version is used when you refresh your browser while editing, or scroll up and down
    // thus unmounting and remounting the currently editing message (due to virtualization).
    // See https://github.com/sagemathinc/cocalc/issues/6415
    const input = dbInput ?? propsInput;
    return input;
  });

  const isMountedRef = useIsMountedRef();
  const lastSavedRef = useRef<string | null>(null);
  const saveChat = useDebouncedCallback(
    (input) => {
      if (!isMountedRef.current || syncdb == null) return;
      onChange(input);
      lastSavedRef.current = input;
      // also save to syncdb, so we have undo, etc.
      // but definitely don't save (thus updating active) if
      // the input didn't really change, since we use active for
      // showing that a user is writing to other users.
      const input0 = syncdb
        .get_one({
          event: "draft",
          sender_id,
          date,
        })
        ?.get("input");
      if (input0 != input) {
        if (input0 == null && !input) {
          // DO NOT save if you haven't written a draft before, and
          // the draft we would save here would be empty, since that
          // would lead to what humans would consider false notifications.
          return;
        }
        syncdb.set({
          event: "draft",
          sender_id,
          input,
          date, // it's a primary key so can't use this to represent when user last edited this; use other date for editing past chats.
          active: new Date().valueOf(),
        });
        syncdb.commit();
      }
    },
    SAVE_DEBOUNCE_MS,
    { leading: true }
  );
  useEffect(() => {
    if (syncdb == null) return;
    const onSyncdbChange = () => {
      const sender_id = redux.getStore("account").get_account_id();
      const x = syncdb.get_one({
        event: "draft",
        sender_id,
        date,
      });
      const input = x?.get("input");
      if (input != null && input !== lastSavedRef.current) {
        setInput(input);
        lastSavedRef.current = null;
      }
    };
    syncdb.on("change", onSyncdbChange);
    return () => {
      syncdb.removeListener("change", onSyncdbChange);
    };
  }, [syncdb]);

  return (
    <MarkdownInput
      autoFocus={autoFocus}
      saveDebounceMs={0}
      onFocus={onFocus}
      onBlur={onBlur}
      cacheId={cacheId}
      value={input}
      enableUpload={true}
      onUploadStart={() => actions?.set_uploading(true)}
      onUploadEnd={() => actions?.set_uploading(false)}
      enableMentions={true}
      submitMentionsRef={submitMentionsRef}
      onChange={(input) => {
        setInput(input);
        saveChat(input);
      }}
      onShiftEnter={(input) => {
        saveChat.cancel();
        on_send(input);
      }}
      height={height}
      placeholder={placeholder ?? "Type a new message..."}
      extraHelp={
        IS_MOBILE
          ? "Click the date to edit chats."
          : "Double click to edit chats."
      }
      fontSize={font_size}
      hideHelp={hideHelp}
      style={style}
      onUndo={() => {
        saveChat.cancel();
        syncdb?.undo();
      }}
      onRedo={() => {
        saveChat.cancel();
        syncdb?.redo();
      }}
      editBarStyle={editBarStyle}
      overflowEllipsis={true}
      chatGPT={redux.getStore("projects").hasOpenAI(project_id)}
    />
  );
}
