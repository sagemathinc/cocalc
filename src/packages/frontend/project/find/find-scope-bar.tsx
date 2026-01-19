import { Alert, Button, Input, Modal, Select, Space, Tooltip } from "antd";
import { dirname, join } from "path";
import { useCallback, useEffect, useMemo, useState } from "react";
import DirectorySelector from "@cocalc/frontend/project/directory-selector";
import { alert_message } from "@cocalc/frontend/alerts";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { type FindScopeMode } from "./types";

export function FindScopeBar({
  mode,
  project_id,
  currentPath,
  scopePath,
  scopeMode,
  scopePinned,
  history,
  onScopeModeChange,
  onScopePathChange,
  onScopePinnedChange,
}: {
  mode: "project" | "flyout";
  project_id: string;
  currentPath: string;
  scopePath: string;
  scopeMode: FindScopeMode;
  scopePinned: boolean;
  history: string[];
  onScopeModeChange: (mode: FindScopeMode) => void;
  onScopePathChange: (path: string) => void;
  onScopePinnedChange: (next: boolean) => void;
}) {
  const size = mode === "flyout" ? "small" : "middle";
  const fs = useMemo(
    () => webapp_client.conat_client.conat().fs({ project_id }),
    [project_id],
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState(scopePath);
  const [draftPath, setDraftPath] = useState(scopePath);
  const [gitLoading, setGitLoading] = useState(false);
  const [checkingPath, setCheckingPath] = useState(false);
  const [pathWarning, setPathWarning] = useState<{
    path: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (selectorOpen) {
      setPendingPath(scopePath);
    }
  }, [selectorOpen, scopePath]);

  useEffect(() => {
    setDraftPath(scopePath);
    if (pathWarning && pathWarning.path !== scopePath) {
      setPathWarning(null);
    }
  }, [scopePath, pathWarning]);

  const setHome = useCallback(() => {
    onScopeModeChange("home");
    onScopePathChange("");
    setPathWarning(null);
  }, [onScopeModeChange, onScopePathChange]);

  const setCurrent = useCallback(() => {
    onScopeModeChange("current");
    onScopePathChange(currentPath);
    setPathWarning(null);
  }, [onScopeModeChange, onScopePathChange, currentPath]);

  const setGitRoot = useCallback(async () => {
    setGitLoading(true);
    try {
      const root = await findGitRoot(fs, currentPath);
      if (!root) {
        alert_message({
          type: "warning",
          message: "No git root found in this path.",
        });
        return;
      }
      onScopeModeChange("git");
      onScopePathChange(root);
      setPathWarning(null);
    } finally {
      setGitLoading(false);
    }
  }, [fs, currentPath, onScopeModeChange, onScopePathChange]);

  const commitPath = useCallback(
    async (nextRaw: string) => {
      const trimmed = nextRaw.trim().replace(/^\/+/, "");
      if (trimmed === scopePath) return;
      if (!trimmed) {
        onScopeModeChange("home");
        onScopePathChange("");
        setPathWarning(null);
        return;
      }
      onScopeModeChange("custom");
      onScopePathChange(trimmed);
      setPathWarning(null);
      setCheckingPath(true);
      try {
        const ok = await fs.exists(trimmed);
        if (!ok) {
          setPathWarning({
            path: trimmed,
            message: `Path not found: ${trimmed}`,
          });
        }
      } catch (err) {
        setPathWarning({
          path: trimmed,
          message: `Could not verify path: ${err}`,
        });
      } finally {
        setCheckingPath(false);
      }
    },
    [fs, onScopeModeChange, onScopePathChange, scopePath],
  );

  return (
    <div>
      <div style={{ marginBottom: "8px" }}>
        <Space wrap>
          <strong>Find in</strong>
          <Input
            value={draftPath}
            allowClear
            placeholder="Home"
            size={size}
            style={{ width: mode === "flyout" ? 200 : 320 }}
            status={pathWarning ? "warning" : undefined}
            onChange={(e) => setDraftPath(e.target.value)}
            onPressEnter={() => commitPath(draftPath)}
            onBlur={() => commitPath(draftPath)}
          />
          <Tooltip title={scopePinned ? "Unpin path" : "Pin path"}>
            <Button
              size={size}
              type={scopePinned ? "primary" : "default"}
              onClick={() => onScopePinnedChange(!scopePinned)}
            >
              {scopePinned ? "Pinned" : "Pin"}
            </Button>
          </Tooltip>
          <Button
            size={size}
            type={scopeMode === "current" ? "primary" : "default"}
            onClick={setCurrent}
          >
            Current
          </Button>
          <Button
            size={size}
            type={scopeMode === "home" ? "primary" : "default"}
            onClick={setHome}
          >
            Home
          </Button>
          <Tooltip title="Nearest directory containing .git">
            <Button
              size={size}
              loading={gitLoading}
              type={scopeMode === "git" ? "primary" : "default"}
              onClick={setGitRoot}
            >
              Git root
            </Button>
          </Tooltip>
          <Button size={size} onClick={() => setSelectorOpen(true)}>
            Choose
          </Button>
          {history.length ? (
            <Select<string>
              size={size}
              style={{ minWidth: 180 }}
              placeholder="Recent paths"
              value={undefined}
              onChange={(value) => {
                onScopeModeChange("custom");
                onScopePathChange(value ?? "");
                setPathWarning(null);
              }}
              options={history.map((path) => ({
                value: path,
                label: path || "Home",
              }))}
            />
          ) : null}
        </Space>
      </div>
      {pathWarning ? (
        <Alert
          style={{ marginBottom: "8px" }}
          type="warning"
          showIcon
          message={pathWarning.message}
        />
      ) : null}
      {checkingPath ? (
        <Alert
          style={{ marginBottom: "8px" }}
          type="info"
          showIcon
          message="Checking path..."
        />
      ) : null}
      <Modal
        open={selectorOpen}
        destroyOnClose
        width={mode === "flyout" ? 640 : 860}
        title="Select Search Folder"
        okText="Use this folder"
        onOk={() => {
          onScopeModeChange("custom");
          onScopePathChange(pendingPath ?? "");
          setSelectorOpen(false);
        }}
        onCancel={() => setSelectorOpen(false)}
      >
        <DirectorySelector
          project_id={project_id}
          startingPath={pendingPath}
          onSelect={(path) => setPendingPath(path)}
          style={{ width: "100%" }}
          bodyStyle={{ maxHeight: 360 }}
          closable={false}
        />
      </Modal>
    </div>
  );
}

async function findGitRoot(
  fs: FilesystemClient,
  startPath: string,
): Promise<string | null> {
  let path = startPath;
  while (true) {
    const candidate = path ? join(path, ".git") : ".git";
    if (await fs.exists(candidate)) {
      return path;
    }
    if (!path) return null;
    const next = dirname(path);
    if (!next || next === path || next === ".") {
      path = "";
    } else {
      path = next;
    }
    if (!path) {
      if (await fs.exists(".git")) return "";
      return null;
    }
  }
}
