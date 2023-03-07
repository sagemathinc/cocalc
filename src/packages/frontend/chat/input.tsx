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

interface Props {
  on_send: (value: string) => void;
  input?: string;
  on_paste?: (e) => void;
  onChange: (string) => void;
  height?: string;
  submitMentionsRef?: any;
  font_size?: number;
  hideHelp?: boolean;
  style?: CSSProperties;
  cacheId?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  syncdb?;
  editBarStyle?: CSS;
}

export const ChatInput: React.FC<Props> = (props: Props) => {
  const {
    on_send,
    onChange,
    height,
    submitMentionsRef,
    hideHelp,
    style,
    cacheId,
    onFocus,
    onBlur,
    syncdb,
    editBarStyle,
  } = props;

  const { project_id, path, actions } = useFrameContext();
  const font_size =
    props.font_size ?? useRedux(["font_size"], project_id, path);
  const sender_id = useMemo(
    () => redux.getStore("account").get_account_id(),
    []
  );

  const [input, setInput] = useState<string>(() => {
    if (syncdb != null) {
      const input = syncdb
        .get_one({
          event: "draft",
          sender_id,
          date: 0,
        })
        ?.get("input");
      return input;
    }
    // IMPORTANT: this is props.input, not input !!!
    // this caused a bug where past chats can't be edited.
    return props.input ?? "";
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
          date: 0,
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
          date: 0, // it's a primary key so can't use this to represent when user last edited this; may use other date for editing past chats.
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
        date: 0,
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
      autoFocus
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
      placeholder={"Type a message..."}
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
    />
  );
};
