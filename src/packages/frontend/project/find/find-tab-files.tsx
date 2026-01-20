import { Alert, Button, Input, Space } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type VirtuosoGridHandle } from "react-virtuoso";
import { useActions } from "@cocalc/frontend/app-framework";
import { SearchInput, Loading } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { isChatExtension } from "@cocalc/frontend/chat/paths";
import {
  auxFileToOriginal,
  filename_extension,
  path_split,
  path_to_file,
  search_match,
  search_split,
} from "@cocalc/util/misc";
import { FindPathRow } from "./rows";
import { FindResultsGrid } from "./result-grid";
import { useFindTabState } from "./state";
import { type FindFilesState, type FindPrefill } from "./types";
import { normalizeGlobQuery, stripDotSlash } from "./utils";

const DEFAULT_STATE: FindFilesState = {
  query: "",
  filter: "",
  subdirs: true,
  hidden: false,
  caseSensitive: false,
  respectIgnore: true,
};

export function FilesTab({
  mode,
  scopePath,
  prefill,
}: {
  mode: "project" | "flyout";
  scopePath: string;
  prefill?: FindPrefill;
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
    "find_files_state",
    DEFAULT_STATE,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const listRef = useRef<VirtuosoGridHandle>(null);
  const queryRef = useRef(state.query);

  useEffect(() => {
    queryRef.current = state.query;
  }, [state.query]);

  const runSearch = useCallback(
    async (override?: string) => {
      const q = (override ?? state.query).trim();
      if (!q) {
        setResults([]);
        setLastQuery(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const normalized = normalizeGlobQuery(q);
        const options = [
          "-g",
          ...(state.subdirs ? [] : ["-d", "1"]),
          ...(state.hidden ? ["-H"] : []),
          ...(state.respectIgnore ? [] : ["-I"]),
          ...(state.caseSensitive ? ["-s"] : ["-i"]),
        ];
        const { stdout, stderr } = await fs.fd(scopePath ?? "", {
          pattern: normalized,
          options,
        });
        const text = Buffer.from(stdout).toString();
        const next = text.split("\n").filter(Boolean).map(stripDotSlash);
        setResults(next);
        setLastQuery(q);
        if (stderr?.length) {
          setError(Buffer.from(stderr).toString());
        } else {
          setError(null);
        }
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    },
    [fs, scopePath, state],
  );

  useEffect(() => {
    if (!prefill || prefill.tab !== "files") return;
    setState({ query: prefill.query ?? "" });
    if ((prefill.query ?? "").trim()) {
      void runSearch(prefill.query);
    }
  }, [prefill, runSearch, setState]);

  useEffect(() => {
    const q = queryRef.current?.trim();
    if (!q) return;
    void runSearch(q);
  }, [scopePath, runSearch]);

  const filteredResults = useMemo(() => {
    const f = state.filter.trim();
    if (!f) return results;
    const words = search_split(f.toLowerCase());
    return results.filter((path) => search_match(path.toLowerCase(), words));
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
      if (!actions) return;
      const path = filteredResults[index];
      if (!path) return;
      const fullPath = path_to_file(scopePath, path);
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
    [actions, filteredResults, fs, scopePath],
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

  const resultCount = filteredResults.length;

  return (
    <div className="smc-vfill">
      <SearchInput
        size={mode === "flyout" ? "medium" : "large"}
        autoFocus
        value={state.query}
        placeholder="Find files by name or glob..."
        on_change={(value) => setState({ query: value })}
        on_submit={() => runSearch()}
        on_clear={() => {
          setState({ query: "", filter: "" });
          setResults([]);
          setLastQuery(null);
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
      <Space wrap style={{ marginTop: "8px" }}>
        <Button
          size="small"
          type={state.subdirs ? "primary" : "default"}
          onClick={() => setState({ subdirs: !state.subdirs })}
        >
          Subdirectories
        </Button>
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
          type={state.respectIgnore ? "primary" : "default"}
          onClick={() => setState({ respectIgnore: !state.respectIgnore })}
        >
          Git ignore
        </Button>
      </Space>
      {error ? (
        <Alert style={{ marginTop: "10px" }} type="error" message={error} />
      ) : null}
      {loading ? <Loading /> : null}
      {!loading && lastQuery && resultCount === 0 ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="warning"
          message="No results."
        />
      ) : null}
      {resultCount > 0 || state.filter.trim() ? (
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
          {resultCount > 0 ? (
            <FindResultsGrid
              listRef={listRef}
              totalCount={resultCount}
              itemContent={(index) => {
                const path = filteredResults[index];
                return (
                  <FindPathRow
                    key={`${path}-${index}`}
                    path={path}
                    isSelected={index === selectedIndex}
                    onClick={async (e) => {
                      setSelectedIndex(index);
                      if (!actions) return;
                      const fullPath = path_to_file(scopePath, path);
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
