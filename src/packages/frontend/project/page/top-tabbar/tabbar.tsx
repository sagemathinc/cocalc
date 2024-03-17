/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import { COLORS } from "@cocalc/util/theme";
import { useProjectContext } from "../../context";
import { ChatIndicatorTab } from "./chat-indicator";
import { CloseEditor } from "./close-editor";
import { ExtraButtons } from "./extra-buttons";
import { TopBarSaveButton } from "./save-indicator";
import { ShareIndicatorTab } from "./share-indicator";
import { EditorActions, TopBarActions } from "./types";

// this is certainly unorthodox, but all editors are similar, regardless of project
// the purpose is to store the last known width as a good approximation, to reduce flicker
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
  const [topBarActions, setTopBarActions] = useState<TopBarActions | null>(
    null,
  );

  // if path/project_id changes, we need to reset the state
  useEffect(() => {
    setLoading(true);
    setActions(null); // to avoid calling wrong actions
    setTopBarActions(null);
  }, [project_id, path]);

  const placeholderWidth = useMemo(() => {
    if (loading) {
      return lastWidth;
    } else {
      lastWidth = width;
      return width;
    }
  }, [loading, width]);

  // wait for up to the given timeout (30 seconds or so) to get the actions
  async function getEditorActions(
    project_id: string,
    path: string,
  ): Promise<EditorActions | null> {
    const t0 = Date.now();
    while (true) {
      if (!isMounted.current) return null;

      const actions = redux.getEditorActions(project_id, path);
      if (actions != null) {
        return actions;
      }
      if (Date.now() - t0 > 30 * 1000) {
        return null;
      } else {
        await delay(50);
      }
    }
  }

  useAsyncEffect(async () => {
    // we start with a reset, just to be sure
    setActions(null);
    setTopBarActions(null);
    setLoading(false);

    // now we try to get the actions
    for (const path of open_files_order) {
      if (!path) continue;
      if (active_top_tab != project_id) continue;
      const tab_name = path_to_tab(path);
      if (activeTab !== tab_name) continue;

      const actionsNext = await getEditorActions(project_id, path);
      if (!isMounted.current) return;
      if (actionsNext != null) {
        setActions(actionsNext);
        setTopBarActions(actionsNext.getTopBarActions?.());
        return;
      }
    }

    // if we get here, we have not found any actions
    console.log(`no actions found for ${project_id} ${path}`);
  }, [open_files_order, project_id, path]);

  const name = redux_name(project_id, path);
  const prevName = usePrevious(name);

  // The name !== prevName test is an additional guard to avoid accessing a not yet initialized store.
  // Why is this necessary? The very first time the component renders with new values,
  // none of the hooks above have fired yet → $loading is still false, although the names differ.
  // TODO: feels like a hack, but it works
  if (loading || name !== prevName) {
    // while loading or right after switching the open file, render a placeholder to avoid flickering
    return (
      <div style={{ width: `${placeholderWidth}px` }}>
        <Loading style={{ color: COLORS.GRAY_M, padding: "8px 10px" }} />
      </div>
    );
  } else {
    // below, we do not render such buttons, which need actions + store.
    // the ones unrelated to the file's content are fine!
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
          {actions != null ? (
            <ExtraButtons
              editorActions={actions}
              path={path}
              topBarActions={topBarActions}
              name={name}
              compact={compact}
            />
          ) : undefined}
        </Space.Compact>
        {actions != null ? (
          <TopBarSaveButton name={name} actions={actions} compact={compact} />
        ) : undefined}
        <CloseEditor activeTab={activeTab} project_id={project_id} />
      </>
    );
  }
}
