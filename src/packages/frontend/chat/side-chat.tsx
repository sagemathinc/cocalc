import { debounce } from "lodash";
import { CSSProperties, useCallback, useEffect, useRef } from "react";
import { redux, useActions, useRedux, useTypedRedux } from "../app-framework";
import { IS_MOBILE } from "../feature";
import { user_activity } from "../tracker";
import { A, Icon, Loading, SearchInput } from "../components";
import { Button } from "antd";
import { ProjectUsers } from "../projects/project-users";
import { AddCollaborators } from "../collaborators";
import { markChatAsReadIfUnseen, INPUT_HEIGHT } from "./utils";
import { ChatLog } from "./chat-log";
import ChatInput from "./input";
import VideoChatButton from "./video/launch-button";
import type { ChatActions } from "./actions";

interface Props {
  project_id: string;
  path: string;
  style?: CSSProperties;
}

export default function SideChat({ project_id, path, style }: Props) {
  const actions = useActions(project_id, path);
  const messages = useRedux(["messages"], project_id, path);
  const input: string = useRedux(["input"], project_id, path);
  const search: string = useRedux(["search"], project_id, path);
  const addCollab: boolean = useRedux(["add_collab"], project_id, path);
  const is_uploading = useRedux(["is_uploading"], project_id, path);
  const project_map = useTypedRedux("projects", "project_map");
  const project = project_map?.get(project_id);
  const scrollToBottomRef = useRef<any>(null);
  const submitMentionsRef = useRef<Function>();

  const markAsRead = useCallback(() => {
    markChatAsReadIfUnseen(project_id, path);
  }, [project_id, path]);

  // The act of opening/displaying the chat marks it as seen...
  // since this happens when the user shows it.
  useEffect(() => {
    markAsRead();
  }, []);

  useEffect(() => {
    scrollToBottomRef.current?.();
  }, [messages]);

  const sendChat = useCallback(() => {
    const value = submitMentionsRef.current?.();
    actions.send_chat(value);
    scrollToBottomRef.current?.(true);
  }, [actions]);

  if (messages == null) {
    return <Loading />;
  }

  // WARNING: making autofocus true would interfere with chat and terminals
  // -- where chat and terminal are both focused at same time sometimes
  // (esp on firefox).

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#efefef",
        ...style,
      }}
      onMouseMove={markAsRead}
      onFocus={() => {
        // Remove any active key handler that is next to this side chat.
        // E.g, this is critical for taks lists...
        redux.getActions("page").erase_active_key_handler();
      }}
    >
      {!IS_MOBILE && project != null && (
        <div
          style={{
            margin: "0 5px",
            paddingTop: "5px",
            maxHeight: "25%",
            overflow: "auto",
            borderBottom: "1px solid lightgrey",
          }}
        >
          <VideoChatButton
            style={{ float: "right", marginTop: "-5px" }}
            project_id={project_id}
            path={path}
            sendChat={(value) => {
              const actions = redux.getEditorActions(
                project_id,
                path
              ) as ChatActions;
              actions.send_chat(value);
            }}
          />{" "}
          <CollabList
            addCollab={addCollab}
            project={project}
            actions={actions}
          />
          <AddChatCollab addCollab={addCollab} project_id={project_id} />
        </div>
      )}
      <SearchInput
        placeholder={"Search messages (use /re/ for regexp)..."}
        default_value={search}
        on_change={debounce((search) => actions.setState({ search }), 500)}
        style={{ margin: 0 }}
      />
      <div
        className="smc-vfill"
        style={{ backgroundColor: "#fff", paddingLeft: "15px", flex: 1 }}
      >
        <ChatLog
          project_id={project_id}
          path={path}
          scrollToBottomRef={scrollToBottomRef}
          show_heads={false}
        />
      </div>
      <div
        style={{
          marginTop: "auto",
          padding: "5px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", flex: 1 }}>
          <ChatInput
            cacheId={`${path}${project_id}-new`}
            input={input}
            on_send={() => {
              sendChat();
              user_activity("side_chat", "send_chat", "keyboard");
            }}
            height={INPUT_HEIGHT}
            onChange={(value) => actions.set_input(value)}
            submitMentionsRef={submitMentionsRef}
            syncdb={actions.syncdb}
            date={0}
            editBarStyle={{ overflow: "none" }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: INPUT_HEIGHT /* yes, to make it square */,
            }}
          >
            <Button
              style={{ flex: 1, marginLeft: "5px" }}
              onClick={() => {
                sendChat();
                user_activity("side_chat", "send_chat", "click");
              }}
              disabled={!input?.trim() || is_uploading}
              type="primary"
            >
              <Icon name="chevron-circle-right" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddChatCollab({ addCollab, project_id }) {
  if (!addCollab) {
    return null;
  }
  return (
    <div>
      <A href="https://github.com/sagemathinc/cocalc/discussions">
        Join a discussion about CoCalc on GitHub
      </A>{" "}
      or add collaborators to this project:
      <AddCollaborators project_id={project_id} autoFocus />
      <div style={{ color: "#666" }}>
        (Collaborators have access to all files in this project.)
      </div>
    </div>
  );
}

function CollabList({ project, addCollab, actions }) {
  return (
    <div
      style={
        !addCollab
          ? {
              maxHeight: "1.7em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              cursor: "pointer",
            }
          : { cursor: "pointer" }
      }
      onClick={() => actions.setState({ add_collab: !addCollab })}
    >
      <div style={{ width: "16px", display: "inline-block" }}>
        <Icon name={addCollab ? "caret-down" : "caret-right"} />
      </div>
      <span style={{ color: "#777", fontSize: "10pt" }}>
        <ProjectUsers
          project={project}
          none={<span>Add people to work with...</span>}
        />
      </span>
    </div>
  );
}
