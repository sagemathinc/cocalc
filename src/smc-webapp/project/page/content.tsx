/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import Draggable from "react-draggable";
import { hidden_meta_file } from "smc-util/misc";
import { IS_MOBILE, IS_TOUCH } from "../../feature";
import {
  React,
  ReactDOM,
  project_redux_name,
  redux,
  useForceUpdate,
  useMemo,
  useTypedRedux,
  useRef,
} from "../../app-framework";
import { Loading } from "../../r_misc";
import { editor_id } from "../utils";
import {
  drag_start_iframe_disable,
  drag_stop_iframe_enable,
} from "../../misc-page";
import { webapp_client } from "../../webapp-client";
import { DeletedFile } from "../deleted-file";
import { KioskModeBanner } from "../../app/kiosk-mode-banner";
import { Explorer } from "../explorer";
import { ProjectNew } from "../new";
import { ProjectInfo } from "../info";
import { ProjectLog } from "../history";
import { ProjectSearch } from "../search/search";
import { ProjectSettings } from "../settings";
import { SideChat } from "../../chat/side-chat";
import { log_file_open } from "../open-file";

// Default width of chat window as a fraction of the
// entire window.
const DEFAULT_CHAT_WIDTH = IS_MOBILE ? 0.5 : 0.3;

const MAIN_STYLE: React.CSSProperties = {
  overflowX: "hidden",
  flex: 1,
  height: 0,
  position: "relative",
} as const;

interface Props {
  project_id: string; // the project
  tab_name: string; // e.g., 'files', 'new', 'log', 'search', 'settings', or 'editor-<path>'
  is_visible: boolean; // if false, editor is in the DOM (so all subtle DOM state preserved) but it is not visible on screen.
}

export const Content: React.FC<Props> = ({
  project_id,
  tab_name,
  is_visible,
}) => {
  // The className below is so we always make this div the remaining height.
  // The overflowY is hidden for editors (which don't scroll), but auto
  // otherwise, since some tabs (e.g., settings) *do* need to scroll. See
  // https://github.com/sagemathinc/cocalc/pull/4708.
  return (
    <div
      style={{
        ...MAIN_STYLE,
        ...(!is_visible ? { display: "none" } : undefined),
        ...{ overflowY: tab_name.startsWith("editor-") ? "hidden" : "auto" },
      }}
      className={"smc-vfill"}
    >
      <TabContent
        project_id={project_id}
        tab_name={tab_name}
        is_visible={is_visible}
      />
    </div>
  );
};

interface TabContentProps {
  project_id: string;
  tab_name: string;
  is_visible: boolean;
}

export const TabContent: React.FC<TabContentProps> = ({
  project_id,
  tab_name,
  is_visible,
}) => {
  const open_files =
    useTypedRedux({ project_id }, "open_files") ?? Map<string, any>();
  const fullscreen = useTypedRedux("page", "fullscreen");

  const path = useMemo(() => {
    if (tab_name.startsWith("editor-")) {
      return tab_name.slice("editor-".length);
    } else {
      return "";
    }
  }, [tab_name]);

  // show the kiosk mode banner instead of anything besides a file editor
  if (fullscreen === "kiosk" && !tab_name.startsWith("editor-")) {
    return <KioskModeBanner />;
  }

  // TODO: this name thing will disappear when the components
  // that use it below switch to hooks...
  const name = project_redux_name(project_id);

  switch (tab_name) {
    case "files":
      return (
        <Explorer
          name={name}
          project_id={project_id}
          actions={redux.getProjectActions(project_id)}
        />
      );
    case "new":
      return (
        <ProjectNew
          name={name}
          project_id={project_id}
          actions={redux.getProjectActions(project_id)}
        />
      );
    case "log":
      return <ProjectLog project_id={project_id} />;
    case "search":
      return <ProjectSearch project_id={project_id} />;
    case "settings":
      return (
        <ProjectSettings
          project_id={project_id}
          name={name}
          group={redux.getStore("projects").get_my_group(project_id)}
        />
      );
    case "info":
      return <ProjectInfo name={name} project_id={project_id} />;
    default:
      // check for "editor-[filename]"
      if (!tab_name.startsWith("editor-")) {
        return <Loading theme="medium" />;
      } else {
        return (
          <EditorContent
            project_id={project_id}
            path={path}
            is_visible={is_visible}
            is_chat_open={open_files.getIn([path, "is_chat_open"])}
            chat_width={
              open_files.getIn([path, "chat_width"]) ?? DEFAULT_CHAT_WIDTH
            }
            component={open_files.getIn([path, "component"]) ?? {}}
          />
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

const Editor: React.FC<EditorProps> = ({
  path,
  project_id,
  is_visible,
  component,
}) => {
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
  is_chat_open?: boolean;
  component: { Editor?; redux_name?: string };
}

const EditorContent: React.FC<EditorContentProps> = ({
  project_id,
  path,
  chat_width,
  is_visible,
  is_chat_open,
  component,
}) => {
  const editor_container_ref = useRef(null);
  const force_update = useForceUpdate();

  if (webapp_client.file_client.is_deleted(path, project_id)) {
    return (
      <DeletedFile
        project_id={project_id}
        path={path}
        onOpen={() => {
          log_file_open(project_id, path);
          force_update();
        }}
      />
    );
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

  let content: JSX.Element;
  if (is_chat_open) {
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
            flexBasis: `${chat_width * 100}%`,
            position: "relative",
          }}
        >
          <SideChat
            project_id={project_id}
            path={hidden_meta_file(path, "sage-chat")}
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

const DragBar: React.FC<DragBarProps> = ({
  project_id,
  path,
  editor_container_ref,
}) => {
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
    $(ReactDOM.findDOMNode(draggable_ref.current)).css("transform", "");
  };

  const handle_drag_bar_stop = (_, ui) => {
    const clientX = ui.node.offsetLeft + ui.x + $(ui.node).width() + 2;
    drag_stop_iframe_enable();
    const elt = $(ReactDOM.findDOMNode(editor_container_ref.current));
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
      ref={draggable_ref}
      axis="x"
      onStop={handle_drag_bar_stop}
      onStart={drag_start_iframe_disable}
      defaultClassNameDragging={"cc-vertical-drag-bar-dragging"}
    >
      <div
        className="cc-vertical-drag-bar"
        style={IS_TOUCH ? { width: "12px" } : undefined}
      >
        {" "}
      </div>
    </Draggable>
  );
};
