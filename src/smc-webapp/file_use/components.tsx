import * as React from "react";
import { redux, rclass, rtypes } from "../app-framework";
import { Button, Col, Row } from "react-bootstrap";

const misc = require("../../smc-util/misc");
const editor = require("../editor");
const {
  r_join,
  Icon,
  Loading,
  LoginLink,
  SearchInput,
  TimeAgo
} = require("../r_misc");
const { User } = require("../users");
const $ = (window as any).$;

// Magic constants:

// Maximum number of distinct user names to show in a notification
const MAX_USERS = 5;
// How long after opening log to mark all seen
const MARK_SEEN_TIME_S = 3;
// Length to truncate project title and filename to.
const TRUNCATE_LENGTH = 50;
// Number of notifications to show if "Show All" isn't clicked
const SHORTLIST_LENGTH = 40;

const file_use_style = {
  border: "1px solid #aaa",
  cursor: "pointer",
  padding: "8px"
};

interface FileUseProps {
  info: any;
  account_id: string;
  user_map?: any;
  project_map: any;
  redux?: any;
  cursor?: boolean;
  mask?: any;
}

interface FileUseState {}

class FileUse extends React.Component<FileUseProps, FileUseState> {
  private info: any;

  shouldComponentUpdate(nextProps: FileUseProps) {
    return (
      this.props.info != nextProps.info ||
      this.props.cursor != nextProps.cursor ||
      this.props.user_map != nextProps.user_map ||
      this.props.project_map != nextProps.project_map
    );
  }

  render_users() {
    if (this.info.users != null) {
      // only list users who have actually done something aside from mark read/seen this file
      let users = this.info.users
        .filter(user => user.last_edited)
        .slice(0, MAX_USERS);
      users.map(user => {
        return (
          <User
            key={user.account_id}
            account_id={user.account_id}
            name={user.account_id === this.props.account_id ? "You" : undefined}
            user_map={this.props.user_map}
            last_active={user.last_edited}
          />
        );
      });
      return r_join(users);
    }
  }

  render_last_edited() {
    if (this.info.last_edited != null) {
      return (
        <span key="last_edited">
          {" "}
          was edited <TimeAgo date={this.info.last_edited} />
        </span>
      );
    }
    return undefined;
  }

  open = (e: any) => {
    if (e == null) {
      return;
    }
    e.preventDefault();
    open_file_use_entry(this.info, this.props.redux);
  };

  render_path() {
    let { name, ext } = misc.separate_file_extension(this.info.path);
    name = misc.trunc_middle(name, TRUNCATE_LENGTH);
    ext = misc.trunc_middle(ext, TRUNCATE_LENGTH);
    // style={if @info.is_unread then {fontWeight:'bold'}}
    return (
      <span>
        <span style={{ fontWeight: this.info.is_unread ? "bold" : "normal" }}>
          {name}
        </span>
        <span style={{ color: !this.props.mask ? "#999" : undefined }}>
          {ext === "" ? "" : `.${ext}`}}
        </span>
      </span>
    );
  }

  render_project() {
    const title = this.props.project_map.getIn([this.info.project_id, "title"]);
    return <em key="project">{misc.trunc(title, TRUNCATE_LENGTH)}</em>;
  }

  render_what_is_happening() {
    if (this.info.users == null) {
      return this.render_last_edited();
    }
    if (this.info.show_chat != null) {
      return <span>discussed by </span>;
    }
    return <span>edited by </span>;
  }

  render_action_icon() {
    if (this.info.show_chat) {
      return <Icon name="comment" />;
    }
    return <Icon name="edit" />;
  }

  render_type_icon() {
    return <FileIcon filename={this.info.path} />;
  }
  render() {
    this.info = this.props.info.toJS();
    const style = misc.copy(file_use_style);
    if (this.info.notify) {
      style.background = "#ffffea"; // very light yellow
    } else {
      style.background = this.info.is_unread ? "#f4f4f4" : "#fefefe";
    }
    if (this.props.cursor) {
      misc.merge(style, { background: "#08c", color: "white" });
    }
    return (
      <div style={style} onClick={this.open}>
        <Row>
          <Col key="action" sm={1} style={{ fontSize: "14pt" }}>
            {this.render_action_icon()}
          </Col>
          <Col key="desc" sm={10}>
            {this.render_path()} in {this.render_project()}{" "}
            {this.render_what_is_happening()} {this.render_users()}
          </Col>
          <Col key="type" sm={1} style={{ fontSize: "14pt" }}>
            {this.render_type_icon()}
          </Col>
        </Row>
      </div>
    );
  }
}

