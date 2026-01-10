/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is a component that has three props:

  - project_id
  - tab_name -- 'files', 'new', 'log', 'search', 'settings', and 'editor-[path]'
  - is_visible

and it displays the file as an editor associated with that path in the project,
or Loading... if the file is still being loaded.
*/

import { Map } from "immutable";
import { debounce } from "lodash";
import { useCallback, useEffect, useMemo, useRef } from "react";
import Draggable from "react-draggable";
import { React, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { KioskModeBanner } from "@cocalc/frontend/app/kiosk-mode-banner";
import type { ChatState } from "@cocalc/frontend/chat/chat-indicator";
import SideChat from "@cocalc/frontend/chat/side-chat";
import { Loading } from "@cocalc/frontend/components";
import KaTeX from "@cocalc/frontend/components/math/katex";
import getMermaid from "@cocalc/frontend/editors/slate/elements/code-block/get-mermaid";
import { IS_MOBILE, IS_TOUCH } from "@cocalc/frontend/feature";
import { FileContext } from "@cocalc/frontend/lib/file-context";
import {
  drag_start_iframe_disable,
  drag_stop_iframe_enable,
} from "@cocalc/frontend/misc";
import DeletedFile from "@cocalc/frontend/project/deleted-file";
import { Explorer } from "@cocalc/frontend/project/explorer";
import { ProjectLog } from "@cocalc/frontend/project/history";
import { ProjectInfo } from "@cocalc/frontend/project/info";
import { ProjectNew } from "@cocalc/frontend/project/new";
import { ProjectSearch } from "@cocalc/frontend/project/search/search";
import { ProjectServers } from "@cocalc/frontend/project/servers";
import { ProjectSettings } from "@cocalc/frontend/project/settings";
import { editor_id } from "@cocalc/frontend/project/utils";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { chatMetaFile } from "@cocalc/frontend/chat/paths";
import { useProjectContext } from "../context";
import getAnchorTagComponent from "./anchor-tag-component";
import HomePage from "./home-page";
import { ProjectCollaboratorsPage } from "./project-collaborators";
import { ProjectLicenses } from "./project-licenses";
import getUrlTransform from "./url-transform";

// Default width of chat window as a fraction of the
// entire window.
const DEFAULT_CHAT_WIDTH = IS_MOBILE ? 0.5 : 0.3;

const MAIN_STYLE: React.CSSProperties = {
  overflowX: "auto",
  position: "absolute",
  inset: 0,
} as const;

interface Props {
  tab_name: string; // e.g., 'files', 'new', 'log', 'search', 'settings', or 'editor-<path>'
  is_visible: boolean; // if false, editor is in the DOM (so all subtle DOM state preserved) but it is not visible on screen.
}

export const Content: React.FC<Props> = (props: Props) => {
  const { tab_name, is_visible } = props;
  const { setContentSize } = useProjectContext();
  const contentRef = useRef<HTMLDivElement>(null);

  const debouncedMeasure = useCallback(
    debounce((entries: ResizeObserverEntry[]) => {
      if (entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        setContentSize({ width, height });
      }
    }, 10),
    [setContentSize],
  );

  useEffect(() => {
    if (!contentRef.current) return;

    const resizeObserver = new ResizeObserver(debouncedMeasure);
    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
      debouncedMeasure.cancel();
    };
  }, [debouncedMeasure]);

  // The className below is so we always make this div the remaining height.
  // The overflowY is hidden for editors (which don't scroll), but auto
  // otherwise, since some tabs (e.g., settings) *do* need to scroll. See
  // https://github.com/sagemathinc/cocalc/pull/4708.
  return (
    <div
      ref={contentRef}
      style={{
        ...MAIN_STYLE,
        ...(is_visible
          ? { opacity: 1, pointerEvents: "auto", zIndex: 1, visibility: "visible" }
          : {
              opacity: 0,
              pointerEvents: "none",
              zIndex: 0,
              visibility: "hidden",
            }),
        ...{ overflowY: tab_name.startsWith("editor-") ? "hidden" : "auto" },
      }}
      aria-hidden={!is_visible}
      className={"smc-vfill"}
    >
      <TabContent tab_name={tab_name} is_visible={is_visible} />
    </div>
  );
};

