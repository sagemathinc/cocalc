/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Modal, message as antdMessage } from "antd";
import { useEffect, useMemo, useRef } from "@cocalc/frontend/app-framework";
import type { ChatActions } from "./actions";

export interface ChatRoomThreadActionHandlers {
  confirmDeleteThread: (threadKey: string, label?: string) => void;
}

interface ChatRoomThreadActionsProps {
  actions: ChatActions;
  selectedThreadKey: string | null;
  setSelectedThreadKey: (key: string | null) => void;
  onHandlers?: (handlers: ChatRoomThreadActionHandlers) => void;
}

export function ChatRoomThreadActions({
  actions,
  selectedThreadKey,
  setSelectedThreadKey,
  onHandlers,
}: ChatRoomThreadActionsProps) {
  const actionsRef = useRef(actions);
  const selectedThreadKeyRef = useRef(selectedThreadKey);
  const setSelectedThreadKeyRef = useRef(setSelectedThreadKey);

  useEffect(() => {
    actionsRef.current = actions;
    selectedThreadKeyRef.current = selectedThreadKey;
    setSelectedThreadKeyRef.current = setSelectedThreadKey;
  }, [actions, selectedThreadKey, setSelectedThreadKey]);

  const handlers = useMemo<ChatRoomThreadActionHandlers>(() => {
    return {
      confirmDeleteThread: (threadKey: string, label?: string) => {
        const performDeleteThread = () => {
          const currentActions = actionsRef.current;
          const currentSelected = selectedThreadKeyRef.current;
          const currentSetSelected = setSelectedThreadKeyRef.current;
          if (!currentActions?.deleteThread) {
            antdMessage.error("Deleting chats is not available.");
            return;
          }
          const deleted = currentActions.deleteThread(threadKey);
          if (deleted === 0) {
            antdMessage.info("This chat has no messages to delete.");
            return;
          }
          if (currentSelected === threadKey) {
            currentSetSelected(null);
          }
          antdMessage.success("Chat deleted.");
        };

        const trimmedLabel = (label ?? "").trim();
        const displayLabel =
          trimmedLabel.length > 0
            ? trimmedLabel.length > 120
              ? `${trimmedLabel.slice(0, 117)}...`
              : trimmedLabel
            : null;
        Modal.confirm({
          title: displayLabel ? `Delete chat "${displayLabel}"?` : "Delete chat?",
          content:
            "This removes all messages in this chat for everyone. This can only be undone using 'Edit --> Undo', or by browsing TimeTravel.",
          okText: "Delete",
          okType: "danger",
          cancelText: "Cancel",
          onOk: performDeleteThread,
        });
      },
    };
  }, []);

  useEffect(() => {
    onHandlers?.(handlers);
  }, [handlers, onHandlers]);

  return null;
}
