/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Button,
  Descriptions,
  Modal,
  Popconfirm,
  Radio,
  Space,
  Tooltip,
  message,
} from "antd";
import immutable from "immutable";
import useAsyncEffect from "use-async-effect";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import {
  ACTION_BUTTONS_DIR,
  ACTION_BUTTONS_FILE,
  ACTION_BUTTONS_MULTI,
} from "@cocalc/frontend/project/explorer/action-utils";
import type {
  DirectoryListing,
  DirectoryListingEntry,
} from "@cocalc/frontend/project/explorer/types";
import { FileActionsDropdown } from "@cocalc/frontend/project/explorer/file-actions-dropdown";
import { human_readable_size, path_split, plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PANEL_STYLE_BOTTOM, PANEL_STYLE_TOP } from "./consts";
import { useSingleFile } from "./utils";
import {
  BACKUPS,
  BackupMeta,
  isBackupsPath,
} from "@cocalc/frontend/project/listing/use-backups";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import path from "path";
import React, { useMemo, useState } from "react";

interface FilesSelectedControlsProps {
  checked_files: immutable.Set<string>;
  directoryFiles: DirectoryListing;
  getFile: (path: string) => DirectoryListingEntry | undefined;
  mode: "top" | "bottom";
  project_id: string;
  showFileSharingDialog(file): void;
  open: (
    e: React.MouseEvent | React.KeyboardEvent,
    index: number,
    skip?: boolean,
  ) => void;
  activeFile: DirectoryListingEntry | null;
  publicFiles: Set<string>;
  refreshBackups?: () => void;
}