interface FileUseViewerProps {
  redux: any;
  file_use_list?: any;
  user_map?: any;
  project_map?: any;
  account_id: string;
}

interface FileUseViewerState {
  search: string;
  cursor: number;
  show_all: boolean;
}

class FileUseViewer extends React.Component<
  FileUseViewerProps,
  FileUseViewerState
> {
  private _num_missing?: number;
  private _visible_list: any[];
  constructor(props, context) {
    super(props, context);
    this.state = {
      search: "",
      cursor: 0,
      show_all: false
    };
  }

  render_search_box() {
    return (
      <span key="search_box" className="smc-file-use-notifications-search">
        <SearchInput
          autoFocus={true}
          placeholder="Search..."
          default_value={this.state.search}
          on_change={value =>
            this.setState({ search: value, cursor: 0, show_all: false })
          }
          on_submit={this.open_selected}
          on_escape={before => {
            if (!before) {
              redux.getActions("page").toggle_show_file_use();
              this.setState({ cursor: 0, show_all: false });
            }
          }}
          on_up={() =>
            this.setState({ cursor: Math.max(0, this.state.cursor - 1) })
          }
          on_down={() =>
            this.setState({
              cursor: Math.max(
                0,
                Math.min(
                  (this._visible_list != null ? this._visible_list.length : 0) -
                    1,
                  this.state.cursor + 1
                )
              )
            })
          }
        />
      </span>
    );
  }

  click_mark_all_read = () => {
    redux.getActions("file_use").mark_all("read");
    redux.getActions("page").toggle_show_file_use();
  };

  render_mark_all_read_button() {
    return (
      <Button key="mark_all_read_button" onClick={this.click_mark_all_read}>
        <Icon name="check-square" /> Mark All Read
      </Button>
    );
  }

  open_selected = () =>
    open_file_use_entry(
      this._visible_list && this._visible_list[this.state.cursor]
        ? this._visible_list[this.state.cursor].toJS()
        : undefined,
      this.props.redux
    );

  render_list() {
    let v: any[] = this.props.file_use_list.toArray();
    if (this.state.search) {
      const s = misc.search_split(this.state.search.toLowerCase());
      v = v.filter(x => misc.search_match(x.get("search"), s));
    }
    if (!this.state.show_all) {
      this._num_missing = Math.max(0, v.length - SHORTLIST_LENGTH);
      v = v.slice(0, SHORTLIST_LENGTH);
    }
    this._visible_list = v;
    const r: any[] = [];
    for (let i = 0; i < v.length; i++) {
      const info = v[i];
      r.push(
        <FileUse
          key={`file-use-${i}`}
          cursor={i === this.state.cursor}
          redux={this.props.redux}
          info={info}
          account_id={this.props.account_id}
          user_map={this.props.user_map}
          project_map={this.props.project_map}
        />
      );
    }
    return r;
  }

  render_show_all() {
    if (this._num_missing) {
      return (
        <Button
          key="show_all"
          onClick={e => {
            e.preventDefault();
            this.setState({ show_all: true });
          }}
        >
          Show {this._num_missing} More
        </Button>
      );
    }
  }

  render_show_less() {
    const n = this._visible_list.length - SHORTLIST_LENGTH;
    if (n > 0)
      return (
        <Button
          key="show_less"
          onClick={e => {
            e.preventDefault();
            this.setState({ show_all: false });
          }}
        >
          Show {n} Less
        </Button>
      );
  }

  render_toggle_all() {
    return (
      <div key="toggle_all" style={{ textAlign: "center", marginTop: "2px" }}>
        {this.state.show_all ? this.render_show_less() : this.render_show_all()}
      </div>
    );
  }

  render() {
    return (
      <div className={"smc-file-use-viewer"}>
        <Row key="top">
          <Col sm={7}>{this.render_search_box()}</Col>
          <Col sm={5}>
            <div style={{ float: "right" }}>
              {this.render_mark_all_read_button()}
            </div>
          </Col>
        </Row>
        {this.render_list()}
        {this.render_toggle_all()}
      </div>
    );
  }
}

