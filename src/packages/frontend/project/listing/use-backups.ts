import useAsyncEffect from "use-async-effect";
import { useCallback, useMemo, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { field_cmp } from "@cocalc/util/misc";
import type { DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";

export const BACKUPS = ".backups";

export interface BackupMeta {
  id: string;
  name: string; // display name (ISO string)
  mtime: number;
}

export function isBackupsPath(path: string) {
  return path === BACKUPS || path.startsWith(`${BACKUPS}/`);
}

export default function useBackupsListing({
  project_id,
  path,
  sortField = "name",
  sortDirection = "asc",
}: {
  project_id: string;
  path: string;
  sortField?: "name" | "mtime" | "size" | "type";
  sortDirection?: "asc" | "desc";
}): {
  listing: DirectoryListingEntry[] | null;
  error: any;
  refresh: () => void;
} {
  const [listing, setListing] = useState<DirectoryListingEntry[] | null>(null);
  const [error, setError] = useState<any>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  useAsyncEffect(async () => {
    if (!isBackupsPath(path)) {
      setListing(null);
      setError(null);
      return;
    }
    try {
      const backups = await webapp_client.conat_client.hub.projects.getBackups({
        project_id,
      });
      const meta: BackupMeta[] = backups.map(({ id, time }) => ({
        id,
        mtime: new Date(time).getTime(),
        name: new Date(time).toISOString(),
      }));

      // root .backups listing
      const parts = path.split("/").filter(Boolean);
      if (parts.length === 1) {
        const entries: DirectoryListingEntry[] = meta.map(({ name, mtime }) => {
          return {
            name,
            mtime,
            size: 0,
            isDir: true,
          };
        });
        entries.sort(field_cmp(sortField));
        if (sortDirection === "desc") entries.reverse();
        setListing(entries);
        setError(null);
        return;
      }

      // path inside a specific backup
      const backupName = parts[1];
      const backup =
        meta.find((b) => b.name === backupName) ??
        meta.find((b) => b.id === backupName);
      if (!backup) {
        throw new Error(`backup '${backupName}' not found`);
      }
      const subpath = parts.slice(2).join("/");
      const entriesRaw: { name: string; isDir: boolean; mtime: number; size: number }[] =
        (await webapp_client.conat_client.hub.projects.getBackupFiles({
          project_id,
          id: backup.id,
          path: subpath,
        })) ?? [];
      const entries = entriesRaw.map(({ name, isDir, mtime, size }) => ({
        name,
        isDir,
        mtime,
        size,
      }));
      entries.sort(field_cmp(sortField));
      if (sortDirection === "desc") entries.reverse();
      setListing(entries);
      setError(null);
    } catch (err) {
      setError(err);
      setListing(null);
    }
  }, [project_id, path, sortField, sortDirection, tick]);

  return useMemo(
    () => ({ listing, error, refresh }),
    [listing, error, refresh],
  );
}