export function FilesSelectedControls({
  checked_files,
  directoryFiles,
  getFile,
  mode,
  open,
  project_id,
  showFileSharingDialog,
  activeFile,
  publicFiles,
  refreshBackups,
}: FilesSelectedControlsProps) {
  const current_path = useTypedRedux({ project_id }, "current_path");
  const actions = useActions({ project_id });
  const inBackups = isBackupsPath(current_path ?? "");

  const singleFile = useSingleFile({
    checked_files,
    activeFile,
    getFile,
    directoryFiles,
  });
  // Backups support
  const [backupsMeta, setBackupsMeta] = useState<BackupMeta[] | null>(null);
  const [backupsErr, setBackupsErr] = useState<any>(null);
  const [backupsLoading, setBackupsLoading] = useState<boolean>(false);
  const [backupsTick, setBackupsTick] = useState(0);
  const [restoreOpen, setRestoreOpen] = useState<boolean>(false);
  const [restoreMode, setRestoreMode] = useState<"original" | "scratch">(
    "original",
  );
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);
  const [restoreError, setRestoreError] = useState<any>(null);

  useAsyncEffect(async () => {
    if (!inBackups || !project_id) return;
    try {
      setBackupsLoading(true);
      setBackupsErr(null);
      const backups = await webapp_client.conat_client.hub.projects.getBackups({
        project_id,
        indexed_only: true,
      });
      setBackupsMeta(
        backups.map(({ id, time }) => ({
          id,
          name: new Date(time).toISOString(),
          mtime: new Date(time).getTime(),
        })),
      );
    } catch (err) {
      setBackupsErr(err);
    } finally {
      setBackupsLoading(false);
    }
  }, [inBackups, project_id, current_path, backupsTick]);

  interface BackupSelection {
    id: string;
    name: string;
    paths: string[];
  }

  const backupContext = useMemo(() => {
    if (!inBackups) return { mode: "none" as const, entries: [] as any[] };
    if (backupsLoading)
      return { mode: "loading" as const, entries: [] as BackupSelection[] };
    if (backupsErr)
      return { mode: "error" as const, entries: [], err: backupsErr };
    if (!backupsMeta)
      return { mode: "loading" as const, entries: [] as BackupSelection[] };

    const parts = (current_path ?? "").split("/").filter(Boolean);
    if (parts.length === 0 || parts[0] !== BACKUPS) {
      return { mode: "none" as const, entries: [] as BackupSelection[] };
    }

    const findBackup = (name: string) =>
      backupsMeta.find(
        (b) => b.name === name || b.id === name || b.id.startsWith(name),
      );

    if (parts.length === 1) {
      const names = Array.from(checked_files)
        .filter((p) => p.startsWith(`${BACKUPS}/`))
        .map((p) => p.slice(BACKUPS.length + 1).split("/")[0])
        .filter(Boolean);
      const entries: BackupSelection[] = [];
      for (const name of new Set(names)) {
        const backup = findBackup(name);
        if (backup) {
          entries.push({ id: backup.id, name: backup.name, paths: [""] });
        }
      }
      return { mode: "root" as const, entries };
    }

    const backupName = parts[1];
    const backup = findBackup(backupName);
    if (!backup) {
      return {
        mode: "error" as const,
        entries: [],
        err: new Error(`backup '${backupName}' not found`),
      };
    }
    const subpath = parts.slice(2).join("/");
    const selected = Array.from(checked_files)
      .filter(
        (p) => p === current_path || p.startsWith(`${current_path ?? ""}/`),
      )
      .map((p) =>
        p === current_path
          ? ""
          : p.slice((current_path?.length ?? 0) + 1).replace(/^\/+/, ""),
      )
      .filter(Boolean);
    const paths =
      selected.length === 0
        ? [subpath]
        : selected.map((name) =>
            subpath ? path.posix.join(subpath, name) : name,
          );
    return {
      mode: "inside" as const,
      entries: [{ id: backup.id, name: backup.name, paths }],
    };
  }, [
    inBackups,
    backupsLoading,
    backupsErr,
    backupsMeta,
    checked_files,
    current_path,
  ]);

  async function openAllSelectedFiles(e: React.MouseEvent) {
    e.stopPropagation();
    const skipDirs = checked_files.size > 1;
    for (const file of checked_files) {
      const basename = path_split(file).tail;
      const index = directoryFiles.findIndex((f) => f.name === basename);
      // skipping directories, because it makes no sense to flip through them rapidly
      if (skipDirs && getFile(file)?.isDir) {
        open(e, index, true);
        continue;
      }
      open(e, index);
      // wait 10ms to avoid opening all files at once
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  function renderFileInfoTop() {
    if (checked_files.size !== 0) return;

    let [nFiles, nDirs] = [0, 0];
    for (const f of directoryFiles) {
      if (f.isDir) {
        nDirs++;
      } else {
        nFiles++;
      }
    }

    return (
      <div style={{ color: COLORS.GRAY_M }}>
        <Icon name="files" /> {nFiles} {plural(nFiles, "file")}, {nDirs}{" "}
        {plural(nDirs, "folder")}
      </div>
    );
  }

  function renderFileInfoBottom() {
    if (singleFile != null) {
      const { size, mtime, isDir } = singleFile;
      const age = typeof mtime === "number" ? mtime : null;
      return (
        <Descriptions size="small" layout="horizontal" column={1}>
          {age ? (
            <Descriptions.Item label="Modified" span={1}>
              <TimeAgo date={new Date(age)} />
            </Descriptions.Item>
          ) : undefined}
          {isDir ? (
            <Descriptions.Item label="Contains">
              {size} {plural(size, "item")}
            </Descriptions.Item>
          ) : (
            <Descriptions.Item label="Size">
              {human_readable_size(size)}
            </Descriptions.Item>
          )}
          {publicFiles.has(singleFile.name) ? (
            <Descriptions.Item label="Published">
              <Button
                size="small"
                icon={<Icon name="share-square" />}
                onClick={(e) => {
                  e.stopPropagation();
                  showFileSharingDialog(singleFile);
                }}
              >
                configure
              </Button>
            </Descriptions.Item>
          ) : undefined}
        </Descriptions>
      );
    } else {
      // summary of multiple selected files
      if (checked_files.size > 1) {
        let [totSize, startDT, endDT] = [0, new Date(0), new Date(0)];
        for (const f of checked_files) {
          const file = getFile(f);
          if (file == null) continue;
          const { size = 0, mtime, isDir } = file;
          totSize += isDir ? 0 : size;
          if (typeof mtime === "number") {
            const dt = new Date(mtime);
            if (startDT.getTime() === 0 || dt < startDT) startDT = dt;
            if (endDT.getTime() === 0 || dt > endDT) endDT = dt;
          }
        }

        return (
          <Descriptions size="small" layout="horizontal" column={1}>
            <Descriptions.Item label="Total size" span={1}>
              {human_readable_size(totSize)}
            </Descriptions.Item>
            {startDT.getTime() > 0 ? (
              <Descriptions.Item label="Modified" span={1}>
                <div>
                  <TimeAgo date={startDT} /> – <TimeAgo date={endDT} />
                </div>
              </Descriptions.Item>
            ) : undefined}
          </Descriptions>
        );
      }
    }
  }

  function renderFileInfo() {
    if (mode === "top") {
      return renderFileInfoTop();
    } else {
      return renderFileInfoBottom();
    }
  }

  function renderOpenFile() {
    if (checked_files.size === 0) return;
    return (
      <Tooltip
        title={
          checked_files.size === 1
            ? "Or double-click file in listing"
            : "Open all selected files"
        }
      >
        <Button type="primary" size="small" onClick={openAllSelectedFiles}>
          <Icon name="edit-filled" /> Edit
          {checked_files.size > 1 ? " all" : ""}
        </Button>
      </Tooltip>
    );
  }

  function renderBackupButtons() {
    if (!inBackups) return;
    const entries = (backupContext as any).entries as BackupSelection[];
    const err =
      backupContext.mode === "error"
        ? (backupContext as any).err
        : undefined;
    const disabled =
      backupContext.mode === "loading" ||
      backupContext.mode === "error" ||
      entries.length === 0;
    const onRestore = async () => {
      if (!project_id || !entries || entries.length === 0) return;
      try {
        setRestoreLoading(true);
        setRestoreError(null);
        for (const entry of entries) {
          for (const rel of entry.paths) {
            const dest =
              restoreMode === "scratch"
                ? path.posix.join("/scratch", rel ?? "")
                : undefined;
            const op = await webapp_client.conat_client.hub.projects.restoreBackup({
              project_id,
              id: entry.id,
              path: rel || undefined,
              dest,
            });
            actions?.trackRestoreOp?.(op);
          }
        }
        message.success("Restore started");
        actions?.open_directory?.(current_path, false);
        setRestoreOpen(false);
      } catch (err) {
        setRestoreError(err);
      } finally {
        setRestoreLoading(false);
      }
    };

    const onDelete = async () => {
      if (!project_id || !entries || entries.length === 0) return;
      try {
        for (const entry of entries) {
          await webapp_client.conat_client.hub.projects.deleteBackup({
            project_id,
            id: entry.id,
          });
        }
        message.success("Backup deleted");
        refreshBackups?.();
        setBackupsTick((value) => value + 1);
        actions?.open_directory?.(current_path, false);
      } catch (err) {
        message.error(err?.message ?? `${err}`);
      }
    };

    return (
      <>
        <Space direction="horizontal" wrap>
          {err ? (
            <div style={{ color: "#c00" }}>{err?.message ?? `${err}`}</div>
          ) : null}
          <Button
            size="small"
            type="primary"
            disabled={disabled}
            onClick={() => setRestoreOpen(true)}
          >
            <Icon name="undo" /> Restore
          </Button>
          {backupContext.mode === "root" ? (
            <Popconfirm
              title="Delete backup"
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={onDelete}
              disabled={entries.length === 0}
            >
              <Button
                size="small"
                danger
                disabled={entries.length === 0}
                icon={<Icon name="trash" />}
              >
                Delete
              </Button>
            </Popconfirm>
          ) : null}
        </Space>
        <Modal
          open={restoreOpen}
          onCancel={() => setRestoreOpen(false)}
          onOk={onRestore}
          confirmLoading={restoreLoading}
          okText="Restore"
          title="Restore backup"
        >
          <p style={{ marginBottom: 8 }}>
            Restore selected paths from backup.
          </p>
          <Radio.Group
            value={restoreMode}
            onChange={(e) => setRestoreMode(e.target.value)}
          >
            <Space direction="vertical">
              <Radio value="original">
                Restore to original location (overwrite)
              </Radio>
              <Radio value="scratch">
                Restore under /scratch/… to avoid overwriting
              </Radio>
            </Space>
          </Radio.Group>
          {restoreError ? (
            <div style={{ color: "#c00", marginTop: 8 }}>
              {restoreError?.message ?? `${restoreError}`}
            </div>
          ) : null}
        </Modal>
      </>
    );
  }

  function renderButtons(names) {
    if (inBackups) {
      return renderBackupButtons();
    }
    if (mode === "top" && checked_files.size === 0) return;

    return (
      <Space direction="horizontal" wrap>
        {checked_files.size > 0 ? renderOpenFile() : undefined}
        <FileActionsDropdown
          names={names}
          current_path={current_path ?? ""}
          actions={actions}
          label="Actions"
          size="small"
          hideFlyout
          activateFilesTab
        />
      </Space>
    );
  }

  return (
    <Space
      direction="vertical"
      size="small"
      style={mode === "top" ? PANEL_STYLE_TOP : PANEL_STYLE_BOTTOM}
    >
      {singleFile
        ? singleFile.isDir
          ? renderButtons(ACTION_BUTTONS_DIR)
          : renderButtons(ACTION_BUTTONS_FILE.filter((n) => n !== "download"))
        : checked_files.size > 1
          ? renderButtons(ACTION_BUTTONS_MULTI)
          : undefined}
      {renderFileInfo()}
    </Space>
  );
}