interface TabContentProps {
  tab_name: string;
  is_visible: boolean;
}

const TabContent: React.FC<TabContentProps> = (props: TabContentProps) => {
  const { tab_name, is_visible } = props;
  const { project_id } = useProjectContext();

  const open_files =
    useTypedRedux({ project_id }, "open_files") ?? Map<string, any>();
  const fullscreen = useTypedRedux("page", "fullscreen");
  const jupyterApiEnabled = useTypedRedux("customize", "jupyter_api_enabled");
  const recentlyDeletedPaths: Map<string, number> | undefined = useTypedRedux(
    { project_id },
    "recentlyDeletedPaths",
  );

  const path = useMemo(() => {
    if (tab_name.startsWith("editor-")) {
      return tab_name.slice("editor-".length);
    } else {
      return "";
    }
  }, [tab_name]);

  const lastIsVisibleRef = useRef<boolean>(is_visible);
  useEffect(() => {
    if (!is_visible && lastIsVisibleRef.current) {
      // a tab changed to not be visible, so let it know, so it can
      // remove its keyboard handler.
      if (tab_name.startsWith("editor-")) {
        // if the actions are defined and there is a blur method, call it.
        redux.getEditorActions(project_id, path)?.["blur"]?.();
      }
    }
    lastIsVisibleRef.current = is_visible;
  }, [is_visible]);

  // show the kiosk mode banner instead of anything besides a file editor
  if (fullscreen === "kiosk" && !tab_name.startsWith("editor-")) {
    return <KioskModeBanner />;
  }

  switch (tab_name) {
    case "home":
      return <HomePage />;
    case "files":
      return <Explorer />;
    case "new":
      return <ProjectNew project_id={project_id} />;
    case "log":
      return <ProjectLog project_id={project_id} />;
    case "search":
      return <ProjectSearch />;
    case "servers":
      return <ProjectServers />;
    case "settings":
      return <ProjectSettings project_id={project_id} />;
    case "info":
      return <ProjectInfo project_id={project_id} />;
    case "users":
      return <ProjectCollaboratorsPage />;
    case "upgrades":
      return <ProjectLicenses project_id={project_id} />;
    default:
      // check for "editor-[filename]"
      if (!tab_name.startsWith("editor-")) {
        return <Loading theme="medium" />;
      } else {
        const value = {
          urlTransform: getUrlTransform({ project_id, path }),
          AnchorTagComponent: getAnchorTagComponent({ project_id, path }),
          noSanitize: true, // TODO: temporary for backward compat for now; will make it user-configurable on a per file basis later.
          MathComponent: KaTeX,
          jupyterApiEnabled,
          hasLanguageModel: redux
            ?.getStore("projects")
            .hasLanguageModelEnabled(project_id),
          disableMarkdownCodebar: redux
            ?.getStore("account")
            .getIn(["other_settings", "disable_markdown_codebar"]),
          disableExtraButtons: false,
          project_id,
          path,
          is_visible,
          client: webapp_client,
          getMermaid,
        };
        return (
          <FileContext.Provider value={value}>
            <EditorContent
              project_id={project_id}
              path={path}
              is_visible={is_visible}
              chatState={open_files.getIn([path, "chatState"]) as any}
              chat_width={
                (open_files.getIn([path, "chat_width"]) as any) ??
                DEFAULT_CHAT_WIDTH
              }
              component={open_files.getIn([path, "component"]) ?? {}}
              deleted={recentlyDeletedPaths?.get(path)}
            />
          </FileContext.Provider>
        );
      }
  }
};

interface EditorProps {
  path: string;
  project_id: string;
  is_visible: boolean;
  // NOTE: this "component" part is a plain
  // object, and is not an immutable.Map, since
  // it has to store a react component.
  component: { Editor?; redux_name?: string };
}

