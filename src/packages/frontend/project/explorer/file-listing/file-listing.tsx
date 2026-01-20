/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show a file listing.

// cSpell:ignore issymlink

import { Alert, Button, Spin, message } from "antd";
import * as immutable from "immutable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VirtuosoHandle } from "react-virtuoso";
import { posix } from "path";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import StatefulVirtuoso from "@cocalc/frontend/components/stateful-virtuoso";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { path_to_file, rowBackground } from "@cocalc/util/misc";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import { BACKUPS } from "@cocalc/frontend/project/listing/use-backups";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import FindRestoreModal from "@cocalc/frontend/project/find/restore-modal";
import { FileRow } from "./file-row";
import { ListingHeader } from "./listing-header";
import NoFiles from "./no-files";
import { TERM_MODE_CHAR } from "./utils";
import { type DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";

interface Props {
  actions: ProjectActions;
  active_file_sort: { column_name: string; is_descending: boolean };
  listing: DirectoryListingEntry[];
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  project_id: string;
  shiftIsDown: boolean;
  configuration_main?: MainConfiguration;
  isRunning?: boolean; // true if this project is running
  publicFiles: Set<string>;
  sort_by: (column_name: string) => void;
}

export function FileListing({
  actions,
  active_file_sort,
  listing,
  checked_files,
  current_path,
  project_id,
  shiftIsDown,
  configuration_main,
  file_search = "",
  publicFiles,
  sort_by,
}: Props) {
  const selected_file_index =
    useTypedRedux({ project_id }, "selected_file_index") ?? 0;
  const name = actions.name;
  const openFiles = new Set<string>(
    useTypedRedux({ project_id }, "open_files_order")?.toJS() ?? [],
  );
  const [restoreTarget, setRestoreTarget] = useState<{
    kind: "snapshot" | "backup";
    name: string;
    path: string;
    isDir: boolean;
  } | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    loading?: boolean;
    error?: string | null;
    content?: string;
    truncated?: boolean;
  } | null>(null);
  const previewRequestRef = useRef(0);
  const backupIdRef = useRef<string | null>(null);
  const backupNameRef = useRef<string | null>(null);

  const specialContext = useMemo(() => {
    if (current_path === SNAPSHOTS || current_path.startsWith(`${SNAPSHOTS}/`)) {
      const parts = current_path.split("/").filter(Boolean);
      if (parts.length < 2) {
        return { kind: "snapshot" as const, name: null, prefix: SNAPSHOTS };
      }
      return {
        kind: "snapshot" as const,
        name: parts[1],
        prefix: `${SNAPSHOTS}/${parts[1]}`,
      };
    }
    if (current_path === BACKUPS || current_path.startsWith(`${BACKUPS}/`)) {
      const parts = current_path.split("/").filter(Boolean);
      if (parts.length < 2) {
        return { kind: "backup" as const, name: null, prefix: BACKUPS };
      }
      return {
        kind: "backup" as const,
        name: parts[1],
        prefix: `${BACKUPS}/${parts[1]}`,
      };
    }
    return null;
  }, [current_path]);

  const handleOpenSpecial = useCallback(
    (fullPath: string, isDir: boolean) => {
      if (isDir || !specialContext?.name) return false;
      const prefix = specialContext.prefix;
      if (!fullPath.startsWith(`${prefix}/`)) return false;
      const relative = fullPath.slice(prefix.length + 1);
      if (!relative) return false;
      setRestoreError(null);
      setRestoreTarget({
        kind: specialContext.kind,
        name: specialContext.name,
        path: relative,
        isDir,
      });
      return true;
    },
    [specialContext],
  );

  function renderRow(index, file) {
    const checked = checked_files.has(path_to_file(current_path, file.name));
    const color = rowBackground({ index, checked });

    return (
      <FileRow
        {...file}
        isOpen={openFiles.has(path_to_file(current_path, file.name))}
        isPublic={publicFiles.has(file.name)}
        color={color}
        checked={checked}
        selected={
          index == selected_file_index && file_search[0] != TERM_MODE_CHAR
        }
        key={index}
        current_path={current_path}
        actions={actions}
        no_select={shiftIsDown}
        listing={listing}
        onOpenSpecial={handleOpenSpecial}
      />
    );
  }

  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const lastSelectedFileIndexRef = useRef<undefined | number>(
    selected_file_index,
  );

  useEffect(() => {
    if (selected_file_index == null) {
      return;
    }
    if (lastSelectedFileIndexRef.current == selected_file_index - 1) {
      virtuosoRef.current?.scrollIntoView({ index: selected_file_index + 1 });
    } else {
      virtuosoRef.current?.scrollIntoView({ index: selected_file_index });
    }
    lastSelectedFileIndexRef.current = selected_file_index;
  }, [selected_file_index]);

  const resolveBackupId = useCallback(
    async (backupName: string, indexedOnly: boolean) => {
      if (backupIdRef.current && backupNameRef.current === backupName) {
        return backupIdRef.current;
      }
      const backups =
        await webapp_client.conat_client.hub.projects.getBackups({
          project_id,
          indexed_only: indexedOnly ? true : undefined,
        });
      const match = backups.find(
        (backup) => new Date(backup.time).toISOString() === backupName,
      );
      if (!match) {
        if (indexedOnly) {
          return await resolveBackupId(backupName, false);
        }
        throw new Error("Backup not available on this host.");
      }
      backupIdRef.current = match.id;
      backupNameRef.current = backupName;
      return match.id;
    },
    [project_id],
  );

  useEffect(() => {
    if (!restoreTarget) {
      setPreview(null);
      backupIdRef.current = null;
      backupNameRef.current = null;
      return;
    }
    if (restoreTarget.isDir) {
      setPreview({ error: "Directory preview is not available." });
      return;
    }
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreview({ loading: true });
    const load = async () => {
      if (restoreTarget.kind === "snapshot") {
        const resp =
          await webapp_client.conat_client.hub.projects.getSnapshotFileText({
            project_id,
            snapshot: restoreTarget.name,
            path: restoreTarget.path,
          });
        return resp;
      }
      const backupId = await resolveBackupId(restoreTarget.name, true);
      return await webapp_client.conat_client.hub.projects.getBackupFileText({
        project_id,
        id: backupId,
        path: restoreTarget.path,
      });
    };
    load()
      .then((resp) => {
        if (previewRequestRef.current !== requestId) return;
        setPreview({
          loading: false,
          content: resp.content,
          truncated: resp.truncated,
        });
      })
      .catch((err) => {
        if (previewRequestRef.current !== requestId) return;
        setPreview({ loading: false, error: `${err}` });
      });
  }, [project_id, resolveBackupId, restoreTarget]);

  const performRestore = useCallback(
    async (mode: "original" | "scratch") => {
      if (!restoreTarget) return;
      try {
        setRestoreLoading(true);
        setRestoreError(null);
        if (restoreTarget.kind === "snapshot") {
          const snapshotPath = posix.join(
            SNAPSHOTS,
            restoreTarget.name,
            restoreTarget.path,
          );
          const dest =
            mode === "scratch"
              ? posix.join("/scratch", restoreTarget.path)
              : restoreTarget.path;
          const parent = posix.dirname(dest);
          const fs = actions.fs();
          if (parent && parent !== "." && parent !== "/") {
            await fs.mkdir(parent, { recursive: true });
          }
          await fs.cp(snapshotPath, dest, {
            recursive: false,
            preserveTimestamps: true,
            reflink: true,
          });
          message.success("Restore completed");
          setRestoreTarget(null);
          return;
        }
        const backupId = await resolveBackupId(restoreTarget.name, false);
        const dest =
          mode === "scratch"
            ? posix.join("/scratch", restoreTarget.path)
            : undefined;
        const op =
          await webapp_client.conat_client.hub.projects.restoreBackup({
            project_id,
            id: backupId,
            path: restoreTarget.path,
            dest,
          });
        actions.trackRestoreOp?.(op);
        message.success("Restore started");
        setRestoreTarget(null);
      } catch (err) {
        setRestoreError(`${err}`);
      } finally {
        setRestoreLoading(false);
      }
    },
    [actions, project_id, resolveBackupId, restoreTarget],
  );

  const openSpecialDirectory = useCallback(() => {
    if (!restoreTarget) return;
    const dir = restoreTarget.path.includes("/")
      ? posix.dirname(restoreTarget.path)
      : "";
    const root = restoreTarget.kind === "snapshot" ? SNAPSHOTS : BACKUPS;
    const target = posix.join(root, restoreTarget.name, dir);
    actions.open_directory(target, true, true);
    setRestoreTarget(null);
  }, [actions, restoreTarget]);

  if (listing == null) {
    return <Spin delay={500} />;
  }

  function renderRows() {
    return (
      <StatefulVirtuoso
        ref={virtuosoRef}
        cacheId={`${name}${current_path}`}
        increaseViewportBy={2000}
        totalCount={listing.length}
        initialTopMostItemIndex={0}
        itemContent={(index) => {
          const file = listing[index];
          if (file == null) {
            // shouldn't happen
            return <div key={index} style={{ height: "1px" }}></div>;
          }
          return renderRow(index, file);
        }}
      />
    );
  }

  function render_no_files() {
    if (listing.length !== 0) {
      return;
    }
    if (file_search[0] === TERM_MODE_CHAR) {
      return;
    }

    return (
      <NoFiles
        name={name}
        current_path={current_path}
        actions={actions}
        file_search={file_search}
        project_id={project_id}
        configuration_main={configuration_main}
      />
    );
  }

  return (
    <>
      <div
        className="smc-vfill"
        style={{
          flex: "1 0 auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {current_path === SNAPSHOTS ||
        current_path.startsWith(SNAPSHOTS + "/") ? (
          <Alert
            style={{ marginBottom: 8 }}
            type="info"
            showIcon
            message="Snapshots vs Backups"
            description={
              <>
                Snapshots in this folder are fast local readonly filesystem
                checkpoints on the current workspace host, which you can directly
                open or copy. Backups are durable, deduplicated archives stored
                separately, which can only be restored. Use Backups to restore
                files that might be missing from snapshots or if a workspace host
                is not available.
              </>
            }
            action={
              <Button
                size="small"
                onClick={() => actions.open_directory(".backups")}
              >
                Open Backups
              </Button>
            }
          />
        ) : current_path === BACKUPS ||
          current_path.startsWith(BACKUPS + "/") ? (
          <Alert
            style={{ marginBottom: 8 }}
            type="info"
            showIcon
            message="Backups vs Snapshots"
            description={
              <>
                Backups are durable, deduplicated archives stored separately,
                which can only be restored. Snapshots are fast local readonly
                filesystem checkpoints on the current workspace host that you can
                open or copy directly. Use Snapshots for quick local recovery.
              </>
            }
            action={
              <Button
                size="small"
                onClick={() => actions.open_directory(SNAPSHOTS)}
              >
                Open Snapshots
              </Button>
            }
          />
        ) : null}
        <ListingHeader active_file_sort={active_file_sort} sort_by={sort_by} />
        {listing.length > 0 ? renderRows() : render_no_files()}
      </div>
      <FindRestoreModal
        open={Boolean(restoreTarget)}
        title={
          restoreTarget?.kind === "backup"
            ? "Backup selection"
            : "Snapshot selection"
        }
        path={restoreTarget?.path ?? ""}
        openLabel={
          restoreTarget?.kind === "backup"
            ? "Open backup directory"
            : "Open snapshot directory"
        }
        loading={restoreLoading}
        error={restoreError}
        preview={preview ?? undefined}
        onRestoreOriginal={() => void performRestore("original")}
        onRestoreScratch={() => void performRestore("scratch")}
        onOpenDirectory={openSpecialDirectory}
        onCancel={() => setRestoreTarget(null)}
      />
    </>
  );
}
