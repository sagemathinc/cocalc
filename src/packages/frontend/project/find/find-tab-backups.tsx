import { Alert, Button, Input, Radio, Space, Tooltip, message } from "antd";
import { join, posix } from "path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type VirtuosoGridHandle } from "react-virtuoso";
import { useActions } from "@cocalc/frontend/app-framework";
import { Loading, SearchInput } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { search_match, search_split } from "@cocalc/util/misc";
import { FindBackupRow, type BackupResult } from "./rows";
import { FindResultsGrid } from "./result-grid";
import { useFindTabState } from "./state";
import {
  type FindBackupsState,
  type FindPrefill,
  type SnapshotSearchMode,
} from "./types";
import { matchesScope, normalizeGlobQuery, stripDotSlash } from "./utils";
import FindRestoreModal from "./restore-modal";

const DEFAULT_STATE: FindBackupsState = {
  query: "",
  filter: "",
  mode: "files",
  hidden: false,
  caseSensitive: false,
};

function isHiddenPath(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith(".") && segment !== ".");
}

type BackupTimeValue =
  | Date
  | string
  | number
  | { seconds?: number | string; nanos?: number | string }
  | null
  | undefined;

function coerceDate(value: BackupTimeValue): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  if (value && typeof value === "object") {
    const seconds = Number(value.seconds);
    const nanos = Number(value.nanos ?? 0);
    if (!Number.isNaN(seconds)) {
      return new Date(seconds * 1000 + Math.floor(nanos / 1e6));
    }
  }
  return new Date(0);
}

