import { Alert, Button, Input, Radio, Space } from "antd";
import { join } from "path";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { useActions } from "@cocalc/frontend/app-framework";
import { Loading, SearchInput } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { isChatExtension } from "@cocalc/frontend/chat/paths";
import {
  auxFileToOriginal,
  filename_extension,
  path_split,
  search_match,
  search_split,
} from "@cocalc/util/misc";
import { search as runRipgrepSearch } from "@cocalc/frontend/project/search/run";
import { FindSnapshotRow, type SnapshotResult } from "./rows";
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
  const listRef = useRef<VirtuosoHandle>(null);
  const queryRef = useRef(state.query);
  const modeRef = useRef(state.mode);

  useEffect(() => {
    queryRef.current = state.query;
    modeRef.current = state.mode;
  }, [state.query, state.mode]);

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
      if (!actions) return;
      const result = filteredResults[index];
      if (!result) return;
      const fullPath = join(
        ".snapshots",
        result.snapshot,
        result.path,
      );
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        actions.open_directory(fullPath, true, false);
        return;
      }
      const { tail } = path_split(fullPath);
      let chat = false;
      let openPath = fullPath;
      if (tail.startsWith(".") && isChatExtension(filename_extension(tail))) {
        openPath = auxFileToOriginal(fullPath);
        chat = true;
      }
      await actions.open_file({
        path: openPath,
        foreground: true,
        explicit: true,
        chat,
      });
    },
    [actions, filteredResults, fs],
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

  return (
    <div className="smc-vfill">
      <Alert
        type="info"
        style={{ marginBottom: "8px" }}
        message="Snapshots are more frequent, recent and support content search; backups are less frequent and longer lived."
      />
      <Space wrap>
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
      </Space>
      {state.mode === "contents" ? (
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
        </Space>
      ) : null}
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
            style={{ marginBottom: "8px" }}
          />
          {filteredResults.length > 0 ? (
            <Virtuoso
              ref={listRef}
              style={{ flex: 1 }}
              totalCount={filteredResults.length}
              itemContent={(index) => {
                const result = filteredResults[index];
                return (
                  <FindSnapshotRow
                    key={`${result.snapshot}-${result.path}-${index}`}
                    result={result}
                    isSelected={index === selectedIndex}
                    onClick={async (e) => {
                      setSelectedIndex(index);
                      if (!actions) return;
                      const fullPath = join(
                        ".snapshots",
                        result.snapshot,
                        result.path,
                      );
                      const stats = await fs.stat(fullPath);
                      if (stats.isDirectory()) {
                        actions.open_directory(fullPath, true, false);
                        return;
                      }
                      const { tail } = path_split(fullPath);
                      let chat = false;
                      let openPath = fullPath;
                      if (
                        tail.startsWith(".") &&
                        isChatExtension(filename_extension(tail))
                      ) {
                        openPath = auxFileToOriginal(fullPath);
                        chat = true;
                      }
                      await actions.open_file({
                        path: openPath,
                        foreground: should_open_in_foreground(e),
                        explicit: true,
                        chat,
                      });
                    }}
                  />
                );
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
