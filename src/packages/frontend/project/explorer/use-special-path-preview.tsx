import { message } from "antd";
import { posix } from "path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import { BACKUPS } from "@cocalc/frontend/project/listing/use-backups";
import FindRestoreModal from "@cocalc/frontend/project/find/restore-modal";

type RestoreTarget = {
  kind: "snapshot" | "backup";
  name: string;
  path: string;
  isDir: boolean;
};

export function useSpecialPathPreview({
  project_id,
  actions,
  current_path,
}: {
  project_id: string;
  actions?: ProjectActions | null;
  current_path?: string | null;
}) {
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
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

  const path = current_path ?? "";

  const specialContext = useMemo(() => {
    if (path === SNAPSHOTS || path.startsWith(`${SNAPSHOTS}/`)) {
      const parts = path.split("/").filter(Boolean);
      if (parts.length < 2) {
        return { kind: "snapshot" as const, name: null, prefix: SNAPSHOTS };
      }
      return {
        kind: "snapshot" as const,
        name: parts[1],
        prefix: `${SNAPSHOTS}/${parts[1]}`,
      };
    }
    if (path === BACKUPS || path.startsWith(`${BACKUPS}/`)) {
      const parts = path.split("/").filter(Boolean);
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
  }, [path]);

  const onOpenSpecial = useCallback(
    (fullPath: string, isDir: boolean) => {
      if (!actions || isDir || !specialContext?.name) return false;
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
    [actions, specialContext],
  );

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
        return await webapp_client.conat_client.hub.projects.getSnapshotFileText(
          {
            project_id,
            snapshot: restoreTarget.name,
            path: restoreTarget.path,
          },
        );
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
      if (!restoreTarget || !actions) return;
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
        const op = await webapp_client.conat_client.hub.projects.restoreBackup({
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
    if (!restoreTarget || !actions) return;
    const dir = restoreTarget.path.includes("/")
      ? posix.dirname(restoreTarget.path)
      : "";
    const root = restoreTarget.kind === "snapshot" ? SNAPSHOTS : BACKUPS;
    const target = posix.join(root, restoreTarget.name, dir);
    actions.open_directory(target, true, true);
    setRestoreTarget(null);
  }, [actions, restoreTarget]);

  const modal = (
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
  );

  return { onOpenSpecial, modal };
}
