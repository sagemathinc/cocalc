import useAsyncEffect from "use-async-effect";
import { useCallback, useMemo, useRef, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { field_cmp } from "@cocalc/util/misc";
import type { DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";

export const BACKUPS = ".backups";

export interface BackupMeta {
  id: string;
  name: string; // display name (ISO string)
  mtime: number;
}

const CACHE_TTL_MS = 5*60_000;
const PREFETCH_LIMIT = 8;

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
  const requestId = useRef(0);
  const lastTick = useRef(0);
  const listingCache = useRef(
    new Map<string, { entries: DirectoryListingEntry[]; at: number }>(),
  );
  const inflight = useRef(new Map<string, Promise<DirectoryListingEntry[]>>());

  const refresh = useCallback(() => setTick((x) => x + 1), []);

  useAsyncEffect(async () => {
    if (!isBackupsPath(path)) {
      setListing(null);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    const force = tick !== lastTick.current;
    lastTick.current = tick;
    setListing(null);
    setError(null);
    try {
      const backups = await webapp_client.conat_client.hub.projects.getBackups({
        project_id,
        indexed_only: true,
      });
      if (requestId.current !== id) return;
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
        if (requestId.current !== id) return;
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
      const cacheKey = `${backup.id}:${subpath}`;
      const cached = !force ? readCache(cacheKey) : null;
      if (cached) {
        setListing(sortEntries(cached));
      }
      const entriesRaw = await listBackupFiles({
        key: cacheKey,
        backup_id: backup.id,
        subpath,
        force,
      });
      if (requestId.current !== id) return;
      const entries = sortEntries(entriesRaw);
      if (requestId.current !== id) return;
      setListing(entries);
      setError(null);
      prefetchSubdirs(backup.id, subpath, entries);
    } catch (err) {
      if (requestId.current !== id) return;
      setError(err);
      setListing(null);
    }
  }, [project_id, path, sortField, sortDirection, tick]);

  function sortEntries(entries: DirectoryListingEntry[]): DirectoryListingEntry[] {
    const sorted = [...entries];
    sorted.sort(field_cmp(sortField));
    if (sortDirection === "desc") sorted.reverse();
    return sorted;
  }

  function readCache(key: string): DirectoryListingEntry[] | null {
    const cached = listingCache.current.get(key);
    if (!cached) return null;
    if (Date.now() - cached.at > CACHE_TTL_MS) {
      listingCache.current.delete(key);
      return null;
    }
    return cached.entries;
  }

  async function listBackupFiles({
    key,
    backup_id,
    subpath,
    force,
  }: {
    key: string;
    backup_id: string;
    subpath: string;
    force: boolean;
  }): Promise<DirectoryListingEntry[]> {
    if (!force) {
      const cached = readCache(key);
      if (cached) return cached;
    }
    const existing = inflight.current.get(key);
    if (existing) return await existing;
    const promise = (async () => {
      const raw =
        (await webapp_client.conat_client.hub.projects.getBackupFiles({
          project_id,
          id: backup_id,
          path: subpath,
        })) ?? [];
      const entries = raw.map(({ name, isDir, mtime, size }) => ({
        name,
        isDir,
        mtime,
        size,
      }));
      listingCache.current.set(key, { entries, at: Date.now() });
      return entries;
    })();
    inflight.current.set(key, promise);
    try {
      return await promise;
    } finally {
      inflight.current.delete(key);
    }
  }

  function prefetchSubdirs(
    backupId: string,
    basePath: string,
    entries: DirectoryListingEntry[],
  ) {
    const subdirs = entries.filter((entry) => entry.isDir).slice(0, PREFETCH_LIMIT);
    if (!subdirs.length) return;
    for (const entry of subdirs) {
      const subpath = basePath ? `${basePath}/${entry.name}` : entry.name;
      const key = `${backupId}:${subpath}`;
      if (readCache(key) || inflight.current.has(key)) continue;
      void listBackupFiles({
        key,
        backup_id: backupId,
        subpath,
        force: false,
      }).catch(() => undefined);
    }
  }

  return useMemo(
    () => ({ listing, error, refresh }),
    [listing, error, refresh],
  );
}
