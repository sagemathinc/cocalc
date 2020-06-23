import { debounce } from "lodash";
import { DISCORD_INVITE } from "smc-util/theme";

import {
  redux,
  React,
  useActions,
  useEffect,
  useRedux,
  useRef,
} from "../app-framework";
import { user_activity } from "../tracker";
import { A, Icon, Loading, SearchInput } from "../r_misc";
import { Button } from "../antd-bootstrap";
import { ProjectUsers } from "../projects/project-users";
//import { AddCollaborators } from "../collaborators/add-to-project";
const { AddCollaborators } = require("../collaborators/add-to-project");

import {
  mark_chat_as_read_if_unseen,
  scroll_to_bottom,
  INPUT_HEIGHT,
} from "./utils";
import { ChatLog } from "./chat-log";
import { ChatInput } from "./input";

interface Props {
  project_id: string;
  path: string;
}

export const SideChat: React.FC<Props> = ({ project_id, path }: Props) => {
  const actions = useActions(project_id, path);

  const messages = useRedux(["messages"], project_id, path);
  const input: string = useRedux(["input"], project_id, path);
  const search: string = useRedux(["search"], project_id, path);
  const add_collab: boolean = useRedux(["add_collab"], project_id, path);
  const is_uploading = useRedux(["is_uploading"], project_id, path);

  const project_map = useRedux(["projects", "project_map"]);

  const log_container_ref = useRef(null);

  const submitMentionsRef = useRef<Function>();

  // The act of opening/displaying the chat marks it as seen...
  // since this happens when the user shows it.
  useEffect(() => {
    mark_as_read();
  }, []);

  useEffect(() => {
    scroll_to_bottom(log_container_ref);
  }, [messages]);

  function mark_as_read() {
    mark_chat_as_read_if_unseen(project_id, path);
  }

  function send_chat(): void {
    const value = submitMentionsRef.current?.();
    actions.send_chat(value);
    scroll_to_bottom(log_container_ref, true);
  }

  function render_add_collab() {
    if (!add_collab) {
      return;
    }
    const project = project_map?.get(project_id);
    if (project == null) {
      return;
    }
    const allow_urls = redux
      .getStore("projects")
      .allow_urls_in_emails(project_id);
    return (
      <div>
        Stream your screen or chat <A href={DISCORD_INVITE}>using Discord</A>.
        <div>Add people to this project below:</div>
        <AddCollaborators
          project={project}
          inline={true}
          allow_urls={allow_urls}
        />
        <div style={{ color: "#666", marginTop: "-15px" }}>
          (Anybody you add will see all files in this project.)
        </div>
      </div>
    );
  }

  function render_collab_list() {
    const project = project_map?.get(project_id);
    if (project == null) {
      return;
    }
    return (
      <div
        style={
          !add_collab
            ? {
                maxHeight: "1.7em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }
            : undefined
        }
        onClick={() => actions.setState({ add_collab: !add_collab })}
      >
        <div
          style={{ width: "16px", display: "inline-block", cursor: "pointer" }}
        >
          <Icon name={`caret-${add_collab ? "down" : "right"}`} />
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

  function render_project_users() {
    return (
      <div
        style={{
          margin: "5px 15px",
          maxHeight: "25%",
          overflow: "auto",
          borderBottom: "1px solid lightgrey",
        }}
      >
        {render_collab_list()}
        {render_add_collab()}
      </div>
    );
  }

  function on_focus() {
    // Remove any active key handler that is next to this side chat.
    // E.g, this is critical for taks lists...
    redux.getActions("page").erase_active_key_handler();
  }

  function render_search() {
    return (
      <SearchInput
        placeholder={"Find messages..."}
        default_value={search}
        on_change={debounce((search) => actions.setState({ search }), 500)}
        style={{ margin: 0 }}
      />
    );
  }

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
        position: "absolute",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#efefef",
      }}
      onMouseMove={mark_as_read}
      onFocus={on_focus}
    >
      {render_project_users()}
      {render_search()}
      <div
        className="smc-vfill"
        style={{ backgroundColor: "#fff", paddingLeft: "15px", flex: 1 }}
      >
        <ChatLog
          project_id={project_id}
          path={path}
          windowed_list_ref={log_container_ref}
          show_heads={false}
        />
      </div>
      <div
        style={{
          marginTop: "auto",
          padding: "5px",
          paddingLeft: "15px",
          paddingRight: "15px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", flex: 1 }}>
          <ChatInput
            project_id={project_id}
            path={path}
            input={input}
            on_send={() => {
              send_chat();
              user_activity("side_chat", "send_chat", "keyboard");
            }}
            height={INPUT_HEIGHT}
            onChange={(value) => actions.set_input(value)}
            submitMentionsRef={submitMentionsRef}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: INPUT_HEIGHT /* yes, to make it square */,
            }}
          >
            <div style={{ flex: 1 }} />
            <Button
              style={{ height: INPUT_HEIGHT }}
              onClick={() => {
                send_chat();
                user_activity("side_chat", "send_chat", "click");
              }}
              disabled={!input?.trim() || is_uploading}
              bsStyle="success"
            >
              <Icon name="chevron-circle-right" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
