import { Alert, Button, Tabs } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ProjectSearchBody } from "@cocalc/frontend/project/search/body";
import { lite } from "@cocalc/frontend/lite";
import { FindScopeBar } from "./find-scope-bar";
import { FilesTab } from "./find-tab-files";
import { SnapshotsTab } from "./find-tab-snapshots";
import { BackupsTab } from "./find-tab-backups";
import {
  type FindPrefill,
  type FindScopeMode,
  type FindTab,
} from "./types";
import { getScopeContext } from "./utils";

const LITE_TABS: FindTab[] = ["contents", "files"];
const FULL_TABS: FindTab[] = ["contents", "files", "snapshots", "backups"];

export const ProjectFind: React.FC<{ mode: "project" | "flyout" }> = ({
  mode,
}) => {
  const { project_id } = useProjectContext();
  const actions = useActions({ project_id });
  const currentPath = useTypedRedux({ project_id }, "current_path") ?? "";
  const storedTab = useTypedRedux({ project_id }, "find_tab") as
    | FindTab
    | undefined;
  const prefillStore = useTypedRedux({ project_id }, "find_prefill") as
    | FindPrefill
    | undefined;
  const storedScopeMode = useTypedRedux({ project_id }, "find_scope_mode") as
    | FindScopeMode
    | undefined;
  const storedScopePath = useTypedRedux({ project_id }, "find_scope_path") as
    | string
    | undefined;
  const storedScopePinned =
    useTypedRedux({ project_id }, "find_scope_pinned") ?? false;
  const storedScopeHistory = useTypedRedux(
    { project_id },
    "find_scope_history",
  ) as string[] | undefined;
  const userInput = useTypedRedux({ project_id }, "user_input");
  const mostRecentSearch = useTypedRedux(
    { project_id },
    "most_recent_search",
  );
  const mostRecentPath = useTypedRedux(
    { project_id },
    "most_recent_path",
  );

  const availableTabs = lite ? LITE_TABS : FULL_TABS;
  const scopeMode: FindScopeMode = storedScopeMode ?? "current";
  const scopePath =
    storedScopePath ??
    (scopeMode === "home" ? "" : scopeMode === "current" ? currentPath : "");
  const scopePinned = Boolean(storedScopePinned);
  const scopeHistory = storedScopeHistory ?? [];

  const [prefill, setPrefill] = useState<FindPrefill | undefined>(undefined);

  useEffect(() => {
    if (!actions) return;
    if (storedScopeMode == null) {
      actions.setState({ find_scope_mode: "current" });
    }
    if (storedScopePath == null) {
      actions.setState({ find_scope_path: currentPath ?? "" });
    }
    if (storedScopePinned == null) {
      actions.setState({ find_scope_pinned: false });
    }
  }, [
    actions,
    storedScopeMode,
    storedScopePath,
    storedScopePinned,
    currentPath,
  ]);

  useEffect(() => {
    if (!actions || storedScopeHistory != null) return;
    const key = `find-scope-history-${project_id}`;
    const raw = localStorage.getItem(key);
    if (!raw) {
      actions.setState({ find_scope_history: [] });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        actions.setState({ find_scope_history: parsed });
      }
    } catch {
      actions.setState({ find_scope_history: [] });
    }
  }, [actions, storedScopeHistory, project_id]);

  const saveHistory = useCallback(
    (next: string[]) => {
      if (!actions) return;
      const key = `find-scope-history-${project_id}`;
      actions.setState({ find_scope_history: next });
      localStorage.setItem(key, JSON.stringify(next));
    },
    [actions, project_id],
  );

  const updateScopePath = useCallback(
    (path: string, recordHistory = true) => {
      if (!actions) return;
      actions.setState({ find_scope_path: path });
      if (!recordHistory) return;
      const next = [path, ...scopeHistory.filter((p) => p !== path)].slice(
        0,
        10,
      );
      saveHistory(next);
    },
    [actions, saveHistory, scopeHistory],
  );

  const updateScopeMode = useCallback(
    (next: FindScopeMode) => {
      actions?.setState({ find_scope_mode: next });
    },
    [actions],
  );

  const updatePinned = useCallback(
    (next: boolean) => {
      actions?.setState({ find_scope_pinned: next });
    },
    [actions],
  );

  useEffect(() => {
    if (scopeMode !== "current" || scopePinned) return;
    if (scopePath === currentPath) return;
    updateScopePath(currentPath, false);
  }, [scopeMode, scopePinned, scopePath, currentPath, updateScopePath]);

  const scopeContext = useMemo(() => getScopeContext(scopePath), [scopePath]);
  const scopedPath =
    scopeContext.kind === "normal" ? scopePath : scopeContext.innerPath;
  const restrictedTab: FindTab | null =
    scopeContext.kind === "backups"
      ? "backups"
      : scopeContext.kind === "snapshots"
        ? "snapshots"
        : null;
  const allowedTabs = restrictedTab ? [restrictedTab] : availableTabs;
  const normalizedTab = allowedTabs.includes(storedTab ?? "contents")
    ? (storedTab ?? "contents")
    : allowedTabs[0];

  useEffect(() => {
    if (!actions) return;
    if (normalizedTab !== storedTab) {
      actions.setState({ find_tab: normalizedTab });
    }
  }, [actions, normalizedTab, storedTab]);

  useEffect(() => {
    if (!prefillStore || !actions) return;
    const nextTab = (availableTabs.includes(prefillStore.tab)
      ? prefillStore.tab
      : "contents") as FindTab;
    setPrefill({ ...prefillStore, tab: nextTab });
    actions.setState({ find_prefill: undefined, find_tab: nextTab });
    if (prefillStore.scope_path != null) {
      const nextMode: FindScopeMode =
        prefillStore.scope_path === currentPath
          ? "current"
          : prefillStore.scope_path
            ? "custom"
            : "home";
      updateScopeMode(nextMode);
      updateScopePath(prefillStore.scope_path, true);
    }
    if (nextTab === "contents" && prefillStore.query.trim()) {
      actions.setState({ user_input: prefillStore.query });
      actions.search({ path: prefillStore.scope_path ?? currentPath });
    }
  }, [
    prefillStore,
    actions,
    availableTabs,
    currentPath,
    updateScopeMode,
    updateScopePath,
  ]);

  useEffect(() => {
    if (!actions) return;
    if (normalizedTab !== "contents") return;
    if (!userInput?.trim()) return;
    if (mostRecentSearch == null) return;
    if (mostRecentPath === scopedPath) return;
    actions.search({ path: scopedPath });
  }, [
    actions,
    normalizedTab,
    userInput,
    mostRecentSearch,
    mostRecentPath,
    scopedPath,
  ]);

  const onTabChange = useCallback(
    (next: string) => {
      const tab = next as FindTab;
      if (!allowedTabs.includes(tab)) return;
      actions?.setState({ find_tab: tab });
    },
    [actions, allowedTabs],
  );

  const tabItems = availableTabs.map((tab) => ({
    key: tab,
    label: tab === "contents" ? "Contents" : tab[0].toUpperCase() + tab.slice(1),
    disabled: restrictedTab ? tab !== restrictedTab : false,
  }));

  const scopeAlert =
    restrictedTab && scopeContext.kind !== "normal" ? (
      <Alert
        style={{ marginTop: "10px" }}
        type="warning"
        showIcon
        message={`Find path is inside .${restrictedTab}.`}
        description={
          <div>
            Other tabs are disabled for this path. Jump to the corresponding
            path in HOME to search normally.
          </div>
        }
        action={
          <Button
            type="primary"
            size="small"
            onClick={() => {
              const nextPath = scopeContext.homePath ?? "";
              updateScopeMode(nextPath ? "custom" : "home");
              updateScopePath(nextPath, true);
            }}
          >
            Jump to HOME path
          </Button>
        }
      />
    ) : null;

  const renderTabContent = () => {
    switch (normalizedTab) {
      case "contents":
        return (
          <ProjectSearchBody
            mode={mode}
            pathOverride={scopedPath}
            showPathHint={false}
          />
        );
      case "files":
        return (
          <FilesTab mode={mode} scopePath={scopedPath} prefill={prefill} />
        );
      case "snapshots":
        return (
          <SnapshotsTab
            mode={mode}
            scopePath={scopedPath}
            prefill={prefill}
            snapshotName={
              scopeContext.kind === "snapshots" ? scopeContext.snapshotName : undefined
            }
          />
        );
      case "backups":
        return (
          <BackupsTab
            mode={mode}
            scopePath={scopedPath}
            prefill={prefill}
            backupName={
              scopeContext.kind === "backups" ? scopeContext.backupName : undefined
            }
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
        scopePinned={scopePinned}
        history={scopeHistory}
        onScopeModeChange={updateScopeMode}
        onScopePathChange={(path) => updateScopePath(path, true)}
        onScopePinnedChange={updatePinned}
      />
      {scopeAlert}
      <div style={{ marginTop: "10px" }}>
        <Tabs activeKey={normalizedTab} onChange={onTabChange} items={tabItems} />
      </div>
      <div className="smc-vfill" style={{ minHeight: 0, marginTop: "10px" }}>
        {renderTabContent()}
      </div>
    </div>
  );
};
