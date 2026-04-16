/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";
import { delay } from "awaiting";

import {
  redux,
  redux_name,
  useAsyncEffect,
  useEffect,
  useIsMountedRef,
  useMemo,
  usePrevious,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { path_to_tab } from "@cocalc/util/misc";
import { useProjectContext } from "../../context";
import { ChatIndicatorTab } from "./chat-indicator";
// import { CloseEditor } from "./close-editor";
import { ExtraButtons } from "./extra-buttons";
import { TopBarSaveButton } from "./save-indicator";
import { ShareIndicatorTab } from "./share-indicator";
import {
  EditorActions,
  TopBarActionsData,
  TopBarCapableActions,
} from "./types";

let lastWidth: number = 200;

export function TopTabBarActions(
  props: Readonly<{ path: string; compact: boolean; width: number }>,
) {
  const { path, width, compact } = props;
  const { project_id, active_project_tab: activeTab } = useProjectContext();
  const open_files_order = useTypedRedux({ project_id }, "open_files_order");
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const isMounted = useIsMountedRef();
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<EditorActions | null>(null);
  const [actionsData, setActionsData] = useState<TopBarActionsData | null>(
    null,
  );

  useEffect(() => {
    setLoading(true);
    setActions(null);
    setActionsData(null);
  }, [project_id, path]);

  const placeholderWidth = useMemo(() => {
    if (loading) {
      return lastWidth;
    } else {
      lastWidth = width;
      return width;
    }
  }, [loading, width]);

  async function getEditorActions(
    project_id: string,
    path: string,
  ): Promise<EditorActions | null> {
    const t0 = Date.now();
    while (true) {
      if (!isMounted.current) return null;
      const actions = redux.getEditorActions(project_id, path);
      if (actions != null) return actions;
      if (Date.now() - t0 > 30 * 1000) return null;
      await delay(50);
    }
  }

  useAsyncEffect(async () => {
    setActions(null);
    setActionsData(null);
    setLoading(false);

    for (const path of open_files_order) {
      if (!path) continue;
      if (active_top_tab != project_id) continue;
      const tab_name = path_to_tab(path);
      if (activeTab !== tab_name) continue;

      const actionsNext = await getEditorActions(project_id, path);
      if (!isMounted.current) return;
      if (actionsNext != null) {
        setActions(actionsNext);
        return;
      }
    }
  }, [open_files_order, project_id, path]);

  const name = redux_name(project_id, path);
  const prevName = usePrevious(name);

  // Subscribe to the editor store directly for topBarActionsData updates.
  // We cannot use useRedux here because the editor store may not exist
  // when this component first mounts (editor loads lazily), and useRedux
  // gives up permanently if the store is missing on first subscribe.
  useEffect(() => {
    if (actions == null) return;
    const capable = actions as unknown as TopBarCapableActions;
    setActionsData(capable.getTopBarActionsData?.() ?? null);

    const store = redux.getStore(name);
    if (store == null) return;

    let lastVersion = store.get("topBarActionsVersion");
    const onStoreChange = () => {
      const ver = store.get("topBarActionsVersion");
      if (ver !== lastVersion) {
        lastVersion = ver;
        setActionsData(capable.getTopBarActionsData?.() ?? null);
      }
    };
    store.on("change", onStoreChange);
    return () => {
      store.removeListener("change", onStoreChange);
    };
  }, [actions, name]);

  if (loading || name !== prevName) {
    return (
      <div style={{ width: `${placeholderWidth}px` }}>
        <Loading
          style={{
            color: "var(--cocalc-text-secondary, #5f5f5f)",
            padding: "8px 10px",
          }}
        />
      </div>
    );
  } else {
    return (
      <>
        <Space.Compact>
          <ChatIndicatorTab
            activeTab={activeTab}
            project_id={project_id}
            compact={compact}
          />
          <ShareIndicatorTab
            activeTab={activeTab}
            project_id={project_id}
            compact={compact}
          />
        </Space.Compact>
        {actions != null ? (
          <>
            <TopBarSaveButton name={name} actions={actions} compact={compact} />
            <ExtraButtons actionsData={actionsData} path={path} />
          </>
        ) : undefined}
        {/* Disabled for now. We keep the X on the file tabs for now, <CloseEditor activeTab={activeTab} project_id={project_id} /> */}
      </>
    );
  }
}
