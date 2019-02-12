/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const file_use_style = {
  border: "1px solid #aaa",
  cursor: "pointer",
  padding: "8px"
};

const FileUseInfo = rclass({
  displayName: "FileUse",

  propTypes: {
    info: rtypes.object.isRequired,
    account_id: rtypes.string.isRequired,
    user_map: rtypes.object.isRequired,
    project_map: rtypes.object.isRequired,
    redux: rtypes.object,
    cursor: rtypes.bool
  },

  shouldComponentUpdate(nextProps) {
    const a =
      this.props.info !== nextProps.info ||
      this.props.cursor !== nextProps.cursor ||
      this.props.user_map !== nextProps.user_map ||
      this.props.project_map !== nextProps.project_map;
    return a;
  },

  render_users() {
    let user;
    if (this.info.users != null) {
      const v = [];
      // only list users who have actually done something aside from mark read/seen this file
      const users = (() => {
        const result = [];
        for (user of Array.from(this.info.users)) {
          if (user.last_edited) {
            result.push(user);
          }
        }
        return result;
      })();
      for (user of Array.from(users.slice(0, MAX_USERS))) {
        v.push(
          <User
            key={user.account_id}
            account_id={user.account_id}
            name={user.account_id === this.props.account_id ? "You" : undefined}
            user_map={this.props.user_map}
            last_active={user.last_edited}
          />
        );
      }
      return r_join(v);
    }
  },

  render_last_edited() {
    if (this.info.last_edited) {
      return (
        <span key="last_edited">
          was edited <TimeAgo date={this.info.last_edited} />
        </span>
      );
    }
  },

  open(e) {
    if (e != null) {
      e.preventDefault();
    }
    return open_file_use_entry(this.info, this.props.redux);
  },

  render_path() {
    let { name, ext } = misc.separate_file_extension(this.info.path);
    name = misc.trunc_middle(name, TRUNCATE_LENGTH);
    ext = misc.trunc_middle(ext, TRUNCATE_LENGTH);
    //  style={if @info.is_unread then {fontWeight:'bold'}}
    return (
      <span>
        <span style={{ fontWeight: this.info.is_unread ? "bold" : "normal" }}>
          {name}
        </span>
        <span style={{ color: !this.props.mask ? "#999" : undefined }}>
          {ext === "" ? "" : `.${ext}`}
        </span>
      </span>
    );
  },

  render_project() {
    return (
      <em key="project">
        {misc.trunc(
          __guard__(this.props.project_map.get(this.info.project_id), x =>
            x.get("title")
          ),
          TRUNCATE_LENGTH
        )}
      </em>
    );
  },

  render_what_is_happening() {
    if (this.info.users == null) {
      return this.render_last_edited();
    }
    if (this.info.show_chat) {
      return <span>discussed by </span>;
    }
    return <span>edited by </span>;
  },

  render_action_icon() {
    if (this.info.show_chat) {
      return <Icon name="comment" />;
    } else {
      return <Icon name="edit" />;
    }
  },

  render_type_icon() {
    return <FileIcon filename={this.info.path} />;
  },

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
});

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
