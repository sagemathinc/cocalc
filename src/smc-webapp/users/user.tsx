//TODO: Make useable without passing in user_map
let _User = (User = rclass({
  displayName: "User",

  propTypes: {
    account_id: rtypes.string.isRequired,
    user_map: rtypes.immutable.Map,
    last_active: rtypes.oneOfType([rtypes.object, rtypes.number]),
    name: rtypes.string
  }, // if not given, is got from store -- will be truncated to 50 characters in all cases.

  shouldComponentUpdate(nextProps) {
    if (this.props.account_id !== nextProps.account_id) {
      return true;
    }
    const n =
      nextProps.user_map != null
        ? nextProps.user_map.get(this.props.account_id)
        : undefined;
    if (n == null) {
      return true; // don't know anything about user yet, so just update.
    }
    if (
      !n.equals(
        this.props.user_map != null
          ? this.props.user_map.get(this.props.account_id)
          : undefined
      )
    ) {
      return true; // something about the user changed in the user_map, so updated.
    }
    if (this.props.last_active !== nextProps.last_active) {
      return true; // last active time changed, so update
    }
    if (this.props.show_original !== nextProps.show_original) {
      return true;
    }
    if (this.props.name !== nextProps.name) {
      return true;
    }
    return false;
  }, // same so don't update

  render_last_active() {
    if (this.props.last_active) {
      return (
        <span>
          {" "}
          (<TimeAgo date={this.props.last_active} />)
        </span>
      );
    }
  },

  render_original(info) {
    let full_name;
    if (info.first_name && info.last_name) {
      full_name = info.first_name + " " + info.last_name;
    } else if (info.first_name) {
      full_name = info.first_name;
    } else if (info.last_name) {
      full_name = info.last_name;
    } else {
      full_name = "";
    }

    if (this.props.show_original && full_name !== this.props.name) {
      return (
        <Tip
          placement="top"
          title="User Name"
          tip="The name this user has given their account."
        >
          <span style={{ color: "#666" }}> ({full_name})</span>
        </Tip>
      );
    }
  },

  name(info) {
    return misc.trunc_middle(
      this.props.name != null
        ? this.props.name
        : `${info.first_name} ${info.last_name}`,
      50
    );
  },

  render() {
    if (this.props.user_map == null || this.props.user_map.size === 0) {
      return <span>Loading...</span>;
    }
    let info =
      this.props.user_map != null
        ? this.props.user_map.get(this.props.account_id)
        : undefined;
    if (info == null) {
      if (!misc.is_valid_uuid_string(this.props.account_id)) {
        return <span>Unknown User {this.props.account_id}</span>;
      }
      actions.fetch_non_collaborator(this.props.account_id);
      return <span>Loading...</span>;
    } else {
      info = info.toJS();
      return (
        <span>
          {this.name(info)}
          {this.render_original(info)}
          {this.render_last_active()}
        </span>
      );
    }
  }
}));

export { _User as User };