function timeMs(date: Date): number {
  const ms = date.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function dedupeBackupResults(items: BackupResult[]): BackupResult[] {
  const output: BackupResult[] = [];
  const lastSig = new Map<string, string>();
  for (const item of items) {
    const signature = `${item.mtime ?? 0}:${item.size ?? 0}`;
    const prev = lastSig.get(item.path);
    if (prev === signature) continue;
    output.push(item);
    lastSig.set(item.path, signature);
  }
  return output;
}

export function BackupsTab({
  mode,
  scopePath,
  prefill,
  backupName,
}: {
  mode: "project" | "flyout";
  scopePath: string;
  prefill?: FindPrefill;
  backupName?: string;
}) {
  const fieldWidth = mode === "flyout" ? "100%" : "50%";
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const [state, setState] = useFindTabState(
    project_id,
    "find_backups_state",
    DEFAULT_STATE,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BackupResult[]>([]);
  const [backupIds, setBackupIds] = useState<string[] | undefined>();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupResult | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    loading?: boolean;
    error?: string | null;
    content?: string;
    truncated?: boolean;
  } | null>(null);
  const listRef = useRef<VirtuosoGridHandle>(null);
  const queryRef = useRef(state.query);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    queryRef.current = state.query;
  }, [state.query]);

  useEffect(() => {
    if (restoreTarget) {
      setRestoreError(null);
    }
  }, [restoreTarget]);

  useEffect(() => {
    if (!restoreTarget) {
      setPreview(null);
      return;
    }
    if (restoreTarget.isDir) {
      setPreview({ error: "Directory preview is not available." });
      return;
    }
    if (!restoreTarget.path) {
      setPreview({ error: "Directory preview is not available." });
      return;
    }
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreview({ loading: true });
    webapp_client.conat_client.hub.projects
      .getBackupFileText({
        project_id,
        id: restoreTarget.id,
        path: restoreTarget.path,
      })
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
  }, [project_id, restoreTarget]);

  useEffect(() => {
    let cancelled = false;
    const loadIds = async () => {
      if (!backupName) {
        setBackupIds(undefined);
        return;
      }
      try {
        const backups =
          await webapp_client.conat_client.hub.projects.getBackups({
            project_id,
            indexed_only: true,
          });
        const matched = backups.filter(
          (backup) =>
            new Date(backup.time).toISOString() === backupName,
        );
        if (!cancelled) {
          setBackupIds(matched.map((backup) => backup.id));
        }
      } catch (err) {
        if (!cancelled) {
          setBackupIds([]);
          setError(`${err}`);
        }
      }
    };
    void loadIds();
    return () => {
      cancelled = true;
    };
  }, [backupName, project_id]);

  const runSearch = useCallback(
    async (override?: string) => {
      const q = (override ?? state.query).trim();
      if (!q) {
        setResults([]);
        setError(null);
        return;
      }
      if (backupName && backupIds === undefined) {
        setResults([]);
        setError(null);
        return;
      }
      if (backupName && backupIds && backupIds.length === 0) {
        setResults([]);
        setError(`Backup ${backupName} not found on this host.`);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const normalized = normalizeGlobQuery(q);
        const payload = {
          project_id,
          glob: state.caseSensitive ? [normalized] : undefined,
          iglob: state.caseSensitive ? undefined : [normalized],
          ids: backupIds && backupIds.length ? backupIds : undefined,
        };
        const raw =
          await webapp_client.conat_client.hub.projects.findBackupFiles(
            payload,
          );
        const filtered = raw
          .map((item) => {
            const time = coerceDate(item.time);
            const timeIso = Number.isNaN(time.getTime())
              ? String(item.time ?? "")
              : time.toISOString();
            return {
              ...item,
              time,
              path: stripDotSlash(item.path),
              filter: `${item.path} ${item.id} ${timeIso}`,
            };
          })
          .filter((item) => matchesScope(item.path, scopePath))
          .filter((item) => state.hidden || !isHiddenPath(item.path));
        filtered.sort((a, b) => {
          const aTime = timeMs(a.time);
          const bTime = timeMs(b.time);
          if (aTime !== bTime) return bTime - aTime;
          return a.path.localeCompare(b.path);
        });
        const deduped =
          state.mode === "files" ? dedupeBackupResults(filtered) : filtered;
        setResults(deduped);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    },
    [
      state.query,
      state.caseSensitive,
      backupIds,
      backupName,
      project_id,
      scopePath,
    ],
  );

  useEffect(() => {
    if (!prefill || prefill.tab !== "backups") return;
    setState({ query: prefill.query ?? "" });
    if ((prefill.query ?? "").trim()) {
      void runSearch(prefill.query);
    }
  }, [prefill, runSearch, setState]);

  useEffect(() => {
    if (!backupName || backupIds === undefined) return;
    if (!state.query.trim()) return;
    void runSearch(state.query);
  }, [backupName, backupIds, state.query, runSearch]);

  useEffect(() => {
    const q = queryRef.current?.trim();
    if (!q) return;
    void runSearch(q);
  }, [scopePath, backupName, backupIds, runSearch]);

  const filteredResults = useMemo(() => {
    const f = state.filter.trim();
    if (!f) return results;
    const words = search_split(f.toLowerCase());
    return results.filter((result) =>
      search_match(result.filter.toLowerCase(), words),
    );
  }, [state.filter, results]);

  useEffect(() => {
    if (!filteredResults.length) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex((prev) =>
      prev == null || prev >= filteredResults.length ? 0 : prev,
    );
  }, [filteredResults.length]);

  useEffect(() => {
    if (selectedIndex == null) return;
    listRef.current?.scrollToIndex({ index: selectedIndex });
  }, [selectedIndex]);

  const openResult = useCallback(
    async (index: number) => {
      const result = filteredResults[index];
      if (!result) return;
      setRestoreTarget(result);
    },
    [filteredResults],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      if (!filteredResults.length) return;
      setSelectedIndex((prev) => {
        const next =
          prev == null
            ? 0
            : Math.min(
                Math.max(prev + delta, 0),
                filteredResults.length - 1,
              );
        return next;
      });
    },
    [filteredResults.length],
  );

  const onResultsKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        return;
      }
      if (!filteredResults.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (selectedIndex != null) {
          void openResult(selectedIndex);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setState({ filter: "" });
      }
    },
    [filteredResults.length, moveSelection, openResult, selectedIndex, setState],
  );

  const performRestore = useCallback(
    async (mode: "original" | "scratch") => {
      if (!restoreTarget || !project_id) return;
      try {
        setRestoreLoading(true);
        setRestoreError(null);
        const dest =
          mode === "scratch"
            ? posix.join("/scratch", restoreTarget.path || "")
            : undefined;
        const op =
          await webapp_client.conat_client.hub.projects.restoreBackup({
            project_id,
            id: restoreTarget.id,
            path: restoreTarget.path || undefined,
            dest,
          });
        actions?.trackRestoreOp?.(op);
        message.success("Restore started");
        setRestoreTarget(null);
      } catch (err) {
        setRestoreError(`${err}`);
      } finally {
        setRestoreLoading(false);
      }
    },
    [actions, project_id, restoreTarget],
  );

  const openBackupDirectory = useCallback(() => {
    if (!restoreTarget || !actions) return;
    const backupName = new Date(restoreTarget.time).toISOString();
    const dir = restoreTarget.path.includes("/")
      ? posix.dirname(restoreTarget.path)
      : "";
    const target = join(".backups", backupName, dir);
    actions.open_directory(target, true, true);
    setRestoreTarget(null);
  }, [actions, restoreTarget]);

  const openSnapshotsDir = useCallback(() => {
    actions?.open_directory(".snapshots");
  }, [actions]);

  const openBackupsDir = useCallback(() => {
    actions?.open_directory(".backups");
  }, [actions]);

  const openSnapshotSchedule = useCallback(() => {
    actions?.open_directory(".snapshots");
    actions?.setState({ open_snapshot_schedule: true });
  }, [actions]);

  const openBackupSchedule = useCallback(() => {
    actions?.open_directory(".backups");
    actions?.setState({ open_backup_schedule: true });
  }, [actions]);

  const restorePath = restoreTarget?.path ?? "";
  const alert = (
    <Alert
      type="info"
      style={{
        marginBottom: mode === "flyout" ? "8px" : 0,
        maxWidth: mode === "flyout" ? undefined : "360px",
      }}
      message="Snapshots vs Backups"
      description={
        <>
          <Button
            size="small"
            type="link"
            style={{ padding: 0, height: "auto" }}
            onClick={openSnapshotsDir}
          >
            Snapshots
          </Button>{" "}
          are more{" "}
          <Button
            size="small"
            type="link"
            style={{ padding: 0, height: "auto" }}
            onClick={openSnapshotSchedule}
          >
            frequent, recent
          </Button>{" "}
          and support content search;{" "}
          <Button
            size="small"
            type="link"
            style={{ padding: 0, height: "auto" }}
            onClick={openBackupsDir}
          >
            Backups
          </Button>{" "}
          are{" "}
          <Button
            size="small"
            type="link"
            style={{ padding: 0, height: "auto" }}
            onClick={openBackupSchedule}
          >
            less frequent and longer lived
          </Button>
          .
        </>
      }
    />
  );
  const searchRow = (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px",
        alignItems: "center",
      }}
    >
      <SearchInput
        size={mode === "flyout" ? "medium" : "large"}
        autoFocus
        value={state.query}
        placeholder="Find files in backups (glob)..."
        on_change={(value) => setState({ query: value })}
        on_submit={() => runSearch()}
        on_clear={() => {
          setState({ query: "", filter: "" });
          setResults([]);
          setError(null);
        }}
        on_down={() => moveSelection(1)}
        on_up={() => moveSelection(-1)}
        buttonAfter={
          <Button
            disabled={!state.query.trim()}
            type="primary"
            onClick={() => runSearch()}
          >
            Search
          </Button>
        }
        style={{ width: fieldWidth }}
      />
      <Radio.Group
        value={state.mode}
        onChange={(e) =>
          setState({ mode: e.target.value as SnapshotSearchMode })
        }
        optionType="button"
        buttonStyle="solid"
        size={mode === "flyout" ? "small" : "middle"}
      >
        <Radio.Button value="files">Files</Radio.Button>
        <Tooltip title="Backup contents search isn't supported yet. Use snapshots for content search.">
          <Radio.Button value="contents" disabled>
            Contents
          </Radio.Button>
        </Tooltip>
      </Radio.Group>
    </div>
  );
  const optionsRow = (
    <Space wrap style={{ marginTop: "8px" }}>
      <Button
        size="small"
        type={state.hidden ? "primary" : "default"}
        onClick={() => setState({ hidden: !state.hidden })}
      >
        Hidden
      </Button>
      <Button
        size="small"
        type={state.caseSensitive ? "primary" : "default"}
        onClick={() => setState({ caseSensitive: !state.caseSensitive })}
      >
        Case sensitive
      </Button>
    </Space>
  );

  return (
    <div className="smc-vfill">
      {mode === "flyout" ? (
        <>
          {alert}
          {searchRow}
          {optionsRow}
        </>
      ) : (
        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1 1 520px", minWidth: 0 }}>
            {searchRow}
            {optionsRow}
          </div>
          <div style={{ flex: "0 1 360px" }}>{alert}</div>
        </div>
      )}
      {error ? (
        <Alert style={{ marginTop: "10px" }} type="error" message={error} />
      ) : null}
      {loading ? (
        <div style={{ marginTop: "10px" }}>
          <Loading />
        </div>
      ) : null}
      {!loading && state.query.trim() && filteredResults.length === 0 ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="warning"
          message="No results."
        />
      ) : null}
      {results.length > 0 || state.filter.trim() ? (
        <div
          style={{
            marginTop: "10px",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
          tabIndex={0}
          onKeyDown={onResultsKeyDown}
        >
          <Input
            size="small"
            placeholder="Filter results"
            value={state.filter}
            onChange={(e) => setState({ filter: e.target.value })}
            allowClear
            style={{ width: fieldWidth, marginBottom: "8px" }}
          />
          {filteredResults.length > 0 ? (
            <FindResultsGrid
              listRef={listRef}
              minItemWidth={480}
              totalCount={filteredResults.length}
              itemContent={(index) => {
                const result = filteredResults[index];
                return (
                  <FindBackupRow
                    key={`${result.id}-${result.path}-${index}`}
                    result={result}
                    isSelected={index === selectedIndex}
                    onClick={() => {
                      setSelectedIndex(index);
                      setRestoreTarget(result);
                    }}
                  />
                );
              }}
            />
          ) : null}
        </div>
      ) : null}
      <FindRestoreModal
        open={Boolean(restoreTarget)}
        title="Backup selection"
        path={restorePath}
        openLabel="Open backup directory"
        loading={restoreLoading}
        error={restoreError}
        preview={preview ?? undefined}
        onRestoreOriginal={() => void performRestore("original")}
        onRestoreScratch={() => void performRestore("scratch")}
        onOpenDirectory={openBackupDirectory}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
