/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let FileUseController;
let defaultExport = {};
defaultExport.FileUsePage = FileUseController = rclass({
  displayName: "FileUseController",

  reduxProps: {
    file_use: {
      file_use: rtypes.immutable,
      get_sorted_file_use_list2: rtypes.func
    },
    users: {
      user_map: rtypes.immutable
    },
    projects: {
      project_map: rtypes.immutable
    }
  },

  propTypes: {
    redux: rtypes.object
  },

  componentDidMount() {
    setTimeout(
      () => this.actions("file_use").mark_all("seen"),
      MARK_SEEN_TIME_S * 1000
    );
    return $(document).on("click", notification_list_click_handler);
  },

  componentWillUnmount() {
    return $(document).off("click", notification_list_click_handler);
  },

  render() {
    const account_id = __guard__(
      this.props.redux != null
        ? this.props.redux.getStore("account")
        : undefined,
      x => x.get_account_id()
    );
    if (
      this.props.file_use == null ||
      this.props.redux == null ||
      this.props.user_map == null ||
      this.props.project_map == null ||
      account_id == null
    ) {
      if (
        __guard__(this.props.redux.getStore("account"), x1 =>
          x1.get_user_type()
        ) === "public"
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
});
export default defaultExport;

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}


const notification_list_click_handler = function(e) {
    e.preventDefault();
    const target = $(e.target);
    if (target.parents('.smc-file-use-viewer').length || target.hasClass('btn') || target.parents('button').length || (target.parents('a').attr('role') === 'button') || (target.attr('role') === 'button')) {
        return;
    }
    // timeout is to give plenty of time for the click to register with react's event handler, so fiee opens
    return setTimeout(redux.getActions('page').toggle_show_file_use, 100);
};
