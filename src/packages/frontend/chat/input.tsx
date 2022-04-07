/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties, useEffect, useMemo, useState } from "react";
import { redux, useRedux } from "../app-framework";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { IS_MOBILE } from "../feature";
import { useFrameContext } from "../frame-editors/frame-tree/frame-context";
import { useDebouncedCallback } from "use-debounce";
import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";

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
}

export const ChatInput: React.FC<Props> = (props) => {
  const { syncdb } = props;
  const { project_id, path, actions } = useFrameContext();
  const font_size =
    props.font_size ?? useRedux(["font_size"], project_id, path);
  const sender_id = useMemo(
    () => redux.getStore("account").get_account_id(),
    []
  );

  const isMountedRef = useIsMountedRef();
  const saveChat = useDebouncedCallback(
    (input) => {
      if (!isMountedRef.current || syncdb == null) return;
      props.onChange(input);
      // also save to syncdb, so we have undo, etc.
      syncdb.set({
        event: "draft",
        sender_id,
        input,
        date: 0,
        editing: null,
        history: null,
      });
      syncdb.commit();
    },
    SAVE_DEBOUNCE_MS,
    { leading: true }
  );
  useEffect(() => {
    if (syncdb == null) return;
    const onSyncdbChange = (changes) => {
      console.log("changes = ", changes?.toJS());
      const sender_id = redux.getStore("account").get_account_id();
      const x = syncdb.get_one({
        event: "draft",
        sender_id,
      });
      console.log("x = ", x?.toJS());
    };
    syncdb.on("change", onSyncdbChange);
    return () => {
      syncdb.removeListener("change", onSyncdbChange);
    };
  }, [syncdb]);

  const [input, setInput] = useState<string>(props.input ?? "");
  const clearInput = () => {
    saveChat.cancel();
    setInput("");
  };
  useEffect(() => {
    if (!props.input) {
      clearInput();
    }
  }, [props.input]);

  return (
    <MarkdownInput
      autoFocus
      saveDebounceMs={0}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      cacheId={props.cacheId}
      value={input}
      enableUpload={true}
      onUploadStart={() => actions?.set_uploading(true)}
      onUploadEnd={() => actions?.set_uploading(false)}
      enableMentions={true}
      submitMentionsRef={props.submitMentionsRef}
      onChange={(input) => {
        setInput(input);
        saveChat(input);
      }}
      onShiftEnter={(input) => {
        setInput(input);
        props.on_send(input);
        clearInput();
      }}
      height={props.height}
      placeholder={"Type a message..."}
      extraHelp={
        IS_MOBILE
          ? "Click the date to edit chats."
          : "Double click to edit chats."
      }
      fontSize={font_size}
      hideHelp={props.hideHelp}
      style={props.style}
      onUndo={() => {
        saveChat.cancel();
        actions.undo("");
      }}
      onRedo={() => {
        saveChat.cancel();
        actions.redo("");
      }}
    />
  );
};
