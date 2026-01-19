import { Alert, Button, Input, Modal, Radio, Space, Tabs, Tooltip } from "antd";
import { type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { dirname, join } from "path";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { SearchInput, Icon, Loading } from "@cocalc/frontend/components";
import { useProjectContext } from "@cocalc/frontend/project/context";
import DirectorySelector from "@cocalc/frontend/project/directory-selector";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { alert_message } from "@cocalc/frontend/alerts";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { file_associations } from "@cocalc/frontend/file-associations";
import { ProjectSearchBody } from "@cocalc/frontend/project/search/body";
import { isChatExtension } from "@cocalc/frontend/chat/paths";
import { lite } from "@cocalc/frontend/lite";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import {
  auxFileToOriginal,
  filename_extension,
  path_split,
  path_to_file,
  search_match,
  search_split,
  trunc_middle,
} from "@cocalc/util/misc";
import { search as runRipgrepSearch } from "@cocalc/frontend/project/search/run";

export type FindTab = "contents" | "files" | "snapshots" | "backups";

type SnapshotSearchMode = "files" | "contents";

type FindPrefill = {
  tab: FindTab;
  query: string;
  scope_path?: string;
  submode?: string;
};

const LITE_TABS: FindTab[] = ["contents", "files"];
const FULL_TABS: FindTab[] = ["contents", "files", "snapshots", "backups"];

export const ProjectFind: React.FC<{ mode: "project" | "flyout" }> = ({
  mode,
}) => {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const currentPath = useTypedRedux({ project_id }, "current_path") ?? "";
  const storedTab =
    (useTypedRedux({ project_id }, "find_tab") as FindTab | undefined) ??
    "contents";
  const prefillStore = useTypedRedux({ project_id }, "find_prefill") as
    | FindPrefill
    | undefined;
  const availableTabs = lite ? LITE_TABS : FULL_TABS;
  const normalizeTab = useCallback(
    (tab: FindTab) => (availableTabs.includes(tab) ? tab : "contents"),
    [availableTabs],
  );

  const [activeTab, setActiveTab] = useState<FindTab>(() =>
    normalizeTab(storedTab),
  );
  const [prefill, setPrefill] = useState<FindPrefill | undefined>(undefined);
  const [scopeMode, setScopeMode] = useState<
    "current" | "home" | "git" | "custom"
  >("current");
  const [scopePath, setScopePath] = useState<string>(currentPath);

  useEffect(() => {
    const normalized = normalizeTab(storedTab);
    if (normalized !== storedTab) {
      setActiveTab(normalized);
      actions?.setState({ find_tab: normalized });
    }
  }, [storedTab, normalizeTab, actions]);

  useEffect(() => {
    if (scopeMode !== "current") return;
    setScopePath(currentPath);
  }, [currentPath, scopeMode]);

  useEffect(() => {
    if (!prefillStore) return;
    const normalizedTab = normalizeTab(prefillStore.tab);
    if (normalizedTab !== prefillStore.tab) {
      actions?.setState({
        find_prefill: undefined,
        find_tab: normalizedTab,
      });
      setPrefill(undefined);
      setActiveTab(normalizedTab);
      return;
    }
    setPrefill(prefillStore);
    setActiveTab(prefillStore.tab);
    actions?.setState({
      find_prefill: undefined,
      find_tab: normalizedTab,
    });
    if (prefillStore.scope_path != null) {
      if (prefillStore.scope_path === currentPath) {
        setScopeMode("current");
      } else if (!prefillStore.scope_path) {
        setScopeMode("home");
      } else {
        setScopeMode("custom");
      }
      setScopePath(prefillStore.scope_path);
    }
    if (prefillStore.tab === "contents" && prefillStore.query.trim()) {
      actions?.setState({ user_input: prefillStore.query });
      actions?.search({
        path: prefillStore.scope_path ?? currentPath,
      });
    }
  }, [prefillStore, actions, currentPath]);

  const onTabChange = useCallback(
    (next: string) => {
      const tab = normalizeTab(next as FindTab);
      setActiveTab(tab);
      actions?.setState({ find_tab: tab });
    },
    [actions, normalizeTab],
  );

  const tabItems = [
    { key: "contents", label: "Contents" },
    { key: "files", label: "Files" },
    ...(lite
      ? []
      : [
          { key: "snapshots", label: "Snapshots" },
          { key: "backups", label: "Backups" },
        ]),
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "contents":
        return (
          <ProjectSearchBody
            mode={mode}
            pathOverride={scopePath}
            showPathHint={false}
          />
        );
      case "files":
        return (
          <FilesTab mode={mode} scopePath={scopePath} prefill={prefill} />
        );
      case "snapshots":
        return (
          <SnapshotsTab
            mode={mode}
            scopePath={scopePath}
            prefill={prefill}
          />
        );
      case "backups":
        return (
          <BackupsTab
            mode={mode}
            scopePath={scopePath}
            prefill={prefill}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="smc-vfill" style={{ padding: "12px" }}>
      <FindScopeBar
        mode={mode}
        project_id={project_id}
        currentPath={currentPath}
        scopePath={scopePath}
        scopeMode={scopeMode}
        onScopeModeChange={setScopeMode}
        onScopePathChange={setScopePath}
      />
      <div style={{ marginTop: "10px" }}>
        <Tabs
          activeKey={activeTab}
          onChange={onTabChange}
          items={tabItems}
        />
      </div>
      <div
        className="smc-vfill"
        style={{ minHeight: 0, marginTop: "10px" }}
      >
        {renderTabContent()}
      </div>
    </div>
  );
};

function FindScopeBar({
  mode,
  project_id,
  currentPath,
  scopePath,
  scopeMode,
  onScopeModeChange,
  onScopePathChange,
}: {
  mode: "project" | "flyout";
  project_id: string;
  currentPath: string;
  scopePath: string;
  scopeMode: "current" | "home" | "git" | "custom";
  onScopeModeChange: (mode: "current" | "home" | "git" | "custom") => void;
  onScopePathChange: (path: string) => void;
}) {
  const size = mode === "flyout" ? "small" : "middle";
  const fs = useMemo(
    () => webapp_client.conat_client.conat().fs({ project_id }),
    [project_id],
  );
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pendingPath, setPendingPath] = useState(scopePath);
  const [gitLoading, setGitLoading] = useState(false);

  useEffect(() => {
    if (selectorOpen) {
      setPendingPath(scopePath);
    }
  }, [selectorOpen, scopePath]);

  const label = scopePath ? scopePath : "Home";

  const setHome = useCallback(() => {
    onScopeModeChange("home");
    onScopePathChange("");
  }, [onScopeModeChange, onScopePathChange]);

  const setCurrent = useCallback(() => {
    onScopeModeChange("current");
    onScopePathChange(currentPath);
  }, [onScopeModeChange, onScopePathChange, currentPath]);

  const setGitRoot = useCallback(async () => {
    setGitLoading(true);
    try {
      const root = await findGitRoot(fs, currentPath);
      if (!root) {
        alert_message({
          type: "warning",
          message: "No git root found in this path.",
        });
        return;
      }
      onScopeModeChange("git");
      onScopePathChange(root);
    } finally {
      setGitLoading(false);
    }
  }, [fs, currentPath, onScopeModeChange, onScopePathChange]);

  return (
    <div>
      <div style={{ marginBottom: "8px" }}>
        <Space wrap>
          <strong>Find in</strong>
          <Input
            readOnly
            value={label}
            size={size}
            style={{ width: mode === "flyout" ? 200 : 320 }}
          />
          <Button
            size={size}
            type={scopeMode === "current" ? "primary" : "default"}
            onClick={setCurrent}
          >
            Current
          </Button>
          <Button
            size={size}
            type={scopeMode === "home" ? "primary" : "default"}
            onClick={setHome}
          >
            Home
          </Button>
          <Tooltip title="Nearest directory containing .git">
            <Button
              size={size}
              loading={gitLoading}
              type={scopeMode === "git" ? "primary" : "default"}
              onClick={setGitRoot}
            >
              Git root
            </Button>
          </Tooltip>
          <Button size={size} onClick={() => setSelectorOpen(true)}>
            Choose
          </Button>
        </Space>
      </div>
      <Modal
        open={selectorOpen}
        destroyOnClose
        width={mode === "flyout" ? 640 : 860}
        title="Select Search Folder"
        okText="Use this folder"
        onOk={() => {
          onScopeModeChange("custom");
          onScopePathChange(pendingPath ?? "");
          setSelectorOpen(false);
        }}
        onCancel={() => setSelectorOpen(false)}
      >
        <DirectorySelector
          project_id={project_id}
          startingPath={pendingPath}
          onSelect={(path) => setPendingPath(path)}
          style={{ width: "100%" }}
          bodyStyle={{ maxHeight: 360 }}
          closable={false}
        />
      </Modal>
    </div>
  );
}

async function findGitRoot(
  fs: FilesystemClient,
  startPath: string,
): Promise<string | null> {
  let path = startPath;
  while (true) {
    const candidate = path ? join(path, ".git") : ".git";
    if (await fs.exists(candidate)) {
      return path;
    }
    if (!path) return null;
    const next = dirname(path);
    if (!next || next === path || next === ".") {
      path = "";
    } else {
      path = next;
    }
    if (!path) {
      if (await fs.exists(".git")) return "";
      return null;
    }
  }
}

function FilesTab({
  mode,
  scopePath,
  prefill,
}: {
  mode: "project" | "flyout";
  scopePath: string;
  prefill?: FindPrefill;
}) {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const fs = useMemo(
    () => webapp_client.conat_client.conat().fs({ project_id }),
    [project_id],
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<string[]>([]);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [subdirs, setSubdirs] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [respectIgnore, setRespectIgnore] = useState(true);
  const [filter, setFilter] = useState("");

  const runSearch = useCallback(
    async (override?: string) => {
      const q = (override ?? query).trim();
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
          ...(subdirs ? [] : ["-d", "1"]),
          ...(hidden ? ["-H"] : []),
          ...(respectIgnore ? [] : ["-I"]),
          ...(caseSensitive ? ["-s"] : ["-i"]),
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
    [query, fs, scopePath, subdirs, hidden, respectIgnore, caseSensitive],
  );

  useEffect(() => {
    if (!prefill || prefill.tab !== "files") return;
    setQuery(prefill.query ?? "");
    if ((prefill.query ?? "").trim()) {
      void runSearch(prefill.query);
    }
  }, [prefill, runSearch]);

  const filteredResults = useMemo(() => {
    const f = filter.trim();
    if (!f) return results;
    const words = search_split(f.toLowerCase());
    return results.filter((path) => search_match(path.toLowerCase(), words));
  }, [filter, results]);

  const resultCount = filteredResults.length;

  return (
    <div className="smc-vfill">
      <SearchInput
        size={mode === "flyout" ? "medium" : "large"}
        value={query}
        placeholder="Find files by name or glob..."
        on_change={(value) => setQuery(value)}
        on_submit={() => runSearch()}
        on_clear={() => {
          setQuery("");
          setResults([]);
          setLastQuery(null);
          setError(null);
        }}
        buttonAfter={
          <Button
            disabled={!query.trim()}
            type="primary"
            onClick={() => runSearch()}
          >
            Search
          </Button>
        }
      />
      <Space wrap style={{ marginTop: "8px" }}>
        <Button
          size="small"
          type={subdirs ? "primary" : "default"}
          onClick={() => setSubdirs(!subdirs)}
        >
          Subdirectories
        </Button>
        <Button
          size="small"
          type={hidden ? "primary" : "default"}
          onClick={() => setHidden(!hidden)}
        >
          Hidden
        </Button>
        <Button
          size="small"
          type={caseSensitive ? "primary" : "default"}
          onClick={() => setCaseSensitive(!caseSensitive)}
        >
          Case sensitive
        </Button>
        <Button
          size="small"
          type={respectIgnore ? "primary" : "default"}
          onClick={() => setRespectIgnore(!respectIgnore)}
        >
          Git ignore
        </Button>
      </Space>
      {error ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="error"
          message={error}
        />
      ) : null}
      {loading ? <Loading /> : null}
      {!loading && lastQuery && resultCount === 0 ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="warning"
          message="No results."
        />
      ) : null}
      {resultCount > 0 || filter.trim() ? (
        <div
          style={{
            marginTop: "10px",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Input
            size="small"
            placeholder="Filter results"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: "8px" }}
          />
          {resultCount > 0 ? (
            <Virtuoso
              style={{ flex: 1 }}
              totalCount={resultCount}
              itemContent={(index) => {
                const path = filteredResults[index];
                return (
                  <FindPathRow
                    key={`${path}-${index}`}
                    path={path}
                    onClick={async (e) => {
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

function SnapshotsTab({
  mode,
  scopePath,
  prefill,
}: {
  mode: "project" | "flyout";
  scopePath: string;
  prefill?: FindPrefill;
}) {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const fs = useMemo(
    () => webapp_client.conat_client.conat().fs({ project_id }),
    [project_id],
  );
  const [query, setQuery] = useState("");
  const [modeSelect, setModeSelect] = useState<SnapshotSearchMode>("files");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SnapshotResult[]>([]);
  const [filter, setFilter] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [gitGrep, setGitGrep] = useState(true);

  const runSearch = useCallback(
    async (override?: string, nextMode?: SnapshotSearchMode) => {
      const q = (override ?? query).trim();
      const activeMode = nextMode ?? modeSelect;
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
              ...(hidden ? ["-H"] : []),
              ...(caseSensitive ? ["-s"] : ["-i"]),
            ],
          });
          const raw = Buffer.from(stdout).toString();
          const entries = raw.split("\n").filter(Boolean).map(stripDotSlash);
          const parsed = parseSnapshotPaths(entries, scopePath);
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
              case_sensitive: caseSensitive,
              git_grep: gitGrep,
              subdirectories: true,
              hidden_files: hidden,
              regexp,
            },
            setState: (state) => {
              const rawResults = state.search_results as {
                filename: string;
                description: string;
                line_number: number;
                filter: string;
              }[];
              const parsed = parseSnapshotContentResults(
                rawResults ?? [],
                scopePath,
              );
              contentResults.splice(0, contentResults.length, ...parsed);
              if (state.search_error) {
                setError(state.search_error);
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
    [
      query,
      modeSelect,
      fs,
      scopePath,
      caseSensitive,
      hidden,
      regexp,
      gitGrep,
    ],
  );

  useEffect(() => {
    if (!prefill || prefill.tab !== "snapshots") return;
    const nextMode =
      prefill.submode === "contents" ? "contents" : "files";
    setModeSelect(nextMode);
    setQuery(prefill.query ?? "");
    if ((prefill.query ?? "").trim()) {
      void runSearch(prefill.query, nextMode);
    }
  }, [prefill, runSearch]);

  const filteredResults = useMemo(() => {
    const f = filter.trim();
    if (!f) return results;
    const words = search_split(f.toLowerCase());
    return results.filter((result) =>
      search_match(result.filter.toLowerCase(), words),
    );
  }, [filter, results]);

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
          value={query}
          placeholder={
            modeSelect === "files"
              ? "Find files in snapshots (glob)..."
              : "Search snapshot contents..."
          }
          on_change={(value) => setQuery(value)}
          on_submit={() => runSearch()}
          on_clear={() => {
            setQuery("");
            setResults([]);
            setError(null);
          }}
          buttonAfter={
            <Button
              disabled={!query.trim()}
              type="primary"
              onClick={() => runSearch()}
            >
              Search
            </Button>
          }
        />
        <Radio.Group
          value={modeSelect}
          onChange={(e) => setModeSelect(e.target.value)}
          optionType="button"
          buttonStyle="solid"
          size={mode === "flyout" ? "small" : "middle"}
        >
          <Radio.Button value="files">Files</Radio.Button>
          <Radio.Button value="contents">Contents</Radio.Button>
        </Radio.Group>
      </Space>
      {modeSelect === "contents" ? (
        <Space wrap style={{ marginTop: "8px" }}>
          <Button
            size="small"
            type={hidden ? "primary" : "default"}
            onClick={() => setHidden(!hidden)}
          >
            Hidden
          </Button>
          <Button
            size="small"
            type={caseSensitive ? "primary" : "default"}
            onClick={() => setCaseSensitive(!caseSensitive)}
          >
            Case sensitive
          </Button>
          <Button
            size="small"
            type={gitGrep ? "primary" : "default"}
            onClick={() => setGitGrep(!gitGrep)}
          >
            Git ignore
          </Button>
          <Button
            size="small"
            type={regexp ? "primary" : "default"}
            onClick={() => setRegexp(!regexp)}
          >
            Regexp
          </Button>
        </Space>
      ) : null}
      {error ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="error"
          message={error}
        />
      ) : null}
      {loading ? <Loading /> : null}
      {!loading && query.trim() && filteredResults.length === 0 ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="warning"
          message="No results."
        />
      ) : null}
      {results.length > 0 || filter.trim() ? (
        <div
          style={{
            marginTop: "10px",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Input
            size="small"
            placeholder="Filter results"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: "8px" }}
          />
          {filteredResults.length > 0 ? (
            <Virtuoso
              style={{ flex: 1 }}
              totalCount={filteredResults.length}
              itemContent={(index) => {
                const result = filteredResults[index];
                return (
                  <FindSnapshotRow
                    key={`${result.snapshot}-${result.path}-${index}`}
                    result={result}
                    onClick={async (e) => {
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

function BackupsTab({
  mode,
  scopePath,
  prefill,
}: {
  mode: "project" | "flyout";
  scopePath: string;
  prefill?: FindPrefill;
}) {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BackupResult[]>([]);
  const [filter, setFilter] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [modeSelect, setModeSelect] = useState<SnapshotSearchMode>("files");

  const runSearch = useCallback(
    async (override?: string) => {
      const q = (override ?? query).trim();
      if (!q) {
        setResults([]);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const normalized = normalizeGlobQuery(q);
        const payload = {
          project_id,
          glob: caseSensitive ? [normalized] : undefined,
          iglob: caseSensitive ? undefined : [normalized],
        };
        const raw =
          await webapp_client.conat_client.hub.projects.findBackupFiles(payload);
        const filtered = raw
          .map((item) => ({
            ...item,
            path: stripDotSlash(item.path),
            filter: `${item.path} ${item.id} ${item.time}`,
          }))
          .filter((item) => matchesScope(item.path, scopePath));
        setResults(filtered);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    },
    [query, project_id, caseSensitive, scopePath],
  );

  useEffect(() => {
    if (!prefill || prefill.tab !== "backups") return;
    setQuery(prefill.query ?? "");
    if ((prefill.query ?? "").trim()) {
      void runSearch(prefill.query);
    }
  }, [prefill, runSearch]);

  const filteredResults = useMemo(() => {
    const f = filter.trim();
    if (!f) return results;
    const words = search_split(f.toLowerCase());
    return results.filter((result) =>
      search_match(result.filter.toLowerCase(), words),
    );
  }, [filter, results]);

  return (
    <div className="smc-vfill">
      <Alert
        type="info"
        style={{ marginBottom: "8px" }}
        message="Snapshots are more frequent, recent and support content search; backups are less frequent and longer lived."
      />
      <SearchInput
        size={mode === "flyout" ? "medium" : "large"}
        value={query}
        placeholder="Find files in backups (glob)..."
        on_change={(value) => setQuery(value)}
        on_submit={() => runSearch()}
        on_clear={() => {
          setQuery("");
          setResults([]);
          setError(null);
        }}
        buttonAfter={
          <Button
            disabled={!query.trim()}
            type="primary"
            onClick={() => runSearch()}
          >
            Search
          </Button>
        }
      />
      <Space wrap style={{ marginTop: "8px" }}>
        <Radio.Group
          value={modeSelect}
          onChange={(e) => setModeSelect(e.target.value)}
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
        <Button
          size="small"
          type={caseSensitive ? "primary" : "default"}
          onClick={() => setCaseSensitive(!caseSensitive)}
        >
          Case sensitive
        </Button>
      </Space>
      {error ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="error"
          message={error}
        />
      ) : null}
      {loading ? <Loading /> : null}
      {!loading && query.trim() && filteredResults.length === 0 ? (
        <Alert
          style={{ marginTop: "10px" }}
          type="warning"
          message="No results."
        />
      ) : null}
      {results.length > 0 || filter.trim() ? (
        <div
          style={{
            marginTop: "10px",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Input
            size="small"
            placeholder="Filter results"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ marginBottom: "8px" }}
          />
          {filteredResults.length > 0 ? (
            <Virtuoso
              style={{ flex: 1 }}
              totalCount={filteredResults.length}
              itemContent={(index) => {
                const result = filteredResults[index];
                return (
                  <FindBackupRow
                    key={`${result.id}-${result.path}-${index}`}
                    result={result}
                    onClick={() => {
                      if (!actions) return;
                      const backupName = new Date(result.time).toISOString();
                      const targetDir = result.path.includes("/")
                        ? result.path.split("/").slice(0, -1).join("/")
                        : "";
                      const target = join(
                        ".backups",
                        backupName,
                        targetDir,
                      );
                      actions.open_directory(target, true, false);
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

function FindPathRow({
  path,
  onClick,
}: {
  path: string;
  onClick: (e: MouseEvent) => void | Promise<void>;
}) {
  const ext = filename_extension(path);
  const icon = file_associations[ext]?.icon ?? "file";
  return (
    <div
      role="button"
      style={{
        padding: "6px 8px",
        cursor: "pointer",
        borderBottom: "1px solid #f0f0f0",
      }}
      onClick={onClick}
    >
      <Icon name={icon} style={{ marginRight: "6px" }} />
      <span>{trunc_middle(path, 80)}</span>
    </div>
  );
}

type SnapshotResult = {
  snapshot: string;
  path: string;
  line_number?: number;
  description?: string;
  filter: string;
};

function FindSnapshotRow({
  result,
  onClick,
}: {
  result: SnapshotResult;
  onClick: (e: MouseEvent) => void | Promise<void>;
}) {
  const ext = filename_extension(result.path);
  const icon = file_associations[ext]?.icon ?? "file";
  return (
    <div
      role="button"
      style={{
        padding: "6px 8px",
        cursor: "pointer",
        borderBottom: "1px solid #f0f0f0",
      }}
      onClick={onClick}
    >
      <div>
        <Icon name={icon} style={{ marginRight: "6px" }} />
        <strong>{trunc_middle(result.path || "(root)", 70)}</strong>
      </div>
      <div style={{ fontSize: "12px", color: "#666" }}>
        Snapshot: {result.snapshot}
        {result.line_number != null ? ` · line ${result.line_number}` : ""}
      </div>
      {result.description ? (
        <div style={{ fontSize: "12px", color: "#666" }}>
          {result.description}
        </div>
      ) : null}
    </div>
  );
}

type BackupResult = {
  id: string;
  time: Date;
  path: string;
  isDir: boolean;
  mtime: number;
  size: number;
  filter: string;
};

function FindBackupRow({
  result,
  onClick,
}: {
  result: BackupResult;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      style={{
        padding: "6px 8px",
        cursor: "pointer",
        borderBottom: "1px solid #f0f0f0",
      }}
      onClick={onClick}
    >
      <div>
        <Icon
          name={result.isDir ? "folder-open" : "file"}
          style={{ marginRight: "6px" }}
        />
        <strong>{trunc_middle(result.path || "(root)", 70)}</strong>
      </div>
      <div style={{ fontSize: "12px", color: "#666" }}>
        Backup: {new Date(result.time).toISOString()}
      </div>
    </div>
  );
}

function normalizeGlobQuery(query: string): string {
  if (/[\*\?\[]/.test(query)) return query;
  return `*${query}*`;
}

function stripDotSlash(path: string): string {
  if (path.startsWith("/")) return path.slice(1);
  if (path.startsWith("./")) return path.slice(2);
  return path;
}

function matchesScope(path: string, scopePath: string): boolean {
  const cleanPath = stripDotSlash(path);
  const cleanScope = stripDotSlash(scopePath);
  if (!cleanScope) return true;
  if (cleanPath === cleanScope) return true;
  return cleanPath.startsWith(`${cleanScope}/`);
}

function parseSnapshotPaths(paths: string[], scopePath: string): SnapshotResult[] {
  const results: SnapshotResult[] = [];
  for (const raw of paths) {
    const clean = stripDotSlash(raw);
    const parts = clean.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const snapshot = parts[0];
    const rest = parts.slice(1);
    if (scopePath) {
      const scopeParts = scopePath.split("/").filter(Boolean);
      const matches = scopeParts.every((part, idx) => rest[idx] === part);
      if (!matches) continue;
      const relative = rest.slice(scopeParts.length).join("/");
      results.push({
        snapshot,
        path: relative,
        filter: `${snapshot} ${relative}`.trim(),
      });
    } else {
      results.push({
        snapshot,
        path: rest.join("/"),
        filter: `${snapshot} ${rest.join("/")}`.trim(),
      });
    }
  }
  return results;
}

function parseSnapshotContentResults(
  results: {
    filename: string;
    description: string;
    line_number: number;
    filter: string;
  }[],
  scopePath: string,
): SnapshotResult[] {
  const output: SnapshotResult[] = [];
  for (const result of results) {
    const clean = stripDotSlash(result.filename);
    const parts = clean.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    const snapshot = parts[0];
    const rest = parts.slice(1);
    if (scopePath) {
      const scopeParts = scopePath.split("/").filter(Boolean);
      const matches = scopeParts.every((part, idx) => rest[idx] === part);
      if (!matches) continue;
      const relative = rest.slice(scopeParts.length).join("/");
      output.push({
        snapshot,
        path: relative,
        line_number: result.line_number,
        description: result.description,
        filter: `${snapshot} ${relative} ${result.description}`.trim(),
      });
    } else {
      output.push({
        snapshot,
        path: rest.join("/"),
        line_number: result.line_number,
        description: result.description,
        filter: `${snapshot} ${rest.join("/")} ${result.description}`.trim(),
      });
    }
  }
  return output;
}
