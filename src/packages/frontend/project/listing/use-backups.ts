import useAsyncEffect from "use-async-effect";
import { useCallback, useMemo, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { field_cmp } from "@cocalc/util/misc";
import type { DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";

const BACKUPS = ".backups";

interface BackupMeta {
  id: string;
  name: string; // display name (ISO string)
  mtime: number;
}

function isBackupsPath(path: string) {
  return path === BACKUPS || path.startsWith(`${BACKUPS}/`);
}

function normalizePath(path: string) {
  // remove leading/trailing slashes
  return path.replace(/^\/+/, "").replace(/\/+$/, "");
}

function buildListing({
  paths,
  prefix,
  mtime,
}: {
  paths: string[];
  prefix: string;
  mtime: number;
}): DirectoryListingEntry[] {
  const entries = new Map<string, DirectoryListingEntry>();
  const normalizedPrefix = prefix ? `${normalizePath(prefix)}/` : "";
  for (const raw of paths) {
    const path = normalizePath(raw);
    if (normalizedPrefix && !path.startsWith(normalizedPrefix)) continue;
    const remainder = normalizedPrefix
      ? path.slice(normalizedPrefix.length)
      : path;
    if (!remainder) continue;
    const [name, ...rest] = remainder.split("/");
    const existing = entries.get(name);
    const isDir = rest.length > 0;
    const entry: DirectoryListingEntry = {
      name,
      mtime,
      size: 0,
      isDir: isDir || existing?.isDir,
    };
    entries.set(name, { ...existing, ...entry });
  }
  const listing = Array.from(entries.values());
  listing.sort(field_cmp("name"));
  return listing;
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
      const pathsRaw: string[] =
        (await webapp_client.conat_client.hub.projects.getBackupFiles({
          project_id,
          id: backup.id,
          path: subpath,
        })) ?? [];
      let paths = pathsRaw;
      if (
        subpath &&
        !pathsRaw.every(
          (p) => p.startsWith(subpath + "/") || p === subpath,
        )
      ) {
        // rustic may return paths relative to the requested subpath; normalize
        paths = pathsRaw.map((p) =>
          p ? `${normalizePath(subpath)}/${normalizePath(p)}` : subpath,
        );
      }
      let entries = buildListing({
        paths,
        prefix: subpath,
        mtime: backup.mtime,
      });
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