const Editor: React.FC<EditorProps> = (props: EditorProps) => {
  const { path, project_id, is_visible, component } = props;
  const { Editor: EditorComponent, redux_name } = component;
  if (EditorComponent == null) {
    return <Loading theme={"medium"} />;
  }

  return (
    <div
      className={"smc-vfill"}
      id={editor_id(project_id, path)}
      style={{ height: "100%" }}
    >
      <EditorComponent
        name={redux_name}
        path={path}
        project_id={project_id}
        redux={redux}
        actions={redux_name != null ? redux.getActions(redux_name) : undefined}
        is_visible={is_visible}
      />
    </div>
  );
};

interface EditorContentProps {
  project_id: string;
  path: string;
  is_visible: boolean;
  chat_width: number;
  chatState?: ChatState;
  component: { Editor?; redux_name?: string };
  // if deleted, when
  deleted?: number;
}

const EditorContent: React.FC<EditorContentProps> = ({
  deleted,
  project_id,
  path,
  chat_width,
  is_visible,
  chatState,
  component,
}: EditorContentProps) => {
  const editor_container_ref = useRef<any>(null);

  if (deleted) {
    return <DeletedFile project_id={project_id} path={path} time={deleted} />;
  }

  // Render this here, since it is used in multiple places below.
  const editor = (
    <Editor
      project_id={project_id}
      path={path}
      is_visible={is_visible}
      component={component}
    />
  );

  let content: React.JSX.Element;
  if (chatState == "external") {
    // 2-column layout with chat
    content = (
      <div
        style={{
          position: "absolute",
          height: "100%",
          width: "100%",
          display: "flex",
        }}
        ref={editor_container_ref}
      >
        <div
          style={{
            flex: 1,
            overflow: "hidden",
            height: "100%",
            width: "100%",
          }}
        >
          {editor}
        </div>
        <DragBar
          editor_container_ref={editor_container_ref}
          project_id={project_id}
          path={path}
        />
        <div
          style={{
            position: "relative",
            flexBasis: `${chat_width * 100}%`,
          }}
        >
          <SideChat
            style={{ position: "absolute" }}
            project_id={project_id}
            path={chatMetaFile(path)}
          />
        </div>
      </div>
    );
  } else {
    // just the editor
    content = (
      <div
        className="smc-vfill"
        style={{ position: "absolute", height: "100%", width: "100%" }}
      >
        {editor}
      </div>
    );
  }

  return content;
};

interface DragBarProps {
  project_id: string;
  path: string;
  editor_container_ref;
}

const DragBar: React.FC<DragBarProps> = (props: DragBarProps) => {
  const { project_id, path, editor_container_ref } = props;
  const nodeRef = useRef<any>({});
  const draggable_ref = useRef<any>(null);

  const reset = () => {
    if (draggable_ref.current == null) {
      return;
    }
    /* This is ugly and dangerous, but I don't know any other way to
       reset the state of the bar, so it fits back into our flex
       display model, besides writing something like the Draggable
       component from scratch for our purposes. For now, this will do: */
    if (draggable_ref.current?.state != null) {
      draggable_ref.current.state.x = 0;
    }
    $(draggable_ref.current).css("transform", "");
  };

  const handle_drag_bar_stop = (_, ui) => {
    const clientX = ui.node.offsetLeft + ui.x + $(ui.node).width() + 2;
    drag_stop_iframe_enable();
    const elt = $(editor_container_ref.current);
    const offset = elt.offset();
    if (offset == null) return;
    const elt_width = elt.width();
    if (!elt_width) return;
    const width = 1 - (clientX - offset.left) / elt_width;
    reset();
    redux.getProjectActions(project_id).set_chat_width({ path, width });
  };

  return (
    <Draggable
      nodeRef={nodeRef}
      position={{ x: 0, y: 0 }}
      ref={draggable_ref}
      axis="x"
      onStop={handle_drag_bar_stop}
      onStart={drag_start_iframe_disable}
      defaultClassNameDragging={"cc-vertical-drag-bar-dragging"}
    >
      <div
        ref={nodeRef}
        className="cc-vertical-drag-bar"
        style={IS_TOUCH ? { width: "12px" } : undefined}
      >
        {" "}
      </div>
    </Draggable>
  );
};
