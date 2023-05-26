import { debounce } from "lodash";
import { CSSProperties, useCallback, useEffect, useRef } from "react";
import { redux, useActions, useRedux, useTypedRedux } from "../app-framework";
import { IS_MOBILE } from "../feature";
import { user_activity } from "../tracker";
import { A, Icon, Loading, SearchInput } from "../components";
import { Button, Tooltip } from "antd";
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
            maxHeight: "50vh",
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
        placeholder={"Filter messages (use /re/ for regexp)..."}
        default_value={search}
        on_change={debounce((search) => actions.setState({ search }), 500)}
        style={{ margin: 0 }}
      />
      <div
        className="smc-vfill"
        style={{
          backgroundColor: "#fff",
          paddingLeft: "15px",
          flex: 1,
          margin: "5px 0",
        }}
      >
        <ChatLog
          project_id={project_id}
          path={path}
          scrollToBottomRef={scrollToBottomRef}
          show_heads={false}
        />
      </div>

      <div>
        {input.trim() && (
          <div>
            <Tooltip title="Send message (shift+enter)">
              <Button
                style={{ margin: "5px 0 5px 5px" }}
                onClick={() => {
                  sendChat();
                  user_activity("side_chat", "send_chat", "click");
                }}
                disabled={!input?.trim() || is_uploading}
                type="primary"
              >
                <Icon name="paper-plane" />
                Send Message (shift+enter)
              </Button>
            </Tooltip>
            {/*
            This seems hard to implement with our current  model and
            below doesn't work
            <Button
              style={{ marginLeft: "5px" }}
              onClick={() => {
                actions.delete_draft(0);
                actions.set_input('');
              }}
            >
              Cancel
            </Button> */}
          </div>
        )}
        <ChatInput
          autoFocus
          cacheId={`${path}${project_id}-new`}
          input={input}
          on_send={() => {
            sendChat();
            user_activity("side_chat", "send_chat", "keyboard");
          }}
          style={{ height: INPUT_HEIGHT }}
          height={INPUT_HEIGHT}
          onChange={(value) => actions.set_input(value)}
          submitMentionsRef={submitMentionsRef}
          syncdb={actions.syncdb}
          date={0}
          editBarStyle={{ overflow: "none" }}
        />
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
      You can{" "}
      {redux.getStore("projects").hasOpenAI(project_id) && (
        <>put @chatgpt in any message to get a response from ChatGPT, </>
      )}
      <A href="https://github.com/sagemathinc/cocalc/discussions">
        join a discussion on GitHub
      </A>
      , and add more collaborators to this project below.
      <AddCollaborators project_id={project_id} autoFocus where="side-chat" />
      <div style={{ color: "#666" }}>
        (Collaborators have access to all files in this project.)
      </div>
    </div>
  );
}

function CollabList({ project, addCollab, actions }) {
  const hasOpenAI = redux
    .getStore("projects")
    .hasOpenAI(project.get("project_id"));
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
        {hasOpenAI && <>@ChatGPT, </>}
        <ProjectUsers
          project={project}
          none={<span>{hasOpenAI ? "add" : "Add"} people to work with...</span>}
        />
      </span>
    </div>
  );
}
