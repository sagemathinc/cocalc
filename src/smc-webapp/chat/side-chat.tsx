import { Map } from "immutable";
import { debounce } from "lodash";
import { path_split } from "smc-util/misc";
import { DISCORD_INVITE } from "smc-util/theme";

import {
  redux,
  React,
  useActions,
  useEffect,
  useMemo,
  useRedux,
  useRef,
} from "../app-framework";
import { analytics_event } from "../tracker";
import { A, Icon, Loading, SearchInput } from "../r_misc";
import { Button } from "../antd-bootstrap";
import { ProjectUsers } from "../projects/project-users";
//import { AddCollaborators } from "../collaborators/add-to-project";
const { AddCollaborators } = require("../collaborators/add-to-project");

import { mark_chat_as_read_if_unseen, scroll_to_bottom } from "./utils";
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
  const is_uploading = useRedux(["is_uploading"], project_id, path);
  const send_disabled = useMemo(() => input.trim() === "" || is_uploading, [
    input,
    is_uploading,
  ]);
  const search: string = useRedux(["search"], project_id, path);
  const add_collab: boolean = useRedux(["add_collab"], project_id, path);

  const project_map = useRedux(["projects", "project_map"]);
  const user_map = useRedux(["users", "user_map"]);

  // the immutable.Map() default below is because of admins viewing
  //  side chat, where their project_map has no info
  // https://github.com/sagemathinc/cocalc/issues/3669
  const project_users = useMemo(
    () => project_map.getIn([project_id, "users"], Map()),
    ["project_map"]
  );

  const log_container_ref = useRef(null);
  const input_ref = useRef(null);

  const other_settings = useRedux(["account", "other_settings"]);
  const account_id = useRedux(["account", "account_id"]);
  const font_size = useRedux(["account", "font_size"]);

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
    scroll_to_bottom(log_container_ref, true);
    actions.submit_user_mentions();
    actions.send_chat();
    if (input_ref.current != null) {
      // TODO -- looks bad
      (input_ref.current as any).focus();
    }
  }

  function on_clear(): void {
    actions.set_input("");
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
        style={{ backgroundColor: "#fff", paddingLeft: "15px" }}
      >
        <ChatLog
          windowed_list_ref={log_container_ref}
          messages={messages}
          account_id={account_id}
          user_map={user_map}
          project_id={project_id}
          font_size={font_size}
          file_path={path != null ? path_split(path).head : undefined}
          actions={actions}
          show_heads={false}
          search={search}
        />
      </div>
      <div
        style={{
          marginTop: "auto",
          padding: "5px",
          paddingLeft: "15px",
          paddingRight: "15px",
        }}
      >
        <div style={{ display: "flex", height: "6em" }}>
          <div style={{ width: "85%", height: "100%" }}>
            <ChatInput
              project_id={project_id}
              path={path}
              input={input}
              input_ref={input_ref}
              enable_mentions={
                project_users.size > 1
                  ? other_settings.get("allow_mentions")
                  : undefined
              }
              project_users={project_users}
              user_store={redux.getStore("users")}
              on_clear={on_clear}
              on_send={() => {
                if (send_disabled) return;
                send_chat();
                analytics_event("side_chat", "send_chat", "keyboard");
              }}
              on_set_to_last_input={() => actions.set_to_last_input()}
              account_id={account_id}
            />
          </div>
          <Button
            style={{ width: "15%", height: "100%" }}
            onClick={() => {
              send_chat();
              analytics_event("side_chat", "send_chat", "click");
            }}
            disabled={send_disabled}
            bsStyle="success"
          >
            <Icon name="chevron-circle-right" />
          </Button>
        </div>
        <div style={{ color: "#888", padding: "5px" }}>
          Shift+enter to send. Double click to edit. Use{" "}
          <A href="https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/">
            Markdown
          </A>{" "}
          and{" "}
          <A href="https://en.wikibooks.org/wiki/LaTeX/Mathematics">LaTeX</A>.
        </div>
      </div>
    </div>
  );
};
