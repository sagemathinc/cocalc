/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
top right hand side in a project.
*/

import { Button as AntdButton, Tooltip } from "antd";

import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import {
  Actions,
  redux,
  useActions,
  useAsyncEffect,
  useIsMountedRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { getJupyterActions } from "@cocalc/frontend/frame-editors/whiteboard-editor/elements/code/actions";
import { tab_to_path } from "@cocalc/util/misc";
import { ChatButton } from "./chat-button";
import { ShareIndicator } from "./share-indicator";

interface TTBAProps {
  activeTab: string;
  project_id: string;
}

export function TopTabBarActionsContainer(props: Readonly<TTBAProps>) {
  const { activeTab, project_id } = props;
  if (!activeTab.startsWith("editor-")) return null;
  const path = tab_to_path(activeTab);
  if (path == null) return null;

  return (
    <div className={"cc-project-tabs-top-right"}>
      <div className={"cc-project-tabs-top-right-slant"}></div>
      <div className={"cc-project-tabs-top-right-actions"}>
        <TopTabBarActions
          activeTab={activeTab}
          project_id={project_id}
          path={path}
        />
      </div>
    </div>
  );
}

function TopTabBarActions(props: Readonly<TTBAProps & { path: string }>) {
  const { activeTab, project_id, path } = props;
  const isMounted = useIsMountedRef();
  const [actions, setActions] = useState<Actions<{}> | null>(null);

  useAsyncEffect(async () => {
    setActions(null); // to avoid calling wrong actions
    for (let i = 0; i < 100; i++) {
      if (!isMounted.current) return;
      const actions = await redux.getEditorActions(project_id, path);
      if (actions != null) {
        setActions(actions);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }, [project_id, path]);

  console.log("actions", actions);

  return (
    <>
      <ChatIndicatorTab activeTab={activeTab} project_id={project_id} />
      <ShareIndicatorTab activeTab={activeTab} project_id={project_id} />
      <CloseEditor activeTab={activeTab} project_id={project_id} />
    </>
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
    <Tooltip
      title=<>
        Shutdown Editor
        <br />
        e.g. halts a running Jupyter Kernel
      </>
    >
      <AntdButton onClick={handleOnClick} icon={<Icon name="hand-stop" />} />
    </Tooltip>
  );
}

function ChatIndicatorTab({ activeTab, project_id }): JSX.Element | null {
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
      <ChatButton project_id={project_id} path={path} />
    </>
  );
}

function ShareIndicatorTab({ activeTab, project_id }) {
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

  return <ShareIndicator project_id={project_id} path={path} />;
}