interface FileIconProps {
  filename: string;
}

class FileIcon extends React.Component<FileIconProps> {
  render() {
    const ext = misc.filename_extension_notilde(this.props.filename);
    return <Icon name={editor.file_icon_class(ext)} />;
  }
}

export interface FileUsePageProps {
  redux: any;
  file_use?: any;
  user_map?: any;
  project_map?: any;
  get_sorted_file_use_list2: any;
}

export const FileUsePage = rclass<FileUsePageProps>(
  class FileUsePageComponent extends React.Component<FileUsePageProps> {
    private redux: any;
    public static reduxProps = {
      file_use: {
        file_use: rtypes.immutable,
        get_sorted_file_use_list2: rtypes.func
      },
      users: { user_map: rtypes.immutable },
      projects: { project_map: rtypes.immutable }
    };

    public static displayName = "FileUsePage";

    componentDidMount() {
      setTimeout(
        () => this.redux.getActions("file_use").mark_all("seen"),
        MARK_SEEN_TIME_S * 1000
      );
      $(document).on("click", notification_list_click_handler);
    }

    componentWillUnmount() {
      $(document).off("click", notification_list_click_handler);
    }

    render() {
      const redux = this.props.redux;
      let account_id: string | undefined = undefined;
      if (
        this.props.redux != null &&
        this.props.redux.getStore("account") != null
      ) {
        account_id = redux.getStore("account").get_account_id();
      }
      if (
        this.props.file_use == null ||
        this.props.redux == null ||
        this.props.user_map == null ||
        this.props.project_map == null ||
        account_id == null
      ) {
        const account_store = this.props.redux.getStore("account");
        if (
          account_store != null &&
          account_store.get_user_type() === "public"
        ) {
          return <LoginLink />;
        } else {
          return <Loading />;
        }
      }
      const file_use_list = this.props.get_sorted_file_use_list2();
      return (
        <FileUseViewer
          redux={this.props.redux}
          file_use_list={file_use_list}
          user_map={this.props.user_map}
          project_map={this.props.project_map}
          account_id={account_id}
        />
      );
    }
  }
);

function notification_list_click_handler(e) {
  e.preventDefault();
  const target = $(e.target);
  if (
    target.parents(".smc-file-use-viewer").length ||
    target.hasClass("btn") ||
    target.parents("button").length ||
    target.parents("a").attr("role") == "button" ||
    target.attr("role") == "button"
  ) {
    return;
  }
  // timeout is to give plenty of time for the click to register with react's event handler, so fiee opens
  setTimeout(redux.getActions("page").toggle_show_file_use, 100);
}

function open_file_use_entry(info: any, redux: any) {
  if (
    redux == null ||
    info == null ||
    info.project_id == null ||
    info.path == null
  ) {
    return;
  }
  // mark this file_use entry read
  redux.getActions("file_use").mark_file(info.project_id, info.path, "read");
  redux.getActions("page").toggle_show_file_use();
  // open the file
  (require as any).ensure([], () =>
    redux.getProjectActions(info.project_id).open_file({
      path: info.path,
      foreground: true,
      foreground_project: true,
      chat: info.show_chat
    })
  );
}
``;
