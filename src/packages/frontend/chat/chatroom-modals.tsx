/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input, Modal, Space, message as antdMessage } from "antd";
import { useEffect, useMemo, useState } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";
import type { ChatActions } from "./actions";

export interface ChatRoomModalHandlers {
  openRenameModal: (
    threadKey: string,
    currentLabel: string,
    useCurrentLabel: boolean,
  ) => void;
  openExportModal: (threadKey: string, label: string, isAI: boolean) => void;
  openForkModal: (threadKey: string, label: string, isAI: boolean) => void;
}

interface ChatRoomModalsProps {
  actions: ChatActions;
  path: string;
  onHandlers?: (handlers: ChatRoomModalHandlers) => void;
}

export function ChatRoomModals({ actions, path, onHandlers }: ChatRoomModalsProps) {
  const [renamingThread, setRenamingThread] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [exportThread, setExportThread] = useState<{
    key: string;
    label: string;
    isAI: boolean;
  } | null>(null);
  const [exportFilename, setExportFilename] = useState<string>("");
  const [forkThread, setForkThread] = useState<{
    key: string;
    label: string;
    isAI: boolean;
  } | null>(null);
  const [forkName, setForkName] = useState<string>("");

  const openRenameModal = (
    threadKey: string,
    currentLabel: string,
    useCurrentLabel: boolean,
  ) => {
    setRenamingThread(threadKey);
    setRenameValue(useCurrentLabel ? currentLabel : "");
  };

  const closeRenameModal = () => {
    setRenamingThread(null);
    setRenameValue("");
  };

  const handleRenameSave = () => {
    if (!renamingThread) return;
    if (actions?.renameThread == null) {
      antdMessage.error("Renaming chats is not available.");
      return;
    }
    const success = actions.renameThread(renamingThread, renameValue.trim());
    if (!success) {
      antdMessage.error("Unable to rename chat.");
      return;
    }
    antdMessage.success(
      renameValue.trim() ? "Chat renamed." : "Chat name reset to default.",
    );
    closeRenameModal();
  };

  const openExportModal = (threadKey: string, label: string, isAI: boolean) => {
    setExportThread({ key: threadKey, label, isAI });
  };

  const closeExportModal = () => {
    setExportThread(null);
  };

  const handleExportThread = async () => {
    if (!exportThread) return;
    if (!actions?.exportThreadToMarkdown) {
      antdMessage.error("Export is not available.");
      return;
    }
    const outputPath = exportFilename.trim();
    if (!outputPath) {
      antdMessage.error("Please enter a filename.");
      return;
    }
    try {
      await actions.exportThreadToMarkdown({
        threadKey: exportThread.key,
        path: outputPath,
      });
      antdMessage.success("Chat exported.");
      closeExportModal();
    } catch (err) {
      console.error("failed to export chat", err);
      antdMessage.error("Failed to export chat.");
    }
  };

  const openForkModal = (threadKey: string, label: string, isAI: boolean) => {
    setForkThread({ key: threadKey, label, isAI });
  };

  const closeForkModal = () => {
    setForkThread(null);
    setForkName("");
  };

  const handleForkThread = async () => {
    if (!forkThread) return;
    if (!actions?.forkThread) {
      antdMessage.error("Forking chats is not available.");
      return;
    }
    const title =
      forkName.trim() || `Fork of ${forkThread.label || "chat"}`.trim();
    try {
      await actions.forkThread({
        threadKey: forkThread.key,
        title,
        sourceTitle: forkThread.label,
        isAI: forkThread.isAI,
      });
      antdMessage.success("Chat forked.");
      closeForkModal();
    } catch (err) {
      console.error("failed to fork chat", err);
      antdMessage.error("Failed to fork chat.");
    }
  };

  const handlers = useMemo(
    () => ({ openRenameModal, openExportModal, openForkModal }),
    [],
  );

  useEffect(() => {
    onHandlers?.(handlers);
  }, [handlers, onHandlers]);

  useEffect(() => {
    if (!exportThread) return;
    const defaultPath = buildThreadExportPath(
      path,
      exportThread.key,
      exportThread.label,
    );
    setExportFilename(defaultPath);
  }, [exportThread, path]);

  useEffect(() => {
    if (!forkThread) return;
    const name = forkThread.label?.trim()
      ? `Fork of ${forkThread.label.trim()}`
      : "Fork of chat";
    setForkName(name);
  }, [forkThread]);

  return (
    <>
      <Modal
        title={
          exportThread?.label?.trim()
            ? `Export "${exportThread.label.trim()}"`
            : "Export chat"
        }
        open={exportThread != null}
        onCancel={closeExportModal}
        onOk={handleExportThread}
        okText="Export"
        destroyOnClose
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div>
            <div style={{ marginBottom: 4, color: COLORS.GRAY_D }}>
              Filename
            </div>
            <Input
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              onPressEnter={handleExportThread}
            />
          </div>
        </Space>
      </Modal>
      <Modal
        title="Rename chat"
        open={renamingThread != null}
        onCancel={closeRenameModal}
        onOk={handleRenameSave}
        okText="Save"
        destroyOnClose
      >
        <Input
          placeholder="Chat name"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRenameSave}
        />
      </Modal>
      <Modal
        title="Fork chat"
        open={forkThread != null}
        onCancel={closeForkModal}
        onOk={handleForkThread}
        okText="Fork"
        destroyOnClose
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <div>
            <div style={{ marginBottom: 4, color: COLORS.GRAY_D }}>
              New chat name
            </div>
            <Input
              value={forkName}
              onChange={(e) => setForkName(e.target.value)}
              onPressEnter={handleForkThread}
            />
          </div>
          <div style={{ color: COLORS.GRAY_D, fontSize: 12 }}>
            This creates a new thread and links it to the current one. For
            Codex threads, the agent session will be forked with the same
            context.
          </div>
        </Space>
      </Modal>
    </>
  );
}

function buildThreadExportPath(
  chatPath: string | undefined,
  threadKey: string,
  label?: string,
): string {
  const base = (chatPath || "chat").replace(/\/+$/, "");
  const slug = slugifyLabel(label);
  const suffix = slug || threadKey || "thread";
  return `${base}.${suffix}.md`;
}

function slugifyLabel(label?: string): string {
  if (!label) return "";
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug;
}
