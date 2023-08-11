/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
top right hand side in a project.
*/

import type { MenuProps } from "antd";
import { Button as AntdButton, Dropdown, Space, Tooltip } from "antd";
import { throttle } from "lodash";

import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import {
  TypedMap,
  redux,
  redux_name,
  useActions,
  useAsyncEffect,
  useEffect,
  useIsMountedRef,
  useLayoutEffect,
  useMemo,
  usePrevious,
  useRedux,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useAppState } from "@cocalc/frontend/app/context";
import { ChatActions } from "@cocalc/frontend/chat/actions";
import { Icon, Loading } from "@cocalc/frontend/components";
import { CourseActions } from "@cocalc/frontend/course/actions";
import { ArchiveActions } from "@cocalc/frontend/editors/archive/actions";
import { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import { SaveButton } from "@cocalc/frontend/frame-editors/frame-tree/save-button";
import { TimeTravelActions } from "@cocalc/frontend/frame-editors/time-travel-editor/actions";
import { getJupyterActions } from "@cocalc/frontend/frame-editors/whiteboard-editor/elements/code/actions";
import { useMeasureDimensions } from "@cocalc/frontend/hooks";
import { tab_to_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useProjectContext } from "../context";
import { ChatButton } from "./chat-button";
import { ShareIndicator } from "./share-indicator";
import { TopBarActions } from "./types";

// this is certainly unorthodox, but all editors are similar, regardless of project
// the purpose is to store the last known width as a good approximation, to reduce flicker
let lastWidth: number = 200;

interface TTBAProps {
  fullTabWidth: number;
}

export function TopTabBarActionsContainer(props: Readonly<TTBAProps>) {
  const { fullTabWidth } = props;
  const topRightRef = useRef<HTMLDivElement>(null);
  const actionstRef = useRef<HTMLDivElement>(null);
  const { active_project_tab: activeTab } = useProjectContext();
  const { pageWidthPx } = useAppState();
  const { width: topRightWidth } = useMeasureDimensions(topRightRef);
  const { width: actionsWidth } = useMeasureDimensions(actionstRef);

  // keep track of the breakPoint width to avoid flickering
  const [compact, setCompact] = useState<boolean>(isCompact());
  const refCompact = useRef<boolean>(compact);
  const breakPoint = useRef<number>(0);

  function isCompact() {
    if (pageWidthPx < 500) return true;
    if (fullTabWidth < 500) return true;
    if (fullTabWidth / 3 < topRightWidth) return true;
    return false;
  }

  const calcCompact = throttle(
    () => {
      if (fullTabWidth === 0) return; // no data
      if (topRightWidth === 0) return; // no data
      if (pageWidthPx === 0) return; // no data

      // uses isCompact() and the breakPoint to avoid flickering
      if (refCompact.current) {
        if (!isCompact() && breakPoint.current < fullTabWidth - 10) {
          setCompact(false);
          refCompact.current = false;
          breakPoint.current = fullTabWidth;
        }
      } else {
        if (
          isCompact() &&
          (breakPoint.current === 0 || breakPoint.current > fullTabWidth + 10)
        ) {
          setCompact(true);
          refCompact.current = true;
          breakPoint.current = fullTabWidth;
        }
      }
    },
    50,
    { leading: false, trailing: true }
  );

  useLayoutEffect(() => {
    calcCompact();
  }, [pageWidthPx, fullTabWidth, topRightWidth]);

  // console.log({
  //   compact,
  //   isCompact: isCompact(),
  //   fullTabWidth,
  //   breakPoint: breakPoint.current,
  //   topRightWidth,
  // });

  if (activeTab == null || !activeTab.startsWith("editor-")) return null;
  const path = tab_to_path(activeTab);
  if (path == null) return null;

  return (
    <div ref={topRightRef} className={"cc-project-tabs-top-right"}>
      <div className={"cc-project-tabs-top-right-slant"}></div>
      <div ref={actionstRef} className={"cc-project-tabs-top-right-actions"}>
        <TopTabBarActions path={path} compact={compact} width={actionsWidth} />
      </div>
    </div>
  );
}

// All possible Actions of files. TODO: should they have a common parent?!
type EditorActions =
  | ArchiveActions
  | CodeEditorActions
  | ChatActions
  | CourseActions
  | TimeTravelActions;

function TopTabBarActions(
  props: Readonly<{ path: string; compact: boolean; width: number }>
) {
  const { path, compact, width } = props;
  const { project_id, active_project_tab: activeTab } = useProjectContext();
  const isMounted = useIsMountedRef();
  const [loading, setLoading] = useState(true);
  const [loadingShow, setLoadingShow] = useState(false);
  const [actions, setActions] = useState<EditorActions | null>(null);
  const [topBarActions, setTopBarActions] = useState<TopBarActions | null>(
    null
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

  useAsyncEffect(async () => {
    const t0 = Date.now();
    let actionsNext: EditorActions | null = null;
    while (isMounted.current) {
      if (Date.now() - t0 > 500) setLoadingShow(true);
      if (!isMounted.current) return;
      // first, we try to get the actions
      if (actionsNext == null) {
        actionsNext = await redux.getEditorActions(project_id, path);
        if (!isMounted.current) return;
      } else {
        // we have the actions, now try to get the store as well
        const store = await redux.getEditorStore(project_id, path);
        if (!isMounted.current) return;
        if (store != null) {
          setTopBarActions(actionsNext.getTopBarActions?.());
          setActions(actionsNext);
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!isMounted.current) return;
    // this comes last, because only then buttons will be rendered, which in turn use the redux store
    setLoading(false);
    setLoadingShow(false);
  }, [project_id, path]);

  const name = redux_name(project_id, path);
  const prevName = usePrevious(name);

  // the name !== prevName test is an additional guard to avoid accessing a not yet initilaized store.
  // why is this necessary? the very first time the component renders with the new values,
  // none of the hooks above has fired yet → $loading is still false, although the names differ.
  // TODO: feels like a hack, but it works
  if (loading || name !== prevName || actions == null) {
    // at least, render a placeholder to avoid flickering
    return (
      <div style={{ width: `${placeholderWidth}px` }}>
        {loadingShow ? (
          <Loading style={{ color: COLORS.GRAY_M, padding: "8px 10px" }} />
        ) : null}
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
          <ExtraButtons
            topBarActions={topBarActions}
            name={name}
            compact={compact}
          />
        </Space.Compact>
        <TopBarSaveButton name={name} actions={actions} compact={compact} />
        <CloseEditor activeTab={activeTab} project_id={project_id} />
      </>
    );
  }
}

interface ExtraButtonsProps {
  topBarActions: TopBarActions | null;
  name: string;
  compact: boolean;
}

function ExtraButtons(props: Readonly<ExtraButtonsProps>): JSX.Element | null {
  const { topBarActions, name, compact } = props;
  const local_view_state: TypedMap<{ active_id?: string; full_id?: string }> =
    useRedux(name, "local_view_state");

  function renderItem(conf, index) {
    const { getAction, label, icon } = conf;
    const action = conf.action ?? getAction?.(local_view_state);

    return {
      key: `${index}`,
      onClick: action,
      disabled: action == null,
      label: (
        <>
          <Icon name={icon} /> {label}
        </>
      ),
    };
  }

  // the active_id or other view related aspects might change, so we need to
  // re-render this component if that happens.
  const [top, items]: [
    TopBarActions[0] | null,
    NonNullable<MenuProps["items"]>
  ] = useMemo(() => {
    if (topBarActions == null) return [null, []];

    // pick the first action from topBarActions, which has the highest priority attribute
    const sorted = topBarActions.sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );
    const top = sorted[0];
    const remainder = sorted.slice(1) ?? [];
    return [top, remainder.map(renderItem)];
  }, [local_view_state, topBarActions, name, compact]);

  if (top == null) return null;

  if (items.length === 0) {
    return (
      <AntdButton
        icon={<Icon name={top.icon} />}
        onClick={top.action ?? top.getAction?.(local_view_state)}
      >
        {compact ? null : top.label}
      </AntdButton>
    );
  } else {
    return (
      <Dropdown.Button
        icon={<Icon name="chevron-down" />}
        trigger={["click"]}
        menu={{ items }}
        onClick={top.action ?? top.getAction?.(local_view_state)}
      >
        <Icon name={top.icon} />
        {compact ? null : ` ${top.label}`}
      </Dropdown.Button>
    );
  }
}

interface TopBarSaveButtonProps {
  name: string;
  actions: EditorActions | null;
  compact?: boolean;
}

function TopBarSaveButton({
  name,
  actions,
  compact = false,
}: TopBarSaveButtonProps): JSX.Element | null {
  const read_only: boolean = useRedux([name, "read_only"]);
  const has_unsaved_changes: boolean = useRedux([name, "has_unsaved_changes"]);
  const has_uncommitted_changes: boolean = useRedux([
    name,
    "has_uncommitted_changes",
  ]);
  const show_uncommitted_changes: boolean = useRedux([
    name,
    "show_uncommitted_changes",
  ]);
  const is_saving: boolean = useRedux([name, "is_saving"]);
  const is_public: boolean = useRedux([name, "is_public"]);

  if (actions == null) return null;

  // test, if actions has the method set_show_uncommitted_changes
  // an "actions instanceof CodeEditorActions" does not work. TODO figure out why...
  const isCodeEditorActions =
    (actions as any).set_show_uncommitted_changes != null;

  const hasSaveToDisk = typeof (actions as any).save_to_disk === "function";

  return (
    <SaveButton
      has_unsaved_changes={has_unsaved_changes}
      has_uncommitted_changes={has_uncommitted_changes}
      show_uncommitted_changes={show_uncommitted_changes}
      set_show_uncommitted_changes={
        isCodeEditorActions
          ? (actions as any).set_show_uncommitted_changes
          : undefined
      }
      read_only={read_only}
      is_public={is_public}
      is_saving={is_saving}
      no_labels={compact}
      size={24}
      style={{}}
      onClick={() => {
        if (isCodeEditorActions) {
          (actions as any).save(true);
          (actions as any).explicit_save();
        }
        if (hasSaveToDisk) {
          (actions as any).save_to_disk?.();
        } else {
          console.warn("No save_to_disk method on actions", actions.name);
        }
      }}
    />
  );
}

function CloseEditor({ activeTab, project_id }): JSX.Element | null {
  const isMounted = useIsMountedRef();
  const actions = useActions({ project_id });

  async function handleOnClick(e: React.MouseEvent) {
    e.preventDefault();
    const path = tab_to_path(activeTab);
    if (path == null) return;
    try {
      if (path.endsWith(".ipynb")) {
        const jupyter_actions = await getJupyterActions({ project_id, path });
        if (!isMounted.current) return;
        if (jupyter_actions != null) {
          jupyter_actions.halt();
        }
      }
    } catch (err) {
      console.error("Problem stopping jupyter kernel, ignoring", err);
    }
    actions?.close_tab(path); // this unmounts the top actions including this close button
  }

  return (
    <Tooltip title={<>Close Editor</>}>
      <AntdButton
        ghost={true}
        type="text"
        onClick={handleOnClick}
        style={{ color: COLORS.GRAY_M, fontSize: "12px", padding: "0" }}
        icon={<Icon name="times" />}
      />
    </Tooltip>
  );
}

function ChatIndicatorTab({
  activeTab,
  project_id,
  compact,
}): JSX.Element | null {
  if (!activeTab?.startsWith("editor-")) {
    // TODO: This is the place in the code where we could support project-wide
    // side chat, or side chats for each individual Files/Search, etc. page.
    return null;
  }
  const path = tab_to_path(activeTab);
  if (path == null) {
    // bug -- tab is not a file tab.
    return null;
  }
  return (
    <>
      <UsersViewing
        project_id={project_id}
        path={path}
        style={{ maxWidth: "120px" }}
      />
      <ChatButton project_id={project_id} path={path} compact={compact} />
    </>
  );
}

function ShareIndicatorTab({ activeTab, project_id, compact }) {
  const isAnonymous = useTypedRedux("account", "is_anonymous");
  const currentPath = useTypedRedux({ project_id }, "current_path");

  if (isAnonymous) {
    // anon users can't share anything
    return null;
  }

  const path = activeTab === "files" ? currentPath : tab_to_path(activeTab);

  if (path == null) {
    // nothing specifically to share
    return null;
  }

  if (path === "") {
    // sharing whole project not implemented
    return null;
  }

  return (
    <ShareIndicator
      project_id={project_id}
      path={path}
      compact={compact}
      style={{ top: 0, right: 0, marginTop: 0 }}
    />
  );
}
