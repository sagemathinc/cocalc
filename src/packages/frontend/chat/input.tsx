/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIntl } from "react-intl";
import { useDebouncedCallback } from "use-debounce";
import { CSS, redux, useIsMountedRef } from "@cocalc/frontend/app-framework";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { ImmerDB } from "@cocalc/sync/editor/immer-db";
import { SubmitMentionsRef } from "./types";

interface Props {
  on_send: (value: string) => void;
  onChange: (string) => void;
  syncdb: ImmerDB | undefined;
  // date:
  //   - ms since epoch of when this message was first sent
  //   - set to 0 for editing new message
  //   - set to -time (negative time) to respond to thread, where time is the time of ROOT message of the the thread.
  date: number;
  input?: string;
  on_paste?: (e) => void;
  height?: string;
  submitMentionsRef?: SubmitMentionsRef;
  fontSize?: number;
  hideHelp?: boolean;
  style?: CSSProperties;
  cacheId?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  editBarStyle?: CSS;
  placeholder?: string;
  autoFocus?: boolean;
  moveCursorToEndOfLine?: boolean;
}

export default function ChatInput({
  autoFocus,
  cacheId,
  date,
  editBarStyle,
  fontSize,
  height,
  hideHelp,
  input: propsInput,
  on_send,
  onBlur,
  onChange,
  onFocus,
  placeholder,
  style,
  submitMentionsRef,
  syncdb,
  moveCursorToEndOfLine,
}: Props) {
  const intl = useIntl();
  const onSendRef = useRef<Function>(on_send);
  useEffect(() => {
    onSendRef.current = on_send;
  }, [on_send]);
  const { project_id } = useFrameContext();
  const sender_id = useMemo(
    () => redux.getStore("account").get_account_id(),
    [],
  );
  const controlRef = useRef<any>(null);
  const [input, setInput] = useState<string>("");

  const getDraftInput = useCallback(() => {
    const rec = syncdb?.get_one({
      event: "draft",
      sender_id,
      date,
    });
    if (rec == null) return undefined;
    return (rec as any).input;
  }, [syncdb, sender_id, date]);

  useEffect(() => {
    const dbInput = getDraftInput();
    // take version from syncdb if it is there; otherwise, version from input prop.
    // the db version is used when you refresh your browser while editing, or scroll up and down
    // thus unmounting and remounting the currently editing message (due to virtualization).
    // See https://github.com/sagemathinc/cocalc/issues/6415
    const input = dbInput ?? propsInput;
    setInput(input);
    if (input?.trim() && moveCursorToEndOfLine) {
      // have to wait until it's all rendered -- i hate code like this...
      for (const n of [1, 10, 50]) {
        setTimeout(() => {
          controlRef.current?.moveCursorToEndOfLine();
        }, n);
      }
    }
  }, [date, sender_id, propsInput, getDraftInput]);

  const currentInputRef = useRef<string>(input);
  const saveOnUnmountRef = useRef<boolean>(true);
  const isMountedRef = useIsMountedRef();
  const lastSavedRef = useRef<string>(input);
  const saveChat = useDebouncedCallback(
    (input) => {
      if (
        syncdb == null ||
        (!isMountedRef.current && !saveOnUnmountRef.current)
      ) {
        return;
      }
      onChange(input);
      lastSavedRef.current = input;
      // also save to syncdb, so we have undo, etc.
      // but definitely don't save (thus updating active) if
      // the input didn't really change, since we use active for
      // showing that a user is writing to other users.
      const input0 = getDraftInput();
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
          active: Date.now(),
        });
        syncdb.commit();
      }
    },
    SAVE_DEBOUNCE_MS,
    {
      leading: false,
      trailing: true,
    },
  );

  useEffect(() => {
    return () => {
      if (!isMountedRef.current && !saveOnUnmountRef.current) {
        return;
      }
      // save before unmounting.  This is very important since if a new reply comes in,
      // then the input component gets unmounted, then remounted BELOW the reply.
      // Note: it is still slightly annoying, due to loss of focus... however, data
      // loss is NOT ok, whereas loss of focus is.
      const input = currentInputRef.current;
      if (!input || syncdb == null) {
        return;
      }
      try {
        if (
          syncdb.get_one({
            event: "draft",
            sender_id,
            date,
          }) == null
        ) {
          return;
        }
      } catch {
        // sometimes syncdb.get_one throws
        return;
      }
      syncdb.set({
        event: "draft",
        sender_id,
        input,
        date, // it's a primary key so can't use this to represent when user last edited this; use other date for editing past chats.
        active: Date.now(),
      });
      syncdb.commit();
    };
  }, [syncdb, sender_id, date]);

  useEffect(() => {
    if (syncdb == null) return;
    const onSyncdbChange = () => {
      const sender_id = redux.getStore("account").get_account_id();
      const x = syncdb.get_one({
        event: "draft",
        sender_id,
        date,
      });
      const input = (x as any)?.input ?? "";
      if (input != lastSavedRef.current) {
        setInput(input);
        currentInputRef.current = input;
        lastSavedRef.current = input;
      }
    };
    syncdb.on("change", onSyncdbChange);
    return () => {
      syncdb.removeListener("change", onSyncdbChange);
    };
  }, [syncdb, sender_id, date]);

  function getPlaceholder(): string {
    if (placeholder != null) return placeholder;
    const have_llm = redux
      .getStore("projects")
      .hasLanguageModelEnabled(project_id);
    return intl.formatMessage(
      {
        id: "chat.input.placeholder",
        defaultMessage: "Message (@mention)...",
      },
      {
        have_llm,
      },
    );
  }
  height;

  const hasInput = (input ?? "").trim().length > 0;

  return (
    <MarkdownInput
      autoFocus={autoFocus}
      saveDebounceMs={0}
      onFocus={onFocus}
      onBlur={onBlur}
      cacheId={cacheId}
      value={input}
      controlRef={controlRef}
      enableUpload={true}
      enableMentions={true}
      submitMentionsRef={submitMentionsRef}
      onChange={(input) => {
        currentInputRef.current = input;
        /* BUG: in Markdown mode this stops getting
        called after you paste in an image.  It works
        fine in Slate/Text mode. See
        https://github.com/sagemathinc/cocalc/issues/7728
        */
        setInput(input);
        saveChat(input);
      }}
      onShiftEnter={(input) => {
        setInput("");
        saveChat("");
        on_send(input);
      }}
      height={height}
      placeholder={getPlaceholder()}
      fontSize={fontSize}
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
      hideModeSwitch={!hasInput}
      modeSwitchStyle={{
        float: "right",
        position: "relative",
        marginBottom: "-5px",
      }}
    />
  );
}
