import { Alert, Button, Input, Radio, Space, message } from "antd";
import { join, posix } from "path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type VirtuosoGridHandle } from "react-virtuoso";
import { useActions } from "@cocalc/frontend/app-framework";
import { Loading, SearchInput } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  path_to_file,
  search_match,
  search_split,
} from "@cocalc/util/misc";
import { search as runRipgrepSearch } from "@cocalc/frontend/project/search/run";
import { FindSnapshotRow, type SnapshotResult } from "./rows";
import { FindResultsGrid } from "./result-grid";
import { useFindTabState } from "./state";
import {
  type FindPrefill,
  type FindSnapshotsState,
  type SnapshotSearchMode,
} from "./types";
import {
  normalizeGlobQuery,
  parseSnapshotContentResults,
  parseSnapshotPaths,
  stripDotSlash,
} from "./utils";
import FindRestoreModal from "./restore-modal";

const DEFAULT_STATE: FindSnapshotsState = {
  query: "",
  filter: "",
  mode: "files",
  hidden: false,
  caseSensitive: false,
  gitGrep: true,
  regexp: false,
};

function snapshotSortKey(snapshot: string): number | null {
  const parsed = Date.parse(snapshot);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function sortSnapshotResults(results: SnapshotResult[]): SnapshotResult[] {
  const sorted = [...results];
  sorted.sort((a, b) => {
    const aKey = snapshotSortKey(a.snapshot);
    const bKey = snapshotSortKey(b.snapshot);
    if (aKey != null && bKey != null && aKey !== bKey) {
      return bKey - aKey;
    }
    if (aKey != null && bKey == null) return -1;
    if (aKey == null && bKey != null) return 1;
    const nameCmp = b.snapshot.localeCompare(a.snapshot);
    if (nameCmp) return nameCmp;
    return a.path.localeCompare(b.path);
  });
  return sorted;
}

export function SnapshotsTab({
  mode,
  scopePath,
  prefill,
  snapshotName,
}: {
  mode: "project" | "flyout";
  scopePath: string;
  prefill?: FindPrefill;
  snapshotName?: string;
}) {
  const fieldWidth = mode === "flyout" ? "100%" : "50%";
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const fs = useMemo(
    () => webapp_client.conat_client.conat().fs({ project_id }),
    [project_id],
  );
  const [state, setState] = useFindTabState(
    project_id,
    "find_snapshots_state",
    DEFAULT_STATE,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SnapshotResult[]>([]);
  const [statsMap, setStatsMap] = useState<
    Record<string, { mtime: number; size: number; isDir: boolean }>
  >({});
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<SnapshotResult | null>(null);
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
  const modeRef = useRef(state.mode);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    queryRef.current = state.query;
    modeRef.current = state.mode;
  }, [state.query, state.mode]);

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
    const relative = path_to_file(scopePath, restoreTarget.path).replace(
      /\/+$/,
      "",
    );
    if (!relative) {
      setPreview({ error: "Directory preview is not available." });
      return;
    }
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreview({ loading: true });
    webapp_client.conat_client.hub.projects
      .getSnapshotFileText({
        project_id,
        snapshot: restoreTarget.snapshot,
        path: relative,
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
  }, [project_id, restoreTarget, scopePath]);

  const runSearch = useCallback(
    async (override?: string, nextMode?: SnapshotSearchMode) => {
      const q = (override ?? state.query).trim();
      const activeMode = nextMode ?? state.mode;
      if (!q) {
        setResults([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (activeMode === "files") {
          const normalized = normalizeGlobQuery(q);
          const { stdout, stderr } = await fs.fd(".snapshots", {
            pattern: normalized,
            options: [
              "-g",
              ...(state.hidden ? ["-H"] : []),
              ...(state.caseSensitive ? ["-s"] : ["-i"]),
            ],
          });
          const raw = Buffer.from(stdout).toString();
          const entries = raw.split("\n").filter(Boolean).map(stripDotSlash);
          const parsed = sortSnapshotResults(
            parseSnapshotPaths(entries, scopePath, snapshotName),
          );
          setResults(parsed);
          if (stderr?.length) {
            setError(Buffer.from(stderr).toString());
          }
        } else {
          const contentResults: SnapshotResult[] = [];
          await runRipgrepSearch({
            query: q,
            path: ".snapshots",
            fs,
            options: {
              case_sensitive: state.caseSensitive,
              git_grep: state.gitGrep,
              subdirectories: true,
              hidden_files: state.hidden,
              regexp: state.regexp,
            },
            setState: (next) => {
              const rawResults = next.search_results as {
                filename: string;
                description: string;
                line_number: number;
                filter: string;
              }[];
              const parsed = sortSnapshotResults(
                parseSnapshotContentResults(
                  rawResults ?? [],
                  scopePath,
                  snapshotName,
                ),
              );
              contentResults.splice(0, contentResults.length, ...parsed);
              if (next.search_error) {
                setError(next.search_error);
              }
            },
          });
          setResults(contentResults);
        }
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    },
    [fs, scopePath, snapshotName, state],
  );

  useEffect(() => {
    if (!prefill || prefill.tab !== "snapshots") return;
    const nextMode =
      prefill.submode === "contents" ? "contents" : "files";
    setState({ mode: nextMode, query: prefill.query ?? "" });
    if ((prefill.query ?? "").trim()) {
      void runSearch(prefill.query, nextMode);
    }
  }, [prefill, runSearch, setState]);

  useEffect(() => {
    const q = queryRef.current?.trim();
    if (!q) return;
    void runSearch(q, modeRef.current);
  }, [scopePath, snapshotName, runSearch]);

  useEffect(() => {
    setStatsMap({});
  }, [state.query, state.mode, scopePath, snapshotName]);

  useEffect(() => {
    if (!results.length) return;
    let cancelled = false;
    const pending = results
      .slice(0, 200)
      .filter((result) => statsMap[`${result.snapshot}:${result.path}`] == null);
    if (!pending.length) return;
    const queue = [...pending];
    const workerCount = 6;
    void Promise.all(
      new Array(workerCount).fill(null).map(async () => {
        while (queue.length && !cancelled) {
          const result = queue.shift();
          if (!result) return;
          const key = `${result.snapshot}:${result.path}`;
          if (statsMap[key] != null) continue;
          try {
            const fullPath = join(
              ".snapshots",
              result.snapshot,
              result.path,
            );
            const stats = await fs.stat(fullPath);
            if (cancelled) return;
            setStatsMap((prev) => {
              if (prev[key] != null) return prev;
              return {
                ...prev,
                [key]: {
                  mtime: stats.mtime.getTime(),
                  size: stats.size,
                  isDir: stats.isDirectory(),
                },
              };
            });
          } catch {
            // ignore stat errors for snapshots
          }
        }
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [results, statsMap, fs]);

  const displayResults = useMemo(() => {
    if (!results.length) return results;
    const withStats = results.map((result) => {
      const key = `${result.snapshot}:${result.path}`;
      const stats = statsMap[key];
      if (!stats) return result;
      return { ...result, ...stats };
    });
    if (state.mode !== "files") return withStats;
    const output: SnapshotResult[] = [];
    const lastSig = new Map<string, string>();
    for (const result of withStats) {
      const hasSig =
        typeof result.mtime === "number" && typeof result.size === "number";
      const signature = hasSig ? `${result.mtime}:${result.size}` : "";
      const prev = lastSig.get(result.path);
      if (hasSig && prev === signature) continue;
      output.push(result);
      if (hasSig) {
        lastSig.set(result.path, signature);
      }
    }
    return output;
  }, [results, statsMap, state.mode]);

  const filteredResults = useMemo(() => {
    const f = state.filter.trim();
    if (!f) return displayResults;
    const words = search_split(f.toLowerCase());
    return displayResults.filter((result) =>
      search_match(result.filter.toLowerCase(), words),
    );
  }, [state.filter, displayResults]);

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

  const buildSnapshotPaths = useCallback(
    (result: SnapshotResult) => {
      const relative = path_to_file(scopePath, result.path);
      const snapshotPath = join(".snapshots", result.snapshot, relative);
      return { relative, snapshotPath };
    },
    [scopePath],
  );

  const performRestore = useCallback(
    async (mode: "original" | "scratch") => {
      if (!restoreTarget) return;
      try {
        setRestoreLoading(true);
        setRestoreError(null);
        const { relative, snapshotPath } = buildSnapshotPaths(restoreTarget);
        const dest =
          mode === "scratch" ? posix.join("/scratch", relative) : relative;
        const stats = await fs.stat(snapshotPath);
        const parent = posix.dirname(dest);
        if (parent && parent !== "." && parent !== "/") {
          await fs.mkdir(parent, { recursive: true });
        }
        await fs.cp(snapshotPath, dest, {
          recursive: stats.isDirectory(),
          preserveTimestamps: true,
          reflink: true,
        });
        message.success("Restore completed");
        setRestoreTarget(null);
      } catch (err) {
        setRestoreError(`${err}`);
      } finally {
        setRestoreLoading(false);
      }
    },
    [buildSnapshotPaths, fs, restoreTarget],
  );

  const openSnapshotDirectory = useCallback(() => {
    if (!restoreTarget || !actions) return;
    const { relative } = buildSnapshotPaths(restoreTarget);
    const dir = relative.includes("/") ? posix.dirname(relative) : "";
    const target = join(".snapshots", restoreTarget.snapshot, dir);
    actions.open_directory(target, true, true);
    setRestoreTarget(null);
  }, [actions, buildSnapshotPaths, restoreTarget]);

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

  const restorePath = restoreTarget
    ? path_to_file(scopePath, restoreTarget.path)
    : "";
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
        placeholder={
          state.mode === "files"
            ? "Find files in snapshots (glob)..."
            : "Search snapshot contents..."
        }
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
        <Radio.Button value="contents">Contents</Radio.Button>
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
      {state.mode === "contents" ? (
        <>
          <Button
            size="small"
            type={state.gitGrep ? "primary" : "default"}
            onClick={() => setState({ gitGrep: !state.gitGrep })}
          >
            Git ignore
          </Button>
          <Button
            size="small"
            type={state.regexp ? "primary" : "default"}
            onClick={() => setState({ regexp: !state.regexp })}
          >
            Regexp
          </Button>
        </>
      ) : null}
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
      {loading ? <Loading /> : null}
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
                  <FindSnapshotRow
                    key={`${result.snapshot}-${result.path}-${index}`}
                    result={result}
                    isSelected={index === selectedIndex}
                    onClick={async () => {
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
        title="Snapshot selection"
        path={restorePath}
        openLabel="Open snapshot directory"
        loading={restoreLoading}
        error={restoreError}
        preview={preview ?? undefined}
        onRestoreOriginal={() => void performRestore("original")}
        onRestoreScratch={() => void performRestore("scratch")}
        onOpenDirectory={openSnapshotDirectory}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
